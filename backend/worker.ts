import "./bun-polyfill";
import { PaymentProcessor } from "@henrylabs-interview/payments";
import { config } from "./config";
import { readOrderById, type OrderRow } from "./services/orders";
import {
  readOrderTrackingByOrderId,
  updateOrderTracking,
  type OrderTrackingRow,
} from "./services/orderTracking";
import { readMessage, deleteMessage } from "./services/queue";
import { getNumberEncryption } from "./utils/encryption";
import { OrderStatus, Substatus } from "./constants";

const MAX_RETRIES = 80;
const POLL_INTERVAL_MS = 5000;
const QUEUE_VISIBILITY_SECONDS = 30;

const processor = new PaymentProcessor({ apiKey: config.apiKey });
const webhookUrl = `${config.webhookBaseUrl}/api/webhooks`;

async function safeDeleteMessage(msgId: number): Promise<void> {
  try {
    await deleteMessage(msgId);
  } catch (e) {
    console.error("deleteMessage:", e);
  }
}

type PollContext = {
  msgId: number;
  orderId: string;
  tracking: OrderTrackingRow;
  order: OrderRow;
};

/** Fetch one message, load tracking and order; return context or null (caller does not delete). */
async function fetchAndValidateMessage(): Promise<PollContext | null> {
  let message: Awaited<ReturnType<typeof readMessage>> = null;
  try {
    message = await readMessage(QUEUE_VISIBILITY_SECONDS);
  } catch (e) {
    console.error("Queue read error:", e);
    return null;
  }

  if (!message) return null;

  const orderId = message.message?.order_id;
  const msgId = message.msg_id;

  if (!orderId) {
    console.warn("Message missing order_id, deleting");
    await safeDeleteMessage(msgId);
    return null;
  }

  let tracking: OrderTrackingRow | null = null;
  try {
    tracking = await readOrderTrackingByOrderId(orderId);
  } catch (e) {
    console.error(`[${orderId}] readOrderTrackingByOrderId error:`, e);
    return null;
  }

  if (!tracking) {
    console.warn(`[${orderId}] No order_tracking row, deleting message`);
    await safeDeleteMessage(msgId);
    return null;
  }

  if (
    tracking.status === OrderStatus.COMPLETED ||
    tracking.status === OrderStatus.FAILED
  ) {
    await safeDeleteMessage(msgId);
    return null;
  }

  if ((tracking.retry_count ?? 0) >= MAX_RETRIES) {
    await updateOrderTracking(orderId, {
      status: OrderStatus.FAILED,
      error: `Exhausted ${MAX_RETRIES} retries`,
    });
    await safeDeleteMessage(msgId);
    return null;
  }

  let order: OrderRow | null = null;
  try {
    order = await readOrderById(orderId);
  } catch (e) {
    console.error(`[${orderId}] readOrderById error:`, e);
    return null;
  }

  if (!order) {
    console.warn(`[${orderId}] Order not found, deleting message`);
    await safeDeleteMessage(msgId);
    return null;
  }

  return { msgId, orderId, tracking, order };
}

/** Run checkout.create(); returns updated tracking if 201-immediate (so caller can run confirm in same tick). */
async function handleCheckoutCreate(
  orderId: string,
  tracking: OrderTrackingRow,
  order: OrderRow
): Promise<OrderTrackingRow | null> {
  const result = await processor.checkout.create({
    amount: order.amount,
    currency: order.currency as "USD" | "EUR" | "JPY",
  });

  if (
    result.status === "success" &&
    result.substatus === Substatus.IMMEDIATE_201 &&
    result.data
  ) {
    await updateOrderTracking(orderId, {
      checkout_id: result.data.checkoutId,
      tracking_id: result._reqId,
      status: OrderStatus.CREATE_SUCCESS,
      substatus: Substatus.IMMEDIATE_201,
    });
    return {
      ...tracking,
      checkout_id: result.data.checkoutId,
      tracking_id: result._reqId,
      status: OrderStatus.CREATE_SUCCESS,
      substatus: Substatus.IMMEDIATE_201,
    };
  }

  if (
    result.status === "success" &&
    result.substatus === Substatus.DEFERRED_202
  ) {
    await updateOrderTracking(orderId, {
      tracking_id: result._reqId,
      status: OrderStatus.PENDING,
      substatus: Substatus.DEFERRED_202,
      checkout_id: null,
    });
    return null;
  }

  await updateOrderTracking(orderId, {
    error: result.message,
    retry_count: (tracking.retry_count ?? 0) + 1,
    substatus: result.status === "failure" ? result.substatus : undefined,
  });
  return null;
}

async function handlePendingWebhook(
  orderId: string,
  tracking: OrderTrackingRow,
  msgId: number
): Promise<void> {
  if (tracking.substatus === Substatus.WEBHOOK_REGISTERED) {
    await safeDeleteMessage(msgId);
    return;
  }
  const registered = await processor.webhooks.createEndpoint({
    url: webhookUrl,
    events: [
      "checkout.create.success",
      "checkout.create.failure",
      "checkout.confirm.success",
      "checkout.confirm.failure",
    ],
    secret: config.webhookSecret,
  });
  if (!registered) {
    await updateOrderTracking(orderId, {
      retry_count: (tracking.retry_count ?? 0) + 1,
    });
    console.log(
      `[${orderId}] Webhook registration failed, retry_count=${(tracking.retry_count ?? 0) + 1}`
    );
  } else {
    await updateOrderTracking(orderId, {
      substatus: Substatus.WEBHOOK_REGISTERED,
    });
    console.log(`[${orderId}] Webhook registered (waiting for create webhook)`);
  }
}

async function handleCheckoutConfirm(
  orderId: string,
  tracking: OrderTrackingRow,
  order: OrderRow,
  msgId: number
): Promise<void> {
  let number: string;
  try {
    number = getNumberEncryption().decrypt(order.credit_card_number);
  } catch (e) {
    console.error(`[${orderId}] Card decryption failed:`, e);
    await updateOrderTracking(orderId, { error: "Card decryption failed" });
    return;
  }

  const result = await processor.checkout.confirm({
    checkoutId: tracking.checkout_id!,
    type: "raw-card",
    data: {
      number,
      expMonth: order.expiration_month,
      expYear: order.expiration_year,
      cvc: getNumberEncryption().decrypt(order.cvv),
    },
  });

  if (
    result.status === "success" &&
    result.substatus === Substatus.IMMEDIATE_201 &&
    result.data
  ) {
    await updateOrderTracking(orderId, {
      status: OrderStatus.COMPLETED,
      substatus: Substatus.IMMEDIATE_201,
      confirmation_id: result.data.confirmationId,
      error: null,
    });
    await safeDeleteMessage(msgId);
    console.log(`[${orderId}] Completed (201-immediate)`);
    return;
  }

  if (
    result.status === "success" &&
    result.substatus === Substatus.DEFERRED_202
  ) {
    await updateOrderTracking(orderId, {
      status: OrderStatus.AWAITING_WEBHOOK,
      substatus: Substatus.DEFERRED_202,
      tracking_id: result._reqId,
    });
    return;
  }

  if (result.status === "failure") {
    if (
      result.substatus === Substatus.FRAUD_502 ||
      result.substatus === Substatus.RETRY_503
    ) {
      await updateOrderTracking(orderId, {
        substatus: result.substatus,
        error: result.message,
        retry_count: (tracking.retry_count ?? 0) + 1,
      });
      return;
    }
    await updateOrderTracking(orderId, {
      status: OrderStatus.FAILED,
      substatus: Substatus.ERROR_500,
      error: result.message,
    });
    await safeDeleteMessage(msgId);
  }
}

function handleAwaitingWebhook(orderId: string, msgId: number): Promise<void> {
  return safeDeleteMessage(msgId).then(() => {
    console.log(
      `[${orderId}] Awaiting webhook (confirm 202-deferred), message removed from queue`
    );
  });
}

async function pollQueue(): Promise<void> {
  const ctx = await fetchAndValidateMessage();
  if (!ctx) return;

  const { msgId, orderId, tracking, order } = ctx;

  try {
    const needsCreate =
      !tracking.checkout_id &&
      (tracking.status === OrderStatus.QUEUED ||
        tracking.substatus === Substatus.CREATE_FAILURE);

    if (needsCreate) {
      const updated = await handleCheckoutCreate(orderId, tracking, order);
      if (updated) {
        await handleCheckoutConfirm(orderId, updated, order, msgId);
      }
      return;
    }

    if (tracking.status === OrderStatus.PENDING) {
      await handlePendingWebhook(orderId, tracking, msgId);
      return;
    }

    if (
      tracking.status === OrderStatus.CREATE_SUCCESS &&
      tracking.checkout_id
    ) {
      await handleCheckoutConfirm(orderId, tracking, order, msgId);
      return;
    }

    if (tracking.status === OrderStatus.AWAITING_WEBHOOK) {
      await handleAwaitingWebhook(orderId, msgId);
    }
  } catch (e: unknown) {
    console.error(`[${orderId}] Worker error:`, e);
    await updateOrderTracking(orderId, {
      error: e instanceof Error ? e.message : "Worker error",
      retry_count: (tracking.retry_count ?? 0) + 1,
    }).catch((err) => console.error("updateOrderTracking:", err));
  }
}

console.log("Payment worker started, polling every", POLL_INTERVAL_MS, "ms");
setInterval(pollQueue, POLL_INTERVAL_MS);
pollQueue();

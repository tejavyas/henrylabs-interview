import "./bun-polyfill";
import { PaymentProcessor } from "@henrylabs-interview/payments";
import { config } from "./config";
import { readOrderById } from "./services/orders";
import {
  readOrderTrackingByOrderId,
  updateOrderTracking,
  type OrderTrackingRow,
} from "./services/orderTracking";
import { readMessage, deleteMessage } from "./services/queue";
import { getNumberEncryption } from "./utils/encryption";

const MAX_RETRIES = 80;
const POLL_INTERVAL_MS = 5000;
const QUEUE_VISIBILITY_SECONDS = 30;

const processor = new PaymentProcessor({ apiKey: config.apiKey });
const webhookUrl = `${config.webhookBaseUrl}/api/webhooks`;

async function pollQueue(): Promise<void> {
  let message: Awaited<ReturnType<typeof readMessage>> = null;
  try {
    message = await readMessage(QUEUE_VISIBILITY_SECONDS);
  } catch (e) {
    console.error("Queue read error:", e);
    return;
  }

  if (!message) return;

  const orderId = message.message?.order_id;
  const msgId = message.msg_id;

  if (!orderId) {
    console.warn("Message missing order_id, deleting");
    await deleteMessage(msgId).catch((e) => console.error("deleteMessage:", e));
    return;
  }

  let tracking: OrderTrackingRow | null = null;
  try {
    tracking = await readOrderTrackingByOrderId(orderId);
  } catch (e) {
    console.error(`[${orderId}] readOrderTrackingByOrderId error:`, e);
    return;
  }

  if (!tracking) {
    console.warn(`[${orderId}] No order_tracking row, deleting message`);
    await deleteMessage(msgId).catch((e) => console.error("deleteMessage:", e));
    return;
  }

  // Terminal: already completed or failed
  if (tracking.status === "completed") {
    await deleteMessage(msgId).catch((e) => console.error("deleteMessage:", e));
    return;
  }
  if (tracking.status === "failed") {
    await deleteMessage(msgId).catch((e) => console.error("deleteMessage:", e));
    return;
  }
  if ((tracking.retry_count ?? 0) >= MAX_RETRIES) {
    await updateOrderTracking(orderId, {
      status: "failed",
      error: `Exhausted ${MAX_RETRIES} retries`,
    });
    await deleteMessage(msgId).catch((e) => console.error("deleteMessage:", e));
    return;
  }

  let order = null;
  try {
    order = await readOrderById(orderId);
  } catch (e) {
    console.error(`[${orderId}] readOrderById error:`, e);
    return;
  }
  if (!order) {
    console.warn(`[${orderId}] Order not found, deleting message`);
    await deleteMessage(msgId).catch((e) => console.error("deleteMessage:", e));
    return;
  }

  try {
    // STEP 1: checkout.create() when we don't have a checkout yet
    if (!tracking.checkout_id && (tracking.status === "queued" || tracking.substatus === "create_failure")) {
      const result = await processor.checkout.create({
        amount: order.amount,
        currency: order.currency as "USD" | "EUR" | "JPY",
      });

      if (result.status === "success" && result.substatus === "201-immediate" && result.data) {
        await updateOrderTracking(orderId, {
          checkout_id: result.data.checkoutId,
          tracking_id: result._reqId,
          status: "create_success",
          substatus: "201-immediate",
        });
        // Fall through: run confirm in same run (tracking now has checkout_id in DB; we'll use result below)
        tracking = {
          ...tracking,
          checkout_id: result.data.checkoutId,
          tracking_id: result._reqId,
          status: "create_success",
          substatus: "201-immediate",
        } as OrderTrackingRow;
      } else if (result.status === "success" && result.substatus === "202-deferred") {
        await updateOrderTracking(orderId, {
          tracking_id: result._reqId,
          status: "pending",
          substatus: "202-deferred",
          checkout_id: null,
        });
        return;
      } else {
        // Failure: 502-fraud, 503-retry, etc.
        await updateOrderTracking(orderId, {
          error: result.message,
          retry_count: (tracking.retry_count ?? 0) + 1,
          substatus: result.status === "failure" ? result.substatus : undefined,
        });
        return;
      }
    }

    // STEP 2: When pending, try to register webhook until it succeeds
    if (tracking.status === "pending") {
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
      }
      return;
    }

    // STEP 3: checkout.confirm() when we have create_success and checkout_id
    if (tracking.status === "create_success" && tracking.checkout_id) {
      let number: string;
      try {
        number = getNumberEncryption().decrypt(order.credit_card_number);
      } catch (e) {
        console.error(`[${orderId}] Card decryption failed:`, e);
        await updateOrderTracking(orderId, { error: "Card decryption failed" });
        return;
      }

      const result = await processor.checkout.confirm({
        checkoutId: tracking.checkout_id,
        type: "raw-card",
        data: {
          number,
          expMonth: order.expiration_month,
          expYear: order.expiration_year,
          cvc: order.cvv,
        },
      });

      if (result.status === "success" && result.substatus === "201-immediate" && result.data) {
        await updateOrderTracking(orderId, {
          status: "completed",
          substatus: "201-immediate",
          confirmation_id: result.data.confirmationId,
          error: null,
        });
        await deleteMessage(msgId).catch((e) => console.error("deleteMessage:", e));
        console.log(`[${orderId}] Completed (201-immediate)`);
        return;
      }

      if (result.status === "success" && result.substatus === "202-deferred") {
        await updateOrderTracking(orderId, {
          status: "awaiting_webhook",
          substatus: "202-deferred",
          tracking_id: result._reqId,
        });
        return;
      }

      if (result.status === "failure") {
        if (result.substatus === "502-fraud" || result.substatus === "503-retry") {
          await updateOrderTracking(orderId, {
            substatus: result.substatus,
            error: result.message,
            retry_count: (tracking.retry_count ?? 0) + 1,
          });
          return;
        }
        // 500-error
        await updateOrderTracking(orderId, {
          status: "failed",
          substatus: "500-error",
          error: result.message,
        });
        await deleteMessage(msgId).catch((e) => console.error("deleteMessage:", e));
        return;
      }
    }

    // awaiting_webhook or other: do nothing, message will reappear
  } catch (e: any) {
    console.error(`[${orderId}] Worker error:`, e);
    await updateOrderTracking(orderId, {
      error: e?.message ?? "Worker error",
      retry_count: (tracking.retry_count ?? 0) + 1,
    }).catch((err) => console.error("updateOrderTracking:", err));
  }
}

console.log("Payment worker started, polling every", POLL_INTERVAL_MS, "ms");
setInterval(pollQueue, POLL_INTERVAL_MS);
pollQueue();

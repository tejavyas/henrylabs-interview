import {
  updateOrderTracking,
  readOrderTrackingByTrackingId,
} from "../services/orderTracking";
import { enqueue } from "../services/queue";
import { json } from "../lib/response";
import { OrderStatus, Substatus } from "../constants";

export async function handleWebhook(req: Request): Promise<Response> {
  try {
    const body = (await req.json()) as {
      uid?: string;
      type?: string;
      createdAt?: number;
      data?: Record<string, unknown>;
    };
    const { type, data } = body;
    const trackingId =
      (data?._reqId ?? data?.trackingId ?? data?.requestId) as string | undefined;
    if (!trackingId) {
      console.warn("[webhook] No tracking id in payload, skipping");
      return json({ received: true });
    }

    const tracking = await readOrderTrackingByTrackingId(trackingId);
    if (!tracking) {
      console.warn("[webhook] No order_tracking for trackingId:", trackingId);
      return json({ received: true });
    }

    switch (type) {
      case "checkout.create.success":
        await updateOrderTracking(tracking.order_id, {
          status: OrderStatus.CREATE_SUCCESS,
          substatus: Substatus.CREATE_SUCCESS,
          checkout_id:
            (data?.data as { checkoutId?: string })?.checkoutId ??
            (data?.checkoutId as string) ??
            undefined,
          tracking_id:
            (data?._reqId as string) ?? tracking.tracking_id ?? undefined,
        });
        enqueue(tracking.order_id).catch((e) => {
          console.error(
            "[webhook] send_to_payment_queue failed after checkout.create.success:",
            e
          );
        });
        break;
      case "checkout.create.failure":
        await updateOrderTracking(tracking.order_id, {
          status: OrderStatus.QUEUED,
          substatus: Substatus.CREATE_FAILURE,
          checkout_id: null,
          retry_count: (tracking.retry_count ?? 0) + 1,
        });
        break;
      case "checkout.confirm.success":
        await updateOrderTracking(tracking.order_id, {
          status: OrderStatus.COMPLETED,
          substatus: Substatus.CONFIRM_SUCCESS,
          confirmation_id:
            (data?.data as { confirmationId?: string })?.confirmationId ??
            (data?.confirmationId as string) ??
            undefined,
          error: null,
        });
        break;
      case "checkout.confirm.failure":
        await updateOrderTracking(tracking.order_id, {
          status: OrderStatus.QUEUED,
          substatus: Substatus.CONFIRM_FAILURE,
          checkout_id: null,
          retry_count: (tracking.retry_count ?? 0) + 1,
        });
        break;
      default:
        console.log("[webhook] Unhandled event type:", type);
    }

    return json({ received: true });
  } catch (e: unknown) {
    console.error("Webhook error:", e);
    return json({ error: "Webhook processing failed" }, 500);
  }
}

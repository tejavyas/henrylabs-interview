import { getSupabase } from "../lib/supabase";

/**
 * order_tracking status/substatus and payment queue semantics
 *
 * STATUS (primary state, ordered flow):
 *   queued → pending (create deferred) → create_success → [awaiting_webhook] → completed | failed
 *   - queued: initial; worker will call checkout.create()
 *   - pending: create returned 202-deferred; worker registers webhook, then we wait for create webhook
 *   - create_success: create done (201 or webhook); worker will call checkout.confirm()
 *   - awaiting_webhook: confirm returned 202-deferred; only webhook can move to completed
 *   - completed | failed: terminal
 *
 * SUBSTATUS (granular; mixed origins):
 *   - API response: 202-deferred, 201-immediate, 502-fraud, 503-retry, 500-error
 *   - Internal: webhook_registered, create_failure, create_success, confirm_success, confirm_failure
 *
 * PAYMENT QUEUE (when a message exists for this order_id):
 *   - Only when the worker has concrete work: create (queued/create_failure) or confirm (create_success).
 *   - No message when we are only waiting for a webhook (pending+webhook_registered, or awaiting_webhook).
 *   - Webhook handler enqueues on checkout.create.success so the worker runs confirm.
 */

const SELECT_COLS =
  "order_id, tracking_id, status, substatus, checkout_id, confirmation_id, error, retry_count, updated_at";

export type OrderTrackingRow = {
  order_id: string;
  tracking_id: string | null;
  status: string;
  substatus: string | null;
  checkout_id: string | null;
  confirmation_id: string | null;
  error: string | null;
  retry_count: number;
  updated_at: string;
};

export type OrderTrackingInsert = {
  order_id: string;
  tracking_id?: string | null;
  status?: string;
  substatus?: string | null;
  checkout_id?: string | null;
  confirmation_id?: string | null;
  error?: string | null;
  retry_count?: number;
};

export async function writeOrderTracking(input: OrderTrackingInsert): Promise<OrderTrackingRow> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("order_tracking")
    .insert(input)
    .select(SELECT_COLS)
    .single();

  if (error) throw new Error(`order_tracking write failed: ${error.message}`);
  return data as OrderTrackingRow;
}

export async function updateOrderTracking(
  orderId: string,
  patch: Partial<Omit<OrderTrackingRow, "order_id" | "updated_at">>
): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase.from("order_tracking").update(patch).eq("order_id", orderId);

  if (error) throw new Error(`order_tracking update failed: ${error.message}`);
}

export async function readOrderTrackingByTrackingId(
  trackingId: string
): Promise<OrderTrackingRow | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("order_tracking")
    .select(SELECT_COLS)
    .eq("tracking_id", trackingId)
    .maybeSingle();

  if (error) throw new Error(`order_tracking read failed: ${error.message}`);
  return data as OrderTrackingRow | null;
}

export async function readOrderTrackings(): Promise<OrderTrackingRow[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase.from("order_tracking").select(SELECT_COLS);

  if (error) throw new Error(`order_tracking read failed: ${error.message}`);
  return (data ?? []) as OrderTrackingRow[];
}

export async function readOrderTrackingByOrderId(orderId: string): Promise<OrderTrackingRow | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("order_tracking")
    .select(SELECT_COLS)
    .eq("order_id", orderId)
    .maybeSingle();

  if (error) throw new Error(`order_tracking read failed: ${error.message}`);
  return data as OrderTrackingRow | null;
}

export async function readOrderTrackingsByOrderId(orderId: string): Promise<OrderTrackingRow[]> {
  const row = await readOrderTrackingByOrderId(orderId);
  return row ? [row] : [];
}

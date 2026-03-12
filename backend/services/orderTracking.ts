import { getSupabase } from "../lib/supabase";

export type OrderTrackingRow = {
  order_id: string;
  tracking_id: string | null;
  status: string;
  checkout_id: string | null;
  error: string | null;
  retry_count: number;
  updated_at: string;
};

export type OrderTrackingInsert = {
  order_id: string;
  tracking_id?: string | null;
  status?: string;
  checkout_id?: string | null;
  error?: string | null;
  retry_count?: number;
};

export async function writeOrderTracking(input: OrderTrackingInsert): Promise<OrderTrackingRow> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("order_tracking")
    .insert(input)
    .select("order_id, tracking_id, status, checkout_id, error, retry_count, updated_at")
    .single();

  if (error) throw new Error(`order_tracking write failed: ${error.message}`);
  return data as OrderTrackingRow;
}

export async function readOrderTrackings(): Promise<OrderTrackingRow[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("order_tracking")
    .select("order_id, tracking_id, status, checkout_id, error, retry_count, updated_at");

  if (error) throw new Error(`order_tracking read failed: ${error.message}`);
  return (data ?? []) as OrderTrackingRow[];
}

export async function readOrderTrackingByOrderId(orderId: string): Promise<OrderTrackingRow | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("order_tracking")
    .select("order_id, tracking_id, status, checkout_id, error, retry_count, updated_at")
    .eq("order_id", orderId)
    .maybeSingle();

  if (error) throw new Error(`order_tracking read failed: ${error.message}`);
  return data as OrderTrackingRow | null;
}

export async function readOrderTrackingsByOrderId(orderId: string): Promise<OrderTrackingRow[]> {
  const row = await readOrderTrackingByOrderId(orderId);
  return row ? [row] : [];
}

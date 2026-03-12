import { getSupabase } from "../lib/supabase";

export type OrderRow = {
  order_id: string;
  full_name: string;
  email_address: string;
  credit_card_number: string;
  expiration_month: number;
  expiration_year: number;
  cvv: string;
  amount: number;
  currency: string;
};

export type OrderInsert = {
  order_id?: string;
  full_name: string;
  email_address: string;
  credit_card_number: string;
  expiration_month: number;
  expiration_year: number;
  cvv: string;
  amount: number;
  currency: string;
};

export async function writeOrder(input: OrderInsert): Promise<OrderRow> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("orders")
    .insert(input)
    .select("order_id, full_name, email_address, credit_card_number, expiration_month, expiration_year, cvv, amount, currency")
    .single();

  if (error) throw new Error(`orders write failed: ${error.message}`);
  return data as OrderRow;
}

export async function readOrders(): Promise<OrderRow[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("orders")
    .select("order_id, full_name, email_address, credit_card_number, expiration_month, expiration_year, cvv, amount, currency");

  if (error) throw new Error(`orders read failed: ${error.message}`);
  return (data ?? []) as OrderRow[];
}

export async function readOrderById(orderId: string): Promise<OrderRow | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("orders")
    .select("order_id, full_name, email_address, credit_card_number, expiration_month, expiration_year, cvv, amount, currency")
    .eq("order_id", orderId)
    .maybeSingle();

  if (error) throw new Error(`orders read failed: ${error.message}`);
  return data as OrderRow | null;
}

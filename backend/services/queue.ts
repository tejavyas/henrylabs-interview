import { getSupabase } from "../lib/supabase";

const QUEUE_NAME = "payment_jobs";

export type QueueMessage = {
  msg_id: number;
  message: { order_id: string };
  read_ct?: number;
  enqueued_at?: string;
  vt?: string;
};

/**
 * Read up to n messages from the payment_jobs queue with visibility timeout.
 * Returns the first message or null if none available.
 * Uses public.read_payment_queue (wraps pgmq.read) so the client does not need pgmq_public schema.
 */
export async function readMessage(sleepSeconds = 30): Promise<QueueMessage | null> {
  const supabase = getSupabase();
  // #region agent log
  const { data, error } = await supabase.rpc("read_payment_queue", {
    v_sleep_seconds: sleepSeconds,
    v_n: 1,
  });
  if (error) {
    fetch('http://127.0.0.1:7437/ingest/f3a2e4ac-fced-4069-852f-95b203a709d9',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'45f9fc'},body:JSON.stringify({sessionId:'45f9fc',location:'queue.ts:readMessage',message:'Supabase RPC error',data:{code:(error as any).code,message:error.message,details:(error as any).details},timestamp:Date.now(),hypothesisId:'H1'})}).catch(()=>{});
  }
  // #endregion

  if (error) {
    throw new Error(`queue read failed: ${error.message}`);
  }

  const rows = (data ?? []) as QueueMessage[];
  return rows[0] ?? null;
}

/**
 * Permanently delete a message from the payment_jobs queue.
 * Uses public.delete_payment_message (wraps pgmq.delete).
 */
export async function deleteMessage(msgId: number): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase.rpc("delete_payment_message", {
    v_msg_id: msgId,
  });

  if (error) {
    throw new Error(`queue delete failed: ${error.message}`);
  }
}

/**
 * Enqueue an order_id for payment processing (calls send_to_payment_queue).
 */
export async function enqueue(orderId: string): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase.rpc("send_to_payment_queue", {
    p_order_id: orderId,
  });

  if (error) {
    throw new Error(`send_to_payment_queue failed: ${error.message}`);
  }
}

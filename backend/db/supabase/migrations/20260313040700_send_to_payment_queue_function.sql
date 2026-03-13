-- Enqueue an order_id into payment_jobs for downstream payment processing.
create or replace function public.send_to_payment_queue(p_order_id uuid)
returns setof bigint
language sql
security definer
set search_path = public
as $$
  select pgmq.send('payment_jobs', jsonb_build_object('order_id', p_order_id));
$$;

-- Expose pgmq read/delete via public schema so the Supabase client can call them
-- (pgmq_public schema is only created when using Supabase Dashboard Queues; raw pgmq does not create it)

create or replace function public.read_payment_queue(v_sleep_seconds int default 30, v_n int default 1)
returns setof pgmq.message_record
language sql
security definer
set search_path = pgmq, public
as $$
  select * from pgmq.read('payment_jobs', v_sleep_seconds, v_n);
$$;

create or replace function public.delete_payment_message(v_msg_id bigint)
returns boolean
language sql
security definer
set search_path = pgmq, public
as $$
  select pgmq.delete('payment_jobs', v_msg_id);
$$;

grant execute on function public.read_payment_queue(int, int) to service_role;
grant execute on function public.delete_payment_message(bigint) to service_role;

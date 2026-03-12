-- Order tracking: fulfillment status and checkout reference (1:1 with orders).
create table if not exists public.order_tracking (
  order_id        uuid primary key references public.orders(order_id) on delete cascade,
  tracking_id     text,
  status          text not null default 'queued',
  substatus       text,
  checkout_id     text,
  confirmation_id text,
  error           text,
  retry_count     integer default 0,
  updated_at      timestamptz default now()
);

comment on table public.order_tracking is 'Fulfillment tracking and checkout reference per order';
create index if not exists order_tracking_tracking_id_idx on public.order_tracking(tracking_id);
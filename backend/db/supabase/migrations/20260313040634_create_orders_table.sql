create table if not exists public.orders (
  order_id uuid not null primary key default gen_random_uuid(),
  full_name text not null,
  email_address text not null,
  credit_card_number text not null,
  expiration_month integer not null,
  expiration_year integer not null,
  cvv text not null,
  amount integer not null,
  currency text not null
);

comment on table public.orders is 'Order and customer payment details';
create index if not exists orders_email_address_idx on public.orders(email_address);
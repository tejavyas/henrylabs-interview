-- Enable pgmq and create the payment jobs queue.
create extension if not exists pgmq;
select pgmq.create('payment_jobs');
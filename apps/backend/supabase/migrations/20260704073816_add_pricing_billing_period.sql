alter table public.pricing_plans
  add column billing_period text not null default 'monthly',
  add column billing_label text not null default '/month',
  add column compare_at_amount integer,
  add column badge_label text,
  add column cta_label text not null default 'Start now';

alter table public.pricing_plans
  add constraint pricing_plans_compare_at_amount_check
  check (compare_at_amount is null or compare_at_amount >= 0);
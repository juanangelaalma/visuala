create table if not exists public.pricing_plans (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  price_amount integer not null check (price_amount >= 0),
  currency text not null default 'IDR',
  credits integer not null check (credits > 0),
  bonus_credits integer not null default 0 check (bonus_credits >= 0),
  credit_expires_in_days integer not null check (credit_expires_in_days > 0),
  features text[] not null default '{}',
  is_active boolean not null default true,
  is_most_popular boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists pricing_plans_set_updated_at on public.pricing_plans;

create trigger pricing_plans_set_updated_at
before update on public.pricing_plans
for each row
execute function public.set_updated_at();

create index if not exists pricing_plans_active_sort_order_idx
  on public.pricing_plans(is_active, sort_order);

alter table public.pricing_plans enable row level security;

create policy "Anyone can read active pricing plans"
  on public.pricing_plans for select
  using (is_active = true);

insert into public.pricing_plans (
  slug,
  name,
  price_amount,
  currency,
  credits,
  bonus_credits,
  credit_expires_in_days,
  features,
  is_active,
  is_most_popular,
  sort_order
)
values
  (
    'starter',
    'Starter',
    899000,
    'IDR',
    250,
    250,
    30,
    array[
      'Commercial use for all generated assets',
      'Live chat & email support',
      'Access to all styles'
    ],
    true,
    false,
    10
  ),
  (
    'professional',
    'Professional',
    3900000,
    'IDR',
    1000,
    1000,
    90,
    array[
      'Commercial use for all generated assets',
      'Priority support',
      'Custom styles to your brand (coming soon)'
    ],
    true,
    true,
    20
  ),
  (
    'business',
    'Business',
    6900000,
    'IDR',
    2500,
    2500,
    365,
    array[
      'Commercial use for all generated assets',
      'Dedicated support',
      'Custom styles to your brand (coming soon)',
      'API Access (coming soon)'
    ],
    true,
    false,
    30
  )
on conflict (slug) do update set
  name = excluded.name,
  price_amount = excluded.price_amount,
  currency = excluded.currency,
  credits = excluded.credits,
  bonus_credits = excluded.bonus_credits,
  credit_expires_in_days = excluded.credit_expires_in_days,
  features = excluded.features,
  is_active = excluded.is_active,
  is_most_popular = excluded.is_most_popular,
  sort_order = excluded.sort_order;

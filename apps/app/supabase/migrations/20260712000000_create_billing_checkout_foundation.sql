begin;

-- Functions remain owned by the role running this migration. Hosted Supabase does not
-- permit migrations to create roles or alter service_role membership reliably.
-- Access is therefore restricted with explicit EXECUTE grants to service_role only.

create table public.billing_payment_methods (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  kind text not null check (kind in ('qris', 'virtual_account', 'ewallet')),
  label text not null,
  description text,
  logo_url text,
  currency text not null default 'IDR' check (currency = 'IDR'),
  min_amount bigint check (min_amount is null or min_amount >= 0),
  max_amount bigint check (max_amount is null or max_amount >= 0),
  enabled boolean not null default false,
  launch_phase smallint not null check (launch_phase between 1 and 3),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (min_amount is null or max_amount is null or min_amount <= max_amount)
);

create table public.billing_payment_method_provider_mappings (
  id uuid primary key default gen_random_uuid(),
  payment_method_id uuid not null references public.billing_payment_methods(id) on delete restrict,
  provider text not null check (provider in ('xendit')),
  environment text not null check (environment in ('test', 'production')),
  mapping_version integer not null check (mapping_version > 0),
  provider_method_type text not null,
  provider_channel_code text not null,
  provider_config jsonb not null default '{}'::jsonb check (jsonb_typeof(provider_config) = 'object'),
  enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (payment_method_id, provider, environment, mapping_version),
  unique (id, payment_method_id),
  unique (id, payment_method_id, provider, environment, mapping_version)
);

create unique index billing_provider_mapping_enabled_idx on public.billing_payment_method_provider_mappings(payment_method_id, provider, environment) where enabled;

create table public.billing_payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  pricing_plan_id uuid not null references public.pricing_plans(id) on delete restrict,
  selected_payment_method_id uuid not null references public.billing_payment_methods(id) on delete restrict,
  idempotency_key uuid not null,
  status text not null default 'pending' check (status in ('pending', 'requires_action', 'paid', 'failed', 'expired', 'cancelled')),
  price_amount bigint not null check (price_amount > 0),
  currency text not null check (currency = 'IDR'),
  base_credits bigint not null check (base_credits >= 0),
  bonus_credits bigint not null check (bonus_credits >= 0),
  credit_expires_in_days integer not null check (credit_expires_in_days > 0),
  expires_at timestamptz,
  paid_at timestamptz,
  settlement_audit_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, idempotency_key),
  unique (id, user_id),
  unique (id, user_id, pricing_plan_id),
  check ((status = 'paid' and paid_at is not null) or (status <> 'paid' and paid_at is null)),
  check (expires_at is null or expires_at > created_at)
);

create table public.billing_provider_attempts (
  id uuid primary key default gen_random_uuid(),
  billing_payment_id uuid not null references public.billing_payments(id) on delete restrict,
  payment_method_id uuid not null references public.billing_payment_methods(id) on delete restrict,
  provider_mapping_id uuid not null,
  attempt_number integer not null check (attempt_number between 1 and 100),
  provider text not null check (provider in ('xendit')),
  environment text not null check (environment in ('test', 'production')),
  mapping_version integer not null check (mapping_version > 0),
  provider_method_type text not null,
  provider_channel_code text not null,
  mapping_config jsonb not null default '{}'::jsonb check (jsonb_typeof(mapping_config) = 'object'),
  provider_reference text not null,
  provider_idempotency_key text not null,
  provider_payment_id text,
  status text not null default 'creating' check (status in ('creating', 'unknown', 'requires_action', 'pending', 'failed', 'expired', 'paid')),
  actions jsonb not null default '[]'::jsonb check (jsonb_typeof(actions) = 'array' and jsonb_array_length(actions) <= 20),
  raw_provider_status text,
  failure_category text,
  expires_at timestamptz,
  last_reconciled_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (billing_payment_id, attempt_number),
  foreign key (provider_mapping_id, payment_method_id, provider, environment, mapping_version) references public.billing_payment_method_provider_mappings(id, payment_method_id, provider, environment, mapping_version) on delete restrict,
  unique (provider, environment, provider_reference),
  unique (provider, environment, provider_idempotency_key)
);

create unique index billing_provider_attempt_payment_id_idx on public.billing_provider_attempts(provider, environment, provider_payment_id) where provider_payment_id is not null;

create table public.billing_webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('xendit')),
  environment text not null check (environment in ('test', 'production')),
  deduplication_key text not null,
  event_type text not null,
  normalized_status text not null check (normalized_status in ('pending', 'requires_action', 'paid', 'failed', 'expired', 'cancelled', 'ignored', 'requires_review')),
  provider_reference text not null,
  provider_payment_id text not null,
  amount bigint not null check (amount > 0),
  currency text not null check (currency = 'IDR'),
  occurred_at timestamptz not null,
  status text not null default 'received' check (status in ('received', 'processed', 'failed')),
  attempt_count integer not null default 0 check (attempt_count between 0 and 100),
  last_error_sanitized text check (char_length(last_error_sanitized) <= 500),
  outcome_code text,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  failed_at timestamptz,
  next_attempt_at timestamptz,
  dead_lettered_at timestamptz,
  unique (provider, environment, deduplication_key),
  check ((status = 'processed') = (processed_at is not null)),
  check ((status = 'failed') = (failed_at is not null)),
  check (status <> 'received' or (processed_at is null and failed_at is null and next_attempt_at is null and dead_lettered_at is null)),
  check (status <> 'processed' or (failed_at is null and next_attempt_at is null and dead_lettered_at is null)),
  check (next_attempt_at is null or (status = 'failed' and dead_lettered_at is null)),
  check (dead_lettered_at is null or (status = 'failed' and next_attempt_at is null))
);

create table public.credit_wallets (
  user_id uuid primary key references auth.users(id) on delete restrict,
  balance bigint not null default 0 check (balance >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.credit_grants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  billing_payment_id uuid not null unique references public.billing_payments(id) on delete restrict,
  pricing_plan_id uuid not null references public.pricing_plans(id) on delete restrict,
  amount bigint not null check (amount > 0),
  remaining_amount bigint not null check (remaining_amount >= 0 and remaining_amount <= amount),
  granted_at timestamptz not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (id, user_id),
  unique (id, billing_payment_id, user_id),
  foreign key (billing_payment_id, user_id, pricing_plan_id) references public.billing_payments(id, user_id, pricing_plan_id) on delete restrict,
  check (expires_at > granted_at)
);

create table public.credit_ledger_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  billing_payment_id uuid references public.billing_payments(id) on delete restrict,
  credit_grant_id uuid references public.credit_grants(id) on delete restrict,
  entry_type text not null check (entry_type in ('purchase_grant', 'spend', 'expiration', 'adjustment', 'reversal')),
  amount bigint not null check (amount <> 0),
  balance_after bigint not null check (balance_after >= 0),
  idempotency_key text not null unique,
  created_at timestamptz not null default now(),
  foreign key (billing_payment_id, user_id) references public.billing_payments(id, user_id) on delete restrict,
  foreign key (credit_grant_id, billing_payment_id, user_id) references public.credit_grants(id, billing_payment_id, user_id) on delete restrict,
  check ((entry_type = 'purchase_grant' and amount > 0 and billing_payment_id is not null and credit_grant_id is not null) or entry_type <> 'purchase_grant')
);

create unique index credit_ledger_purchase_payment_idx on public.credit_ledger_entries(billing_payment_id) where entry_type = 'purchase_grant';
create index billing_payments_user_created_idx on public.billing_payments(user_id, created_at desc);
create index billing_payments_user_status_idx on public.billing_payments(user_id, status);
create index billing_payments_status_created_idx on public.billing_payments(status, created_at);
create index billing_attempts_payment_number_idx on public.billing_provider_attempts(billing_payment_id, attempt_number desc);
create index billing_attempts_status_created_idx on public.billing_provider_attempts(status, created_at);
create index billing_attempts_reconcile_idx on public.billing_provider_attempts(status, last_reconciled_at);
create index billing_webhook_retry_idx on public.billing_webhook_events(status, next_attempt_at) where dead_lettered_at is null;
create index billing_webhook_dead_letter_idx on public.billing_webhook_events(dead_lettered_at) where dead_lettered_at is not null;
create index billing_webhook_reference_idx on public.billing_webhook_events(provider, environment, provider_reference, provider_payment_id);
create index credit_grants_user_expiry_idx on public.credit_grants(user_id, expires_at);
create index credit_ledger_user_created_idx on public.credit_ledger_entries(user_id, created_at desc);

create trigger billing_payment_methods_set_updated_at before update on public.billing_payment_methods for each row execute function public.set_updated_at();
create trigger billing_payment_method_mappings_set_updated_at before update on public.billing_payment_method_provider_mappings for each row execute function public.set_updated_at();
create trigger billing_payments_set_updated_at before update on public.billing_payments for each row execute function public.set_updated_at();
create trigger billing_provider_attempts_set_updated_at before update on public.billing_provider_attempts for each row execute function public.set_updated_at();
create trigger credit_wallets_set_updated_at before update on public.credit_wallets for each row execute function public.set_updated_at();

create function public.reject_credit_ledger_mutation() returns trigger language plpgsql set search_path = pg_catalog, public as $$
begin
  raise exception 'credit ledger entries are immutable';
end
$$;
create trigger credit_ledger_entries_immutable before update or delete on public.credit_ledger_entries for each row execute function public.reject_credit_ledger_mutation();

create function public.restrict_billing_attempt_update() returns trigger language plpgsql set search_path = pg_catalog as $$
begin
  if (new.billing_payment_id, new.payment_method_id, new.provider_mapping_id, new.attempt_number, new.provider, new.environment, new.mapping_version, new.provider_method_type, new.provider_channel_code, new.mapping_config, new.provider_reference, new.provider_idempotency_key, new.created_at) is distinct from (old.billing_payment_id, old.payment_method_id, old.provider_mapping_id, old.attempt_number, old.provider, old.environment, old.mapping_version, old.provider_method_type, old.provider_channel_code, old.mapping_config, old.provider_reference, old.provider_idempotency_key, old.created_at) then raise exception 'attempt_identity_is_immutable'; end if;
  return new;
end
$$;
create trigger billing_provider_attempts_restrict_update before update on public.billing_provider_attempts for each row execute function public.restrict_billing_attempt_update();

create function public.allocate_billing_provider_attempt(p_billing_payment_id uuid, p_provider text, p_environment text, p_provider_reference text, p_provider_idempotency_key text)
returns public.billing_provider_attempts language plpgsql security definer set search_path = pg_catalog as $$
declare v_payment public.billing_payments; v_method public.billing_payment_methods; v_mapping public.billing_payment_method_provider_mappings; v_attempt public.billing_provider_attempts; v_attempt_number integer;
begin
  if p_provider_reference is null or btrim(p_provider_reference) = '' or p_provider_idempotency_key is null or btrim(p_provider_idempotency_key) = '' then raise exception 'invalid_attempt_identity'; end if;
  select * into v_payment from public.billing_payments where id = p_billing_payment_id for update;
  if not found or v_payment.status not in ('pending', 'requires_action', 'failed', 'expired') then raise exception 'payment_not_eligible'; end if;
  select * into strict v_method from public.billing_payment_methods where id = v_payment.selected_payment_method_id;
  if not v_method.enabled or v_method.currency <> v_payment.currency or v_method.launch_phase <> 1 or (v_method.min_amount is not null and v_payment.price_amount < v_method.min_amount) or (v_method.max_amount is not null and v_payment.price_amount > v_method.max_amount) then raise exception 'payment_method_not_eligible'; end if;
  if exists (select 1 from public.billing_provider_attempts where billing_payment_id = v_payment.id and status in ('creating', 'unknown', 'requires_action', 'pending')) then raise exception 'active_attempt_exists'; end if;
  select * into strict v_mapping from public.billing_payment_method_provider_mappings where payment_method_id = v_payment.selected_payment_method_id and provider = p_provider and environment = p_environment and enabled;
  select coalesce(max(attempt_number), 0) + 1 into v_attempt_number from public.billing_provider_attempts where billing_payment_id = v_payment.id;
  if v_attempt_number > 100 then raise exception 'maximum_attempts_exceeded'; end if;
  insert into public.billing_provider_attempts (billing_payment_id, payment_method_id, provider_mapping_id, attempt_number, provider, environment, mapping_version, provider_method_type, provider_channel_code, mapping_config, provider_reference, provider_idempotency_key)
  values (v_payment.id, v_payment.selected_payment_method_id, v_mapping.id, v_attempt_number, v_mapping.provider, v_mapping.environment, v_mapping.mapping_version, v_mapping.provider_method_type, v_mapping.provider_channel_code, v_mapping.provider_config, p_provider_reference, p_provider_idempotency_key)
  returning * into v_attempt;
  return v_attempt;
end
$$;

create function public.receive_billing_webhook(p_provider text, p_environment text, p_deduplication_key text, p_event_type text, p_normalized_status text, p_provider_reference text, p_provider_payment_id text, p_amount bigint, p_currency text, p_occurred_at timestamptz)
returns uuid language plpgsql security definer set search_path = pg_catalog as $$
declare v_id uuid; v_existing public.billing_webhook_events;
begin
  insert into public.billing_webhook_events(provider, environment, deduplication_key, event_type, normalized_status, provider_reference, provider_payment_id, amount, currency, occurred_at)
  values (p_provider, p_environment, p_deduplication_key, p_event_type, p_normalized_status, p_provider_reference, p_provider_payment_id, p_amount, p_currency, p_occurred_at)
  on conflict (provider, environment, deduplication_key) do nothing returning id into v_id;
  if v_id is null then
    select * into strict v_existing from public.billing_webhook_events where provider = p_provider and environment = p_environment and deduplication_key = p_deduplication_key;
    if (v_existing.event_type, v_existing.normalized_status, v_existing.provider_reference, v_existing.provider_payment_id, v_existing.amount, v_existing.currency, v_existing.occurred_at) is distinct from (p_event_type, p_normalized_status, p_provider_reference, p_provider_payment_id, p_amount, p_currency, p_occurred_at) then raise exception 'webhook_deduplication_conflict'; end if;
    v_id := v_existing.id;
  end if;
  return v_id;
end
$$;

create function public.fulfill_billing_webhook(p_event_id uuid, p_max_attempts integer default 8, p_verified_failed_settlement boolean default false)
returns text language plpgsql security definer set search_path = pg_catalog as $$
declare v_event public.billing_webhook_events; v_attempt public.billing_provider_attempts; v_payment public.billing_payments; v_grant_id uuid; v_total bigint; v_balance bigint; v_outcome text; v_is_latest boolean;
begin
  if p_max_attempts not between 1 and 100 then raise exception 'invalid_max_attempts'; end if;
  select * into v_event from public.billing_webhook_events where id = p_event_id for update;
  if not found or v_event.status = 'processed' or (v_event.dead_lettered_at is not null and not (p_verified_failed_settlement and v_event.outcome_code = 'quarantined_paid_after_failed')) or v_event.attempt_count >= p_max_attempts or (v_event.status = 'failed' and (v_event.next_attempt_at is null or v_event.next_attempt_at > now()) and not (p_verified_failed_settlement and v_event.outcome_code = 'quarantined_paid_after_failed')) then return 'not_eligible'; end if;
  -- Unknown provider states require durable manual review and must not touch payment or attempt state.
  if v_event.normalized_status = 'requires_review' then
    update public.billing_webhook_events set status = 'failed', outcome_code = 'quarantined_requires_review', failed_at = now(), processed_at = null, next_attempt_at = null, dead_lettered_at = now(), last_error_sanitized = 'manual_webhook_status_review_required' where id = v_event.id;
    return 'quarantined_requires_review';
  end if;
  select * into strict v_attempt from public.billing_provider_attempts where provider = v_event.provider and environment = v_event.environment and provider_reference = v_event.provider_reference and provider_payment_id = v_event.provider_payment_id for update;
  select * into strict v_payment from public.billing_payments where id = v_attempt.billing_payment_id for update;
  if v_event.amount <> v_payment.price_amount or v_event.currency <> v_payment.currency then raise exception 'settlement_mismatch'; end if;
  select not exists (select 1 from public.billing_provider_attempts where billing_payment_id = v_payment.id and attempt_number > v_attempt.attempt_number) into v_is_latest;
  if v_event.normalized_status = 'paid' and v_payment.status = 'failed' and not p_verified_failed_settlement then
    update public.billing_provider_attempts set raw_provider_status = v_event.normalized_status, updated_at = now() where id = v_attempt.id;
    update public.billing_webhook_events set status = 'failed', outcome_code = 'quarantined_paid_after_failed', failed_at = now(), processed_at = null, next_attempt_at = null, dead_lettered_at = now(), last_error_sanitized = 'manual_settlement_verification_required' where id = v_event.id;
    return 'quarantined_paid_after_failed';
  end if;
  update public.billing_provider_attempts set status = case when status = 'paid' then status when v_event.normalized_status in ('paid', 'pending', 'requires_action', 'failed', 'expired') then v_event.normalized_status else status end, raw_provider_status = v_event.normalized_status, completed_at = case when status = 'paid' then completed_at when v_event.normalized_status in ('paid', 'failed', 'expired') then v_event.occurred_at else completed_at end, updated_at = now() where id = v_attempt.id;
  if v_event.normalized_status = 'paid' and v_payment.status = 'failed' and not p_verified_failed_settlement then v_outcome := 'quarantined_paid_after_failed';
  elsif v_event.normalized_status = 'paid' and v_payment.status <> 'paid' and v_payment.status <> 'cancelled' then
    v_total := v_payment.base_credits + v_payment.bonus_credits;
    if v_total <= 0 then raise exception 'invalid_credit_total'; end if;
    insert into public.credit_wallets(user_id, balance) values (v_payment.user_id, 0) on conflict (user_id) do nothing;
    select balance into v_balance from public.credit_wallets where user_id = v_payment.user_id for update;
    insert into public.credit_grants(user_id, billing_payment_id, pricing_plan_id, amount, remaining_amount, granted_at, expires_at)
    values (v_payment.user_id, v_payment.id, v_payment.pricing_plan_id, v_total, v_total, v_event.occurred_at, v_event.occurred_at + make_interval(days => v_payment.credit_expires_in_days))
    on conflict (billing_payment_id) do nothing returning id into v_grant_id;
    if v_grant_id is not null then
      v_balance := v_balance + v_total;
      update public.credit_wallets set balance = v_balance, updated_at = now() where user_id = v_payment.user_id;
      insert into public.credit_ledger_entries(user_id, billing_payment_id, credit_grant_id, entry_type, amount, balance_after, idempotency_key) values (v_payment.user_id, v_payment.id, v_grant_id, 'purchase_grant', v_total, v_balance, 'purchase:' || v_payment.id::text);
      update public.billing_payments set status = 'paid', paid_at = v_event.occurred_at, settlement_audit_code = case when v_payment.status = 'expired' then 'late_paid_after_expiry' when v_payment.status = 'failed' then 'paid_after_failure' end, updated_at = now() where id = v_payment.id;
      v_outcome := 'fulfilled';
    else
      if not exists (select 1 from public.credit_grants g join public.credit_ledger_entries l on l.credit_grant_id = g.id and l.billing_payment_id = g.billing_payment_id and l.user_id = g.user_id where g.billing_payment_id = v_payment.id and g.user_id = v_payment.user_id and g.pricing_plan_id = v_payment.pricing_plan_id and g.amount = v_total and l.entry_type = 'purchase_grant' and l.amount = v_total) then raise exception 'duplicate_grant_inconsistent'; end if;
      v_outcome := 'duplicate_paid';
    end if;
  elsif v_event.normalized_status = 'paid' and v_payment.status = 'cancelled' then v_outcome := 'quarantined_paid_after_cancelled';
  elsif v_payment.status = 'paid' then v_outcome := 'already_paid';
  elsif v_event.normalized_status <> 'paid' and not v_is_latest then v_outcome := 'stale_attempt_observation';
  elsif v_event.normalized_status in ('failed', 'expired', 'cancelled') and v_payment.status in ('pending', 'requires_action') then update public.billing_payments set status = v_event.normalized_status, updated_at = now() where id = v_payment.id; v_outcome := 'terminal_observation';
  elsif v_event.normalized_status = 'requires_action' and v_payment.status = 'pending' then update public.billing_payments set status = 'requires_action', updated_at = now() where id = v_payment.id; v_outcome := 'requires_action';
  else v_outcome := 'no_op'; end if;
  update public.billing_webhook_events set status = 'processed', outcome_code = v_outcome, processed_at = now(), failed_at = null, next_attempt_at = null, dead_lettered_at = null, last_error_sanitized = null where id = v_event.id;
  return v_outcome;
end
$$;

create function public.record_billing_webhook_failure(p_event_id uuid, p_error_sanitized text, p_max_attempts integer default 8, p_base_delay_seconds integer default 30, p_max_delay_seconds integer default 3600)
returns boolean language plpgsql security definer set search_path = pg_catalog as $$
declare v_count integer;
begin
  if p_max_attempts not between 1 and 100 or p_base_delay_seconds not between 1 and 86400 or p_max_delay_seconds not between p_base_delay_seconds and 604800 then raise exception 'invalid_retry_parameters'; end if;
  update public.billing_webhook_events set status = 'failed', attempt_count = attempt_count + 1, last_error_sanitized = left(p_error_sanitized, 500), failed_at = now(), next_attempt_at = case when attempt_count + 1 >= p_max_attempts then null else now() + make_interval(secs => least(p_max_delay_seconds::numeric, p_base_delay_seconds::numeric * power(2::numeric, least(attempt_count, 100)))::double precision) end, dead_lettered_at = case when attempt_count + 1 >= p_max_attempts then now() else null end
  where id = p_event_id and status in ('received', 'failed') and dead_lettered_at is null and attempt_count < p_max_attempts and (status = 'received' or next_attempt_at <= now()) returning attempt_count into v_count;
  return found;
end
$$;

alter table public.billing_payment_methods enable row level security;
alter table public.billing_payment_method_provider_mappings enable row level security;
alter table public.billing_payments enable row level security;
alter table public.billing_provider_attempts enable row level security;
alter table public.billing_webhook_events enable row level security;
alter table public.credit_wallets enable row level security;
alter table public.credit_grants enable row level security;
alter table public.credit_ledger_entries enable row level security;

create policy "Users can read enabled billing payment methods" on public.billing_payment_methods for select to authenticated using (enabled);
create policy "Users can read own billing payments" on public.billing_payments for select to authenticated using (auth.uid() = user_id);
create policy "Users can read own credit wallet" on public.credit_wallets for select to authenticated using (auth.uid() = user_id);
create policy "Users can read own credit grants" on public.credit_grants for select to authenticated using (auth.uid() = user_id);
create policy "Users can read own credit ledger" on public.credit_ledger_entries for select to authenticated using (auth.uid() = user_id);

grant select on public.billing_payment_methods, public.billing_payments, public.credit_wallets, public.credit_grants, public.credit_ledger_entries to authenticated;
revoke all on public.billing_payment_method_provider_mappings, public.billing_provider_attempts, public.billing_webhook_events from public, anon, authenticated;
revoke insert, update, delete, truncate, references, trigger on public.billing_payment_methods, public.billing_payments, public.credit_wallets, public.credit_grants, public.credit_ledger_entries from anon, authenticated;
revoke all on function public.reject_credit_ledger_mutation(), public.restrict_billing_attempt_update(), public.allocate_billing_provider_attempt(uuid, text, text, text, text), public.receive_billing_webhook(text, text, text, text, text, text, text, bigint, text, timestamptz), public.fulfill_billing_webhook(uuid, integer, boolean), public.record_billing_webhook_failure(uuid, text, integer, integer, integer) from public, anon, authenticated;
revoke all on public.billing_payment_methods, public.billing_payment_method_provider_mappings, public.billing_payments, public.billing_provider_attempts, public.billing_webhook_events, public.credit_wallets, public.credit_grants, public.credit_ledger_entries from service_role;
-- Repository access is limited to checkout orchestration; credit fulfillment remains RPC-only.
grant select on public.billing_payment_methods, public.billing_payment_method_provider_mappings to service_role;
grant insert, select on public.billing_payments to service_role;
grant select on public.billing_provider_attempts to service_role;
grant update (provider_payment_id, status, actions, expires_at) on public.billing_provider_attempts to service_role;
grant select on public.billing_webhook_events to service_role;
grant execute on function public.allocate_billing_provider_attempt(uuid, text, text, text, text), public.receive_billing_webhook(text, text, text, text, text, text, text, bigint, text, timestamptz), public.fulfill_billing_webhook(uuid, integer, boolean), public.record_billing_webhook_failure(uuid, text, integer, integer, integer) to service_role;

insert into public.billing_payment_methods(slug, kind, label, description, currency, enabled, launch_phase, sort_order)
values ('qris', 'qris', 'QRIS', 'Pay with QRIS', 'IDR', false, 1, 10)
on conflict (slug) do nothing;

do $$
begin
  if not exists (select 1 from public.billing_payment_methods where slug = 'qris' and kind = 'qris' and label = 'QRIS' and description = 'Pay with QRIS' and currency = 'IDR' and enabled = false and launch_phase = 1 and sort_order = 10 and min_amount is null and max_amount is null and logo_url is null) then
    raise exception 'billing_payment_method_seed_conflict:qris';
  end if;
end
$$;

insert into public.billing_payment_method_provider_mappings(payment_method_id, provider, environment, mapping_version, provider_method_type, provider_channel_code, provider_config, enabled)
select id, 'xendit', environment, 1, 'QR_CODE', 'QRIS', '{}'::jsonb, false
from public.billing_payment_methods cross join (values ('test'), ('production')) as environments(environment)
where slug = 'qris'
on conflict (payment_method_id, provider, environment, mapping_version) do nothing;

do $$
begin
  if exists (
    select 1
    from public.billing_payment_methods m
    cross join (values ('test'), ('production')) as environments(environment)
    left join public.billing_payment_method_provider_mappings pm on pm.payment_method_id = m.id and pm.provider = 'xendit' and pm.environment = environments.environment and pm.mapping_version = 1
    where m.slug = 'qris' and (pm.id is null or pm.provider_method_type <> 'QR_CODE' or pm.provider_channel_code <> 'QRIS' or pm.provider_config <> '{}'::jsonb or pm.enabled <> false)
  ) then
    raise exception 'billing_provider_mapping_seed_conflict:qris';
  end if;
end
$$;

commit;

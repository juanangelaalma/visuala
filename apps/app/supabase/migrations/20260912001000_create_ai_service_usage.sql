begin;

create table public.ai_service_operations (
  request_id uuid primary key,
  task text not null,
  user_id uuid not null,
  project_id uuid,
  prompt_version text not null,
  schema_name text,
  schema_version text,
  profile_id text not null,
  provider text not null,
  model text not null,
  status text not null check (status in ('started', 'succeeded', 'failed')),
  latency_ms integer check (latency_ms is null or latency_ms >= 0),
  attempt_count integer check (attempt_count is null or attempt_count >= 0),
  finish_reason text,
  input_tokens bigint check (input_tokens is null or input_tokens >= 0),
  output_tokens bigint check (output_tokens is null or output_tokens >= 0),
  total_tokens bigint check (total_tokens is null or total_tokens >= 0),
  estimated_cost numeric(20, 9) check (estimated_cost is null or estimated_cost >= 0),
  cost_currency text,
  pricing_version text,
  pricing_source text,
  cost_complete boolean not null default false,
  error_code text,
  diagnostic_sanitized varchar(1000),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (
      cost_complete
      and estimated_cost is not null
      and cost_currency is not null
      and pricing_version is not null
      and pricing_source is not null
    )
    or (
      not cost_complete
      and estimated_cost is null
      and cost_currency is null
      and pricing_version is null
      and pricing_source is null
    )
  )
);

create table public.ai_service_attempts (
  attempt_id uuid primary key,
  request_id uuid not null references public.ai_service_operations(request_id) on delete cascade,
  attempt_number integer not null check (attempt_number > 0),
  profile_id text not null,
  provider text not null,
  model text not null,
  status text not null check (status in ('started', 'succeeded', 'failed')),
  provider_request_id text,
  latency_ms integer check (latency_ms is null or latency_ms >= 0),
  input_tokens bigint check (input_tokens is null or input_tokens >= 0),
  output_tokens bigint check (output_tokens is null or output_tokens >= 0),
  total_tokens bigint check (total_tokens is null or total_tokens >= 0),
  dispatch_outcome text not null default 'not_sent' check (dispatch_outcome in ('not_sent', 'rejected', 'ambiguous')),
  usage_unknown boolean not null default false,
  billing_unknown boolean not null default false,
  estimated_cost numeric(20, 9) check (estimated_cost is null or estimated_cost >= 0),
  cost_currency text,
  pricing_version text,
  pricing_source text,
  cost_complete boolean not null default false,
  error_code text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (request_id, attempt_number),
  check (
    (cost_complete and estimated_cost is not null and cost_currency is not null and pricing_version is not null and pricing_source is not null)
    or (not cost_complete and estimated_cost is null and cost_currency is null and pricing_version is null and pricing_source is null)
  ),
  check (not usage_unknown or (input_tokens is null and output_tokens is null and total_tokens is null)),
  check (not billing_unknown or dispatch_outcome = 'ambiguous')
);

create index ai_service_operations_user_id_created_at_idx on public.ai_service_operations (user_id, created_at);
create index ai_service_operations_task_status_created_at_idx on public.ai_service_operations (task, status, created_at);
create index ai_service_attempts_request_id_created_at_idx on public.ai_service_attempts (request_id, created_at);
create index ai_service_attempts_status_created_at_idx on public.ai_service_attempts (status, created_at);

create function public.set_ai_service_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_ai_service_operations_updated_at
before update on public.ai_service_operations
for each row execute function public.set_ai_service_updated_at();

create trigger set_ai_service_attempts_updated_at
before update on public.ai_service_attempts
for each row execute function public.set_ai_service_updated_at();

alter table public.ai_service_operations enable row level security;
revoke all on table public.ai_service_operations from anon, authenticated;
grant select, insert, update, delete on table public.ai_service_operations to service_role;

alter table public.ai_service_attempts enable row level security;
revoke all on table public.ai_service_attempts from anon, authenticated;
grant select, insert, update, delete on table public.ai_service_attempts to service_role;

commit;

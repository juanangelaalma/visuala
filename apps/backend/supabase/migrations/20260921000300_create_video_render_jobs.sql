begin;

create table public.video_render_jobs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.video_projects(id) on delete cascade,
  user_id uuid not null,
  idempotency_key text not null check (char_length(idempotency_key) between 8 and 200),
  brief_revision_id uuid not null references public.video_brief_revisions(id) on delete restrict,
  storyboard_revision_id uuid not null references public.video_storyboard_revisions(id) on delete restrict,
  parent_version_id uuid,
  is_revision boolean not null,
  input_snapshot jsonb not null,
  status text not null default 'queued' check (status in ('queued', 'preparing', 'rendering', 'uploading', 'succeeded', 'failed', 'cancelled')),
  attempts integer not null default 0 check (attempts >= 0),
  queued_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, idempotency_key)
);

create unique index video_render_jobs_active_project_idx on public.video_render_jobs (project_id) where status in ('queued', 'preparing', 'rendering', 'uploading');
create index video_render_jobs_status_queued_at_idx on public.video_render_jobs (status, queued_at);
create index video_render_jobs_user_created_at_idx on public.video_render_jobs (user_id, created_at desc);

create table public.video_versions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.video_projects(id) on delete cascade,
  user_id uuid not null,
  version_number integer not null check (version_number > 0),
  render_job_id uuid not null unique references public.video_render_jobs(id) on delete restrict,
  parent_version_id uuid references public.video_versions(id) on delete restrict,
  output_object_key text not null unique,
  duration_seconds integer not null check (duration_seconds > 0),
  aspect_ratio text not null,
  resolution text not null,
  manifest_hash text not null check (manifest_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  unique (project_id, version_number)
);

create index video_versions_project_version_idx on public.video_versions (project_id, version_number desc);

create table public.video_moderation_events (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.video_projects(id) on delete cascade,
  user_id uuid not null,
  subject_type text not null check (subject_type in ('prompt', 'asset', 'message')),
  subject_id text not null,
  provider text not null,
  policy_version text not null,
  decision text not null check (decision in ('allowed', 'blocked', 'review')),
  reason_code text,
  created_at timestamptz not null default now()
);

create index video_moderation_events_project_created_at_idx on public.video_moderation_events (project_id, created_at desc);

create trigger set_video_render_jobs_updated_at
before update on public.video_render_jobs
for each row execute function public.set_video_updated_at();

alter table public.video_render_jobs enable row level security;
revoke all on table public.video_render_jobs from anon, authenticated;
grant select, insert, update, delete on table public.video_render_jobs to service_role;

alter table public.video_versions enable row level security;
revoke all on table public.video_versions from anon, authenticated;
grant select, insert, update, delete on table public.video_versions to service_role;

alter table public.video_moderation_events enable row level security;
revoke all on table public.video_moderation_events from anon, authenticated;
grant select, insert, update, delete on table public.video_moderation_events to service_role;

commit;

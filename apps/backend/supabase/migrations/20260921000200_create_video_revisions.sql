begin;

create table public.video_brief_revisions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.video_projects(id) on delete cascade,
  user_id uuid not null,
  version integer not null check (version > 0),
  schema_version text not null,
  brief jsonb not null,
  is_complete boolean not null default false,
  generated_by jsonb not null,
  source_message_ids uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  unique (project_id, version)
);

create index video_brief_revisions_project_version_idx on public.video_brief_revisions (project_id, version desc);

create table public.video_storyboard_revisions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.video_projects(id) on delete cascade,
  user_id uuid not null,
  version integer not null check (version > 0),
  schema_version text not null,
  brief_revision_id uuid not null references public.video_brief_revisions(id) on delete restrict,
  scenes jsonb not null,
  total_duration_seconds integer not null check (total_duration_seconds in (6, 10, 15)),
  generated_by jsonb not null,
  approved_at timestamptz,
  approval_snapshot jsonb,
  created_at timestamptz not null default now(),
  unique (project_id, version),
  check ((approved_at is null) = (approval_snapshot is null))
);

create index video_storyboard_revisions_project_version_idx on public.video_storyboard_revisions (project_id, version desc);

alter table public.video_brief_revisions enable row level security;
revoke all on table public.video_brief_revisions from anon, authenticated;
grant select, insert, delete on table public.video_brief_revisions to service_role;
grant update (is_complete) on public.video_brief_revisions to service_role;

alter table public.video_storyboard_revisions enable row level security;
revoke all on table public.video_storyboard_revisions from anon, authenticated;
grant select, insert, delete on table public.video_storyboard_revisions to service_role;
grant update (approved_at, approval_snapshot) on public.video_storyboard_revisions to service_role;

commit;

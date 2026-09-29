begin;

-- The composition engine replaces the storyboard pipeline outright: a composition is planned, validated
-- and frozen as one unit, so a storyboard revision has nothing left to hold, and a render job points at
-- the frozen artifact rather than at a pair of revisions.
drop table public.video_versions;
drop table public.video_render_jobs;
drop table public.video_storyboard_revisions;

-- Kept projects are re-pointed at the one Design Pack this pipeline ships. Their briefs survive; their
-- compositions do not exist yet, so the next step for them is regeneration, not a render.
update public.video_projects set style_id = 'creative-mode';

alter table public.video_projects drop constraint video_projects_style_id_check;
alter table public.video_projects drop constraint video_projects_video_type_check;
alter table public.video_projects drop constraint video_projects_duration_seconds_check;

alter table public.video_projects
  add constraint video_projects_style_id_check check (style_id in ('creative-mode')),
  add constraint video_projects_video_type_check check (video_type in ('product_promo', 'discount_promo', 'product_launch', 'menu_showcase', 'storefront_showcase')),
  add constraint video_projects_duration_seconds_check check (duration_seconds between 4 and 30);

create table public.video_art_direction_revisions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.video_projects(id) on delete cascade,
  user_id uuid not null,
  version integer not null check (version > 0),
  schema_version text not null,
  art_direction jsonb not null,
  generated_by jsonb not null,
  source_message_ids uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  unique (project_id, version)
);

create index video_art_direction_revisions_project_version_idx on public.video_art_direction_revisions (project_id, version desc);

-- The validated spec, the direction it realises, and the shortlist the planner was allowed to name, so a
-- rejected plan can be explained without re-running the model.
create table public.video_composition_revisions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.video_projects(id) on delete cascade,
  user_id uuid not null,
  version integer not null check (version > 0),
  schema_version text not null,
  brief_revision_id uuid not null references public.video_brief_revisions(id) on delete restrict,
  art_direction_revision_id uuid not null references public.video_art_direction_revisions(id) on delete restrict,
  design_pack_id text not null,
  design_pack_version text not null,
  spec jsonb not null,
  validation_report jsonb not null,
  candidates jsonb not null default '[]',
  is_fallback boolean not null default false,
  generated_by jsonb,
  created_at timestamptz not null default now(),
  unique (project_id, version),
  check ((is_fallback and generated_by is null) or (not is_fallback and generated_by is not null))
);

create index video_composition_revisions_project_version_idx on public.video_composition_revisions (project_id, version desc);

-- A frozen artifact is identified by the hash of its own bytes: preview and export render the same bytes,
-- and the same composition compiled twice is stored once.
create table public.video_composition_artifacts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.video_projects(id) on delete cascade,
  user_id uuid not null,
  composition_revision_id uuid not null references public.video_composition_revisions(id) on delete restrict,
  design_pack_id text not null,
  design_pack_version text not null,
  compiler_version text not null,
  module_versions jsonb not null,
  asset_hashes jsonb not null,
  catalog_components text[] not null default '{}',
  composition_hash text not null check (composition_hash ~ '^[0-9a-f]{64}$'),
  artifact_prefix text not null unique,
  created_at timestamptz not null default now(),
  unique (composition_hash)
);

create index video_composition_artifacts_project_created_at_idx on public.video_composition_artifacts (project_id, created_at desc);

create table public.video_render_jobs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.video_projects(id) on delete cascade,
  user_id uuid not null,
  idempotency_key text not null check (char_length(idempotency_key) between 8 and 200),
  composition_artifact_id uuid not null references public.video_composition_artifacts(id) on delete restrict,
  kind text not null check (kind in ('preview', 'final')),
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

-- A preview is a version too: same code path, same provenance, and the UI lists only `final` ones for
-- download. The duration is free within the project's own range because the project owns that choice.
create table public.video_versions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.video_projects(id) on delete cascade,
  user_id uuid not null,
  version_number integer not null check (version_number > 0),
  render_job_id uuid not null unique references public.video_render_jobs(id) on delete restrict,
  parent_version_id uuid references public.video_versions(id) on delete restrict,
  output_object_key text not null unique,
  kind text not null check (kind in ('preview', 'final')),
  duration_seconds integer not null check (duration_seconds between 1 and 60),
  aspect_ratio text not null,
  resolution text not null,
  composition_hash text not null check (composition_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  unique (project_id, version_number)
);

create index video_versions_project_version_idx on public.video_versions (project_id, version_number desc);

create table public.video_composition_events (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.video_projects(id) on delete cascade,
  user_id uuid not null,
  composition_revision_id uuid references public.video_composition_revisions(id) on delete set null,
  render_job_id uuid references public.video_render_jobs(id) on delete set null,
  event text not null,
  recipe text,
  design_pack_id text,
  design_pack_version text,
  catalog_components text[] not null default '{}',
  planner_latency_ms integer check (planner_latency_ms is null or planner_latency_ms >= 0),
  is_fallback boolean,
  render_status text,
  render_duration_ms integer check (render_duration_ms is null or render_duration_ms >= 0),
  render_error_code text,
  llm_cost_amount numeric(12, 9) check (llm_cost_amount is null or llm_cost_amount >= 0),
  llm_cost_currency text,
  created_at timestamptz not null default now()
);

create index video_composition_events_project_created_at_idx on public.video_composition_events (project_id, created_at desc);

create trigger set_video_render_jobs_updated_at
before update on public.video_render_jobs
for each row execute function public.set_video_updated_at();

alter table public.video_art_direction_revisions enable row level security;
revoke all on table public.video_art_direction_revisions from anon, authenticated;

alter table public.video_composition_revisions enable row level security;
revoke all on table public.video_composition_revisions from anon, authenticated;

alter table public.video_composition_artifacts enable row level security;
revoke all on table public.video_composition_artifacts from anon, authenticated;

alter table public.video_render_jobs enable row level security;
revoke all on table public.video_render_jobs from anon, authenticated;

alter table public.video_versions enable row level security;
revoke all on table public.video_versions from anon, authenticated;

alter table public.video_composition_events enable row level security;
revoke all on table public.video_composition_events from anon, authenticated;

-- Revision and artifact rows are append-only, so the grant carries no blanket update.
grant select, insert, delete on table public.video_art_direction_revisions to service_role;
grant select, insert, delete on table public.video_composition_revisions to service_role;
grant select, insert, delete on table public.video_composition_artifacts to service_role;
grant select, insert, delete on table public.video_composition_events to service_role;
grant select, insert, update, delete on table public.video_render_jobs to service_role;
grant select, insert, delete on table public.video_versions to service_role;

-- A frozen artifact is a directory of files, not one MP4: stylesheets, scripts, fonts, the block assets it
-- vendored, and the preview MP4. The bucket was images-and-mp4 only, so the allowlist widens again.
update storage.buckets
set allowed_mime_types = array[
  'image/jpeg', 'image/png', 'image/webp', 'image/svg+xml',
  'video/mp4', 'audio/mp4', 'audio/mpeg',
  'text/html', 'text/css', 'text/javascript', 'font/woff2', 'application/json'
]
where id = 'assets';

commit;

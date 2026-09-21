begin;

create table public.video_projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  video_type text not null check (video_type in ('product_promo', 'discount_promo', 'product_launch', 'menu_showcase')),
  style_id text not null check (style_id in ('bold_pop', 'clean_product', 'warm_artisan', 'premium_dark')),
  duration_seconds integer not null check (duration_seconds in (6, 10, 15)),
  aspect_ratio text not null check (aspect_ratio in ('9:16', '1:1', '16:9')),
  resolution text not null check (resolution in ('720p', '1080p')),
  language text not null check (char_length(language) between 2 and 12),
  voice_over_enabled boolean not null default true,
  music_enabled boolean not null default true,
  status text not null default 'draft' check (status in ('draft', 'interviewing', 'awaiting_approval', 'approved', 'rendering', 'ready', 'revision_draft', 'moderation_blocked', 'failed', 'deleted')),
  revision_render_count integer not null default 0 check (revision_render_count >= 0 and revision_render_count <= 3),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index video_projects_user_created_at_idx on public.video_projects (user_id, created_at desc);
create index video_projects_user_status_idx on public.video_projects (user_id, status);

create table public.video_project_assets (
  id uuid primary key,
  project_id uuid not null references public.video_projects(id) on delete cascade,
  user_id uuid not null,
  object_key text not null unique,
  mime_type text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp')),
  byte_size integer not null check (byte_size > 0 and byte_size <= 10485760),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  width integer not null check (width > 0),
  height integer not null check (height > 0),
  rights_confirmed_at timestamptz not null,
  moderation_status text not null default 'pending' check (moderation_status in ('pending', 'allowed', 'blocked')),
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);

create index video_project_assets_project_created_at_idx on public.video_project_assets (project_id, created_at);

create table public.video_messages (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.video_projects(id) on delete cascade,
  user_id uuid not null,
  role text not null check (role in ('user', 'assistant')),
  content text not null check (char_length(content) between 1 and 4000),
  controls jsonb,
  asset_ids uuid[] not null default '{}',
  created_at timestamptz not null default now()
);

create index video_messages_project_created_at_idx on public.video_messages (project_id, created_at);

create function public.set_video_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_video_projects_updated_at
before update on public.video_projects
for each row execute function public.set_video_updated_at();

alter table public.video_projects enable row level security;
revoke all on table public.video_projects from anon, authenticated;
grant select, insert, update, delete on table public.video_projects to service_role;

alter table public.video_project_assets enable row level security;
revoke all on table public.video_project_assets from anon, authenticated;
grant select, insert, update, delete on table public.video_project_assets to service_role;

alter table public.video_messages enable row level security;
revoke all on table public.video_messages from anon, authenticated;
grant select, insert, update, delete on table public.video_messages to service_role;

commit;

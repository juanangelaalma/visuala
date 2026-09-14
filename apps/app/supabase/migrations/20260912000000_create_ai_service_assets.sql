begin;

create table public.ai_assets (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  object_key text not null unique,
  mime_type text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp')),
  byte_size integer not null check (byte_size > 0 and byte_size <= 10485760),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  width integer not null check (width > 0),
  height integer not null check (height > 0),
  validated boolean not null default false,
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);

create index ai_assets_user_id_created_at_idx on public.ai_assets (user_id, created_at);
alter table public.ai_assets enable row level security;
revoke all on table public.ai_assets from anon, authenticated;
grant select, insert, update, delete on table public.ai_assets to service_role;

commit;

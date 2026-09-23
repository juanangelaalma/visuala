alter table public.video_projects
  add column idempotency_key uuid;

create unique index video_projects_user_id_idempotency_key_key
  on public.video_projects (user_id, idempotency_key)
  where idempotency_key is not null;

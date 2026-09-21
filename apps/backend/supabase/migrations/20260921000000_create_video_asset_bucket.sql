begin;

-- One neutral bucket holds every asset family: AI-service assets use the `ai-assets/` key prefix
-- and project assets use `video-projects/`. Prefixes carry the semantics, not the bucket name, so
-- the name stays neutral as more families arrive (the render plan adds `video-versions/`).
-- Supabase rejects `delete from storage.buckets`, so renaming a live bucket is not possible from a
-- migration; this name must be right the first time.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('assets', 'assets', false, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

commit;

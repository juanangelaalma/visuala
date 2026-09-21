begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('assets', 'assets', false, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

do $$
begin
  if not exists (select 1 from storage.objects where bucket_id = 'video-assets') then
    delete from storage.buckets where id = 'video-assets';
  else
    raise exception 'Cannot drop the legacy "video-assets" bucket: it still holds objects. Move or delete them before applying this migration.';
  end if;
end
$$;

commit;

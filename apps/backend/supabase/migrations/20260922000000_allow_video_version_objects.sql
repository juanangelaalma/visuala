begin;

-- The render worker writes `video-versions/<projectId>/<versionId>.mp4` into the same neutral bucket
-- as the image assets. The bucket was created images-only with a 10 MB ceiling, which no MP4 can
-- satisfy, so the allowlist and the ceiling are widened here. A data migration is not possible:
-- `storage.buckets` also has a database-level trigger that the service role cannot bypass from SQL
-- for a delete, but a plain update is fine.
update storage.buckets
set file_size_limit = 524288000,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'video/mp4']
where id = 'assets';

commit;

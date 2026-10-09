begin;

update storage.buckets set public = false, file_size_limit = 268435456,
  allowed_mime_types = array['image/jpeg','image/png','image/webp','video/mp4']
  where id = 'assets';

create unique index video_projects_id_owner_idx on public.video_projects(id, user_id);

create table public.fnb_campaigns (
  id uuid primary key,
  user_id uuid not null,
  title text not null check (char_length(title) between 1 and 120),
  revision integer not null default 0 check (revision >= 0),
  status text not null default 'draft' check (status in ('draft','approved','rendering','completed','failed')),
  draft jsonb,
  initial_plan jsonb,
  composition_revision integer,
  composition_hash text check (composition_hash ~ '^[0-9a-f]{64}$'),
  validation_errors jsonb not null default '[]'::jsonb check (jsonb_typeof(validation_errors) = 'array'),
  approved_revision integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(id, user_id),
  foreign key (id, user_id) references public.video_projects(id, user_id) on delete restrict,
  check (composition_revision is null or composition_revision <= revision),
  check ((composition_revision is null) = (composition_hash is null)),
  check (approved_revision is null or approved_revision <= revision)
);

create table public.fnb_campaign_versions (
  campaign_id uuid not null,
  user_id uuid not null,
  revision integer not null check (revision > 0),
  draft jsonb not null,
  composition_html text,
  composition_hash text check (composition_hash ~ '^[0-9a-f]{64}$'),
  composition_spec jsonb,
  validated boolean not null default false,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  primary key(campaign_id, revision),
  unique(campaign_id, user_id, revision),
  foreign key(campaign_id, user_id) references public.fnb_campaigns(id, user_id) on delete restrict,
  check ((composition_html is null) = (composition_hash is null)),
  check (not validated or (composition_html is not null and composition_spec is not null)),
  check (approved_at is null or validated)
);

create table public.fnb_render_jobs (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null,
  user_id uuid not null,
  revision integer not null,
  idempotency_key text not null check (char_length(idempotency_key) between 8 and 200),
  status text not null default 'queued' check (status in ('queued','rendering','completed','failed')),
  error text,
  output_object_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(campaign_id, idempotency_key),
  foreign key(campaign_id, user_id, revision) references public.fnb_campaign_versions(campaign_id, user_id, revision) on delete restrict,
  check (status <> 'completed' or output_object_key is not null)
);
create unique index fnb_render_jobs_active_idx on public.fnb_render_jobs(campaign_id) where status in ('queued','rendering');
create index fnb_render_jobs_queue_idx on public.fnb_render_jobs(created_at) where status = 'queued';
create index fnb_campaigns_owner_idx on public.fnb_campaigns(user_id, created_at desc);
create index fnb_render_jobs_owner_idx on public.fnb_render_jobs(user_id, campaign_id, created_at desc);

create trigger set_fnb_campaigns_updated_at before update on public.fnb_campaigns
for each row execute function public.set_video_updated_at();
create trigger set_fnb_render_jobs_updated_at before update on public.fnb_render_jobs
for each row execute function public.set_video_updated_at();

create function public.protect_fnb_campaign_version() returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'DELETE' then raise exception 'fnb_version_immutable'; end if;
  if old.approved_at is not null then raise exception 'fnb_version_immutable'; end if;
  if (new.campaign_id, new.user_id, new.revision, new.draft, new.created_at)
    is distinct from (old.campaign_id, old.user_id, old.revision, old.draft, old.created_at)
    then raise exception 'fnb_version_immutable'; end if;
  if old.composition_html is not null and
    (new.composition_html, new.composition_hash, new.composition_spec, new.validated)
    is distinct from (old.composition_html, old.composition_hash, old.composition_spec, old.validated)
    then raise exception 'fnb_version_immutable'; end if;
  return new;
end;
$$;
create trigger protect_fnb_campaign_version before update or delete on public.fnb_campaign_versions
for each row execute function public.protect_fnb_campaign_version();

alter table public.fnb_campaigns enable row level security;
alter table public.fnb_campaign_versions enable row level security;
alter table public.fnb_render_jobs enable row level security;
create policy fnb_campaign_owner_read on public.fnb_campaigns for select to authenticated using (user_id = auth.uid());
create policy fnb_version_owner_read on public.fnb_campaign_versions for select to authenticated using (user_id = auth.uid());
create policy fnb_job_owner_read on public.fnb_render_jobs for select to authenticated using (user_id = auth.uid());
revoke all on public.fnb_campaigns, public.fnb_campaign_versions, public.fnb_render_jobs from anon, authenticated;
grant select on public.fnb_campaigns, public.fnb_campaign_versions, public.fnb_render_jobs to authenticated;
grant select, insert, update on public.fnb_campaigns, public.fnb_campaign_versions, public.fnb_render_jobs to service_role;

create function public.create_fnb_campaign(p_id uuid, p_user_id uuid, p_title text)
returns public.fnb_campaigns language plpgsql set search_path = public as $$
declare result public.fnb_campaigns;
begin
  insert into public.video_projects(id,user_id,title,video_type,style_id,duration_seconds,aspect_ratio,resolution,language,voice_over_enabled,music_enabled)
  values(p_id,p_user_id,p_title,'discount_promo','bold_pop',15,'9:16','1080p','id',false,false);
  insert into public.fnb_campaigns(id,user_id,title) values(p_id,p_user_id,p_title) returning * into result;
  return result;
end;
$$;

create function public.save_fnb_campaign_draft(p_id uuid,p_user_id uuid,p_expected_revision integer,p_draft jsonb,p_initial_plan jsonb default null)
returns public.fnb_campaigns language plpgsql set search_path = public as $$
declare result public.fnb_campaigns;
begin
  select c.* into result from public.fnb_campaigns c join public.video_projects p on p.id = c.id
    where c.id = p_id and c.user_id = p_user_id and p.deleted_at is null for update of c;
  if not found then raise exception 'fnb_not_found'; end if;
  if result.revision <> p_expected_revision then raise exception 'fnb_revision_conflict'; end if;
  update public.fnb_campaigns set revision = revision + 1,draft = p_draft,
    initial_plan = coalesce(p_initial_plan,initial_plan),status = 'draft',approved_revision = null,
    validation_errors = '["Composition is being validated."]'::jsonb
    where id = p_id returning * into result;
  insert into public.fnb_campaign_versions(campaign_id,user_id,revision,draft)
    values(p_id,p_user_id,result.revision,p_draft);
  return result;
end;
$$;

create function public.complete_fnb_campaign_composition(p_id uuid,p_user_id uuid,p_revision integer,p_html text,p_hash text,p_spec jsonb,p_errors jsonb)
returns public.fnb_campaigns language plpgsql set search_path = public as $$
declare result public.fnb_campaigns; is_valid boolean;
begin
  select * into result from public.fnb_campaigns where id = p_id and user_id = p_user_id for update;
  if not found then raise exception 'fnb_not_found'; end if;
  if result.revision <> p_revision then raise exception 'fnb_revision_conflict'; end if;
  if result.approved_revision is not null then raise exception 'fnb_approval_conflict'; end if;
  is_valid := jsonb_array_length(p_errors) = 0 and p_html is not null;
  update public.fnb_campaign_versions set composition_html = p_html,composition_hash = p_hash,composition_spec = p_spec,validated = is_valid
    where campaign_id = p_id and user_id = p_user_id and revision = p_revision and composition_html is null and approved_at is null;
  if not found then raise exception 'fnb_revision_conflict'; end if;
  update public.fnb_campaigns set validation_errors = p_errors,
    composition_revision = case when is_valid then p_revision else composition_revision end,
    composition_hash = case when is_valid then p_hash else composition_hash end
    where id = p_id returning * into result;
  return result;
end;
$$;

create function public.approve_fnb_campaign(p_id uuid,p_user_id uuid,p_expected_revision integer)
returns public.fnb_campaigns language plpgsql set search_path = public as $$
declare result public.fnb_campaigns; version public.fnb_campaign_versions;
begin
  select c.* into result from public.fnb_campaigns c join public.video_projects p on p.id = c.id
    where c.id = p_id and c.user_id = p_user_id and p.deleted_at is null for update of c;
  if not found then raise exception 'fnb_not_found'; end if;
  if result.revision <> p_expected_revision then raise exception 'fnb_revision_conflict'; end if;
  select * into version from public.fnb_campaign_versions where campaign_id = p_id and user_id = p_user_id and revision = p_expected_revision;
  if not found or not version.validated or version.composition_html is null or result.composition_revision is distinct from p_expected_revision
    or result.composition_hash is distinct from version.composition_hash or jsonb_array_length(result.validation_errors) > 0
    then raise exception 'fnb_approval_conflict'; end if;
  if version.approved_at is null then
    update public.fnb_campaign_versions set approved_at = now() where campaign_id = p_id and revision = p_expected_revision;
  end if;
  update public.fnb_campaigns set approved_revision = p_expected_revision,
    status = case when status in ('rendering','completed') then status else 'approved' end
    where id = p_id returning * into result;
  return result;
end;
$$;

create function public.intake_fnb_campaign_render(p_id uuid,p_user_id uuid,p_revision integer,p_idempotency_key text,p_job_id uuid)
returns public.fnb_render_jobs language plpgsql set search_path = public as $$
declare campaign public.fnb_campaigns; result public.fnb_render_jobs; version public.fnb_campaign_versions;
begin
  select c.* into campaign from public.fnb_campaigns c join public.video_projects p on p.id = c.id
    where c.id = p_id and c.user_id = p_user_id and p.deleted_at is null for update of c;
  if not found then raise exception 'fnb_not_found'; end if;
  select * into result from public.fnb_render_jobs where campaign_id = p_id and user_id = p_user_id and idempotency_key = p_idempotency_key;
  if found then
    if result.revision <> p_revision then raise exception 'fnb_idempotency_conflict'; end if;
    if result.status <> 'failed' then return result; end if;
  end if;
  select * into version from public.fnb_campaign_versions where campaign_id = p_id and user_id = p_user_id and revision = p_revision;
  if not found or version.approved_at is null or not version.validated then raise exception 'fnb_approval_conflict'; end if;
  if exists(select 1 from public.fnb_render_jobs where campaign_id = p_id and status in ('queued','rendering'))
    then raise exception 'fnb_render_conflict'; end if;
  if result.id is not null then
    update public.fnb_render_jobs set status = 'queued',error = null,output_object_key = null where id = result.id returning * into result;
  else
    insert into public.fnb_render_jobs(id,campaign_id,user_id,revision,idempotency_key)
      values(p_job_id,p_id,p_user_id,p_revision,p_idempotency_key) returning * into result;
  end if;
  update public.fnb_campaigns set status = 'rendering' where id = p_id and revision = p_revision and approved_revision = p_revision;
  return result;
end;
$$;

create function public.fail_fnb_queued_render(p_id uuid,p_user_id uuid,p_job_id uuid,p_error text)
returns public.fnb_render_jobs language plpgsql set search_path = public as $$
declare result public.fnb_render_jobs;
begin
  perform 1 from public.fnb_campaigns where id = p_id and user_id = p_user_id for update;
  if not found then raise exception 'fnb_not_found'; end if;
  select * into result from public.fnb_render_jobs where id = p_job_id and campaign_id = p_id and user_id = p_user_id for update;
  if not found then raise exception 'fnb_not_found'; end if;
  if result.status <> 'queued' then return result; end if;
  update public.fnb_render_jobs set status = 'failed',error = left(p_error,1000) where id = p_job_id returning * into result;
  update public.fnb_campaigns set status = 'failed' where id = p_id and revision = result.revision and approved_revision = result.revision and status = 'rendering';
  return result;
end;
$$;

revoke all on function public.protect_fnb_campaign_version() from public;
revoke all on function public.create_fnb_campaign(uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.save_fnb_campaign_draft(uuid,uuid,integer,jsonb,jsonb) from public,anon,authenticated;
revoke all on function public.complete_fnb_campaign_composition(uuid,uuid,integer,text,text,jsonb,jsonb) from public,anon,authenticated;
revoke all on function public.approve_fnb_campaign(uuid,uuid,integer) from public,anon,authenticated;
revoke all on function public.intake_fnb_campaign_render(uuid,uuid,integer,text,uuid) from public,anon,authenticated;
revoke all on function public.fail_fnb_queued_render(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.create_fnb_campaign(uuid,uuid,text) to service_role;
grant execute on function public.save_fnb_campaign_draft(uuid,uuid,integer,jsonb,jsonb) to service_role;
grant execute on function public.complete_fnb_campaign_composition(uuid,uuid,integer,text,text,jsonb,jsonb) to service_role;
grant execute on function public.approve_fnb_campaign(uuid,uuid,integer) to service_role;
grant execute on function public.intake_fnb_campaign_render(uuid,uuid,integer,text,uuid) to service_role;
grant execute on function public.fail_fnb_queued_render(uuid,uuid,uuid,text) to service_role;

commit;

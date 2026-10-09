begin;

alter table public.fnb_render_jobs
  add column attempt_token uuid not null default gen_random_uuid(),
  add column dispatch_token uuid,
  add column dispatch_expires_at timestamptz,
  add column render_expires_at timestamptz;

update public.fnb_render_jobs set render_expires_at = updated_at + interval '25 minutes'
  where status = 'rendering';
alter table public.fnb_render_jobs
  add constraint fnb_render_dispatch_lease_pair check ((dispatch_token is null) = (dispatch_expires_at is null)),
  add constraint fnb_render_dispatch_lease_state check (dispatch_token is null or status = 'queued'),
  add constraint fnb_render_expiry_state check ((status = 'rendering') = (render_expires_at is not null));

-- Remove the unguarded signatures rather than retaining an unsafe overload.
drop function public.intake_fnb_campaign_render(uuid,uuid,integer,text,uuid);
drop function public.fail_fnb_queued_render(uuid,uuid,uuid,text);

create function public.intake_fnb_campaign_render(p_id uuid,p_user_id uuid,p_revision integer,p_idempotency_key text,p_job_id uuid,p_dispatch_token uuid)
returns public.fnb_render_jobs language plpgsql set search_path = public as $$
declare campaign public.fnb_campaigns; result public.fnb_render_jobs; version public.fnb_campaign_versions;
begin
  if p_dispatch_token is null then raise exception 'fnb_dispatch_token_required'; end if;
  select c.* into campaign from public.fnb_campaigns c join public.video_projects p on p.id = c.id
    where c.id = p_id and c.user_id = p_user_id and p.deleted_at is null for update of c;
  if not found then raise exception 'fnb_not_found'; end if;
  select * into result from public.fnb_render_jobs where campaign_id = p_id and user_id = p_user_id and idempotency_key = p_idempotency_key for update;
  if found then
    if result.revision <> p_revision then raise exception 'fnb_idempotency_conflict'; end if;
    if result.status <> 'failed' then return result; end if;
  end if;
  select * into version from public.fnb_campaign_versions where campaign_id = p_id and user_id = p_user_id and revision = p_revision;
  if not found or version.approved_at is null or not version.validated then raise exception 'fnb_approval_conflict'; end if;
  if exists(select 1 from public.fnb_render_jobs where campaign_id = p_id and status in ('queued','rendering'))
    then raise exception 'fnb_render_conflict'; end if;
  if result.id is not null then
    update public.fnb_render_jobs set status = 'queued',error = null,output_object_key = null,
      attempt_token = gen_random_uuid(),dispatch_token = p_dispatch_token,
      dispatch_expires_at = clock_timestamp() + interval '5 minutes',render_expires_at = null
      where id = result.id returning * into result;
  else
    insert into public.fnb_render_jobs(id,campaign_id,user_id,revision,idempotency_key,dispatch_token,dispatch_expires_at)
      values(p_job_id,p_id,p_user_id,p_revision,p_idempotency_key,p_dispatch_token,clock_timestamp() + interval '5 minutes') returning * into result;
  end if;
  update public.fnb_campaigns set status = 'rendering' where id = p_id and revision = p_revision and approved_revision = p_revision;
  return result;
end;
$$;

create function public.fail_fnb_queued_render(p_id uuid,p_user_id uuid,p_job_id uuid,p_dispatch_token uuid,p_error text)
returns public.fnb_render_jobs language plpgsql set search_path = public as $$
declare result public.fnb_render_jobs;
begin
  perform 1 from public.fnb_campaigns where id = p_id and user_id = p_user_id for update;
  if not found then raise exception 'fnb_not_found'; end if;
  select * into result from public.fnb_render_jobs where id = p_job_id and campaign_id = p_id and user_id = p_user_id for update;
  if not found then raise exception 'fnb_not_found'; end if;
  if result.status <> 'queued' or result.dispatch_token is distinct from p_dispatch_token
    or result.dispatch_token is null or result.dispatch_expires_at <= clock_timestamp() then return result; end if;
  update public.fnb_render_jobs set status = 'failed',error = left(p_error,1000),dispatch_token = null,dispatch_expires_at = null
    where id = p_job_id returning * into result;
  update public.fnb_campaigns set status = 'failed' where id = p_id and user_id = p_user_id
    and revision = result.revision and approved_revision = result.revision and status = 'rendering';
  return result;
end;
$$;

create function public.release_fnb_render_dispatch(p_id uuid,p_user_id uuid,p_job_id uuid,p_dispatch_token uuid)
returns boolean language plpgsql set search_path = public as $$
begin
  perform 1 from public.fnb_campaigns where id = p_id and user_id = p_user_id for update;
  if not found then raise exception 'fnb_not_found'; end if;
  update public.fnb_render_jobs set dispatch_token = null,dispatch_expires_at = null
    where id = p_job_id and campaign_id = p_id and user_id = p_user_id
      and status = 'queued' and dispatch_token = p_dispatch_token;
  return found;
end;
$$;

create function public.claim_fnb_campaign_render(p_job_id uuid,p_attempt_token uuid)
returns public.fnb_render_jobs language plpgsql set search_path = public as $$
declare result public.fnb_render_jobs;
begin
  perform 1 from public.fnb_campaigns c join public.fnb_render_jobs j on j.campaign_id = c.id and j.user_id = c.user_id
    where j.id = p_job_id for update of c;
  if not found then return null; end if;
  update public.fnb_render_jobs set status = 'rendering',error = null,dispatch_token = null,dispatch_expires_at = null,
    render_expires_at = clock_timestamp() + interval '25 minutes'
    where id = p_job_id and status = 'queued' and attempt_token = p_attempt_token returning * into result;
  if not found then return null; end if;
  return result;
end;
$$;

create function public.finish_fnb_campaign_render(p_job_id uuid,p_attempt_token uuid,p_output_object_key text,p_error text)
returns boolean language plpgsql set search_path = public as $$
declare result public.fnb_render_jobs; final_status text;
begin
  if (p_output_object_key is null) = (p_error is null) then raise exception 'fnb_render_outcome_required'; end if;
  perform 1 from public.fnb_campaigns c join public.fnb_render_jobs j on j.campaign_id = c.id and j.user_id = c.user_id
    where j.id = p_job_id for update of c;
  if not found then return false; end if;
  final_status := case when p_output_object_key is null then 'failed' else 'completed' end;
  update public.fnb_render_jobs set status = final_status,output_object_key = p_output_object_key,error = left(p_error,1500),render_expires_at = null
    where id = p_job_id and status = 'rendering' and attempt_token = p_attempt_token
      and render_expires_at > clock_timestamp() returning * into result;
  if not found then return false; end if;
  update public.fnb_campaigns set status = final_status where id = result.campaign_id and user_id = result.user_id
    and revision = result.revision and approved_revision = result.revision and status = 'rendering';
  return true;
end;
$$;

create function public.recover_fnb_campaign_renders(p_limit integer default 10)
returns setof public.fnb_render_jobs language plpgsql set search_path = public as $$
declare candidate_campaign_id uuid; result public.fnb_render_jobs;
begin
  if p_limit < 1 or p_limit > 100 then raise exception 'fnb_recovery_limit_invalid'; end if;
  -- Every transition locks campaign before job, including recovery and worker completion.
  for candidate_campaign_id in select c.id from public.fnb_campaigns c
    join public.fnb_render_jobs j on j.campaign_id = c.id and j.user_id = c.user_id
    where (j.status = 'rendering' and j.render_expires_at <= clock_timestamp()) or
      (j.status = 'queued' and (j.dispatch_token is null or j.dispatch_expires_at <= clock_timestamp()))
    order by j.created_at,c.id limit p_limit for update of c skip locked
  loop
    select * into result from public.fnb_render_jobs j where j.campaign_id = candidate_campaign_id and j.status in ('queued','rendering') for update;
    if result.status = 'rendering' and result.render_expires_at <= clock_timestamp() then
      update public.fnb_render_jobs set status = 'failed',error = 'Worker terhenti. Draft dan approved version tetap tersimpan; coba render kembali.',render_expires_at = null
        where id = result.id;
      update public.fnb_campaigns set status = 'failed' where id = result.campaign_id and user_id = result.user_id
        and revision = result.revision and approved_revision = result.revision and status = 'rendering';
    elsif result.status = 'queued' and (result.dispatch_token is null or result.dispatch_expires_at <= clock_timestamp()) then
      update public.fnb_render_jobs set dispatch_token = gen_random_uuid(),dispatch_expires_at = clock_timestamp() + interval '5 minutes'
        where id = result.id returning * into result;
      return next result;
    end if;
  end loop;
end;
$$;

revoke all on function public.intake_fnb_campaign_render(uuid,uuid,integer,text,uuid,uuid) from public,anon,authenticated;
revoke all on function public.fail_fnb_queued_render(uuid,uuid,uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.release_fnb_render_dispatch(uuid,uuid,uuid,uuid) from public,anon,authenticated;
revoke all on function public.claim_fnb_campaign_render(uuid,uuid) from public,anon,authenticated;
revoke all on function public.finish_fnb_campaign_render(uuid,uuid,text,text) from public,anon,authenticated;
revoke all on function public.recover_fnb_campaign_renders(integer) from public,anon,authenticated;
grant execute on function public.intake_fnb_campaign_render(uuid,uuid,integer,text,uuid,uuid) to service_role;
grant execute on function public.fail_fnb_queued_render(uuid,uuid,uuid,uuid,text) to service_role;
grant execute on function public.release_fnb_render_dispatch(uuid,uuid,uuid,uuid) to service_role;
grant execute on function public.claim_fnb_campaign_render(uuid,uuid) to service_role;
grant execute on function public.finish_fnb_campaign_render(uuid,uuid,text,text) to service_role;
grant execute on function public.recover_fnb_campaign_renders(integer) to service_role;

commit;

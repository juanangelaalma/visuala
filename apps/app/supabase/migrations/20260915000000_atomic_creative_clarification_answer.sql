begin;

create function public.persist_owned_creative_clarification_answer(
  p_project_id uuid,
  p_user_id uuid,
  p_expected_revision integer,
  p_message jsonb
) returns jsonb
language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_project public.creative_projects;
  v_existing public.creative_messages;
begin
  perform public.assert_creative_owner(p_user_id);
  if p_message ->> 'project_id' <> p_project_id::text
    or p_message ->> 'role' <> 'user'
    or p_message ->> 'kind' <> 'answer'
    or (p_message ->> 'project_revision')::integer <> p_expected_revision + 1 then
    raise exception 'creative_clarification_message_invalid';
  end if;

  select * into v_project from public.creative_projects
  where id = p_project_id and user_id = p_user_id for update;
  if v_project.id is null then return jsonb_build_object('status', 'stale'); end if;

  select * into v_existing from public.creative_messages
  where project_id = p_project_id and idempotency_key = p_message ->> 'idempotency_key';
  if v_existing.id is not null then
    if v_existing.kind <> 'answer' or v_existing.text <> p_message ->> 'text' then
      raise exception 'creative_clarification_idempotency_mismatch';
    end if;
    return jsonb_build_object('status', 'duplicate', 'project', to_jsonb(v_project));
  end if;

  if v_project.revision <> p_expected_revision or v_project.state <> 'needs_input' then
    return jsonb_build_object('status', 'stale');
  end if;

  update public.creative_projects
  set state = 'analyzing', revision = revision + 1, failed_stage = null, error_code = null, updated_at = now()
  where id = p_project_id returning * into v_project;

  insert into public.creative_messages (id, project_id, project_owner_id, role, kind, text, asset_id, project_revision, idempotency_key, created_at)
  values ((p_message ->> 'id')::uuid, p_project_id, p_user_id, 'user', 'answer', p_message ->> 'text', null, (p_message ->> 'project_revision')::integer, p_message ->> 'idempotency_key', (p_message ->> 'created_at')::timestamptz);

  return jsonb_build_object('status', 'created', 'project', to_jsonb(v_project));
end
$$;

revoke all on function public.persist_owned_creative_clarification_answer(uuid, uuid, integer, jsonb) from public, anon;
grant execute on function public.persist_owned_creative_clarification_answer(uuid, uuid, integer, jsonb) to authenticated, service_role;

commit;

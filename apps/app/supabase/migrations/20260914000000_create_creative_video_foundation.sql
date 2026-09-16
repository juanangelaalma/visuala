begin;

alter table public.ai_assets add constraint ai_assets_id_user_id_key unique (id, user_id);

create table public.creative_projects (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  create_idempotency_key text not null,
  category_plugin_id text not null,
  category_plugin_version text not null,
  state text not null check (state in ('draft', 'analyzing', 'needs_input', 'concepts_ready', 'building_preview', 'preview_ready', 'rendering', 'completed', 'failed')),
  revision integer not null default 0 check (revision >= 0),
  asset_id uuid not null,
  active_concept_id uuid,
  active_composition_version_id uuid,
  failed_stage text check (failed_stage in ('analysis', 'planning', 'compilation', 'rendering')),
  error_code text,
  preview_generation_count integer not null default 0 check (preview_generation_count >= 0),
  preview_quota integer not null default 3 check (preview_quota >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  unique (user_id, create_idempotency_key),
  foreign key (asset_id, user_id) references public.ai_assets(id, user_id) on delete restrict
);

create table public.creative_messages (
  id uuid primary key,
  project_id uuid not null references public.creative_projects(id) on delete cascade,
  project_owner_id uuid not null,
  role text not null check (role in ('user', 'assistant', 'system')),
  kind text not null check (kind in ('brief', 'clarification', 'answer', 'status')),
  text text not null,
  asset_id uuid,
  project_revision integer not null check (project_revision >= 0),
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  unique (project_id, idempotency_key),
  foreign key (project_id, project_owner_id) references public.creative_projects(id, user_id) on delete cascade,
  foreign key (asset_id, project_owner_id) references public.ai_assets(id, user_id) on delete restrict
);

create table public.creative_brief_snapshots (
  id uuid primary key,
  project_id uuid not null references public.creative_projects(id) on delete cascade,
  goal text not null,
  product text not null,
  facts jsonb not null check (jsonb_typeof(facts) = 'array'),
  assumptions jsonb not null check (jsonb_typeof(assumptions) = 'array'),
  missing_required_questions jsonb not null check (jsonb_typeof(missing_required_questions) = 'array'),
  optional_questions jsonb not null check (jsonb_typeof(optional_questions) = 'array'),
  asset_ids jsonb not null check (jsonb_typeof(asset_ids) = 'array'),
  plugin_schema_version text not null,
  source_project_revision integer not null check (source_project_revision >= 0),
  created_at timestamptz not null default now(),
  unique (id, project_id)
);

create table public.creative_concept_sets (
  id uuid primary key,
  project_id uuid not null references public.creative_projects(id) on delete cascade,
  brief_snapshot_id uuid not null,
  request_id text not null,
  prompt_version text not null,
  model text not null,
  created_at timestamptz not null default now(),
  unique (id, project_id),
  unique (project_id, request_id),
  foreign key (brief_snapshot_id, project_id) references public.creative_brief_snapshots(id, project_id) on delete restrict
);

create table public.creative_concepts (
  id uuid primary key,
  project_id uuid not null references public.creative_projects(id) on delete cascade,
  concept_set_id uuid not null,
  brief_snapshot_id uuid not null,
  title text not null,
  hook text not null,
  angle text not null,
  scene_outline jsonb not null check (jsonb_typeof(scene_outline) = 'array' and jsonb_array_length(scene_outline) = 4),
  fit_reason text not null,
  recommendation_reason text not null,
  recommended boolean not null default false,
  sort_order integer not null check (sort_order > 0),
  generation_request_id text not null,
  generation_prompt_version text not null,
  generation_model text not null,
  created_at timestamptz not null default now(),
  unique (id, project_id),
  unique (concept_set_id, sort_order),
  foreign key (concept_set_id, project_id) references public.creative_concept_sets(id, project_id) on delete cascade,
  foreign key (brief_snapshot_id, project_id) references public.creative_brief_snapshots(id, project_id) on delete restrict
);

alter table public.creative_projects add constraint creative_projects_active_concept_fkey foreign key (active_concept_id, id) references public.creative_concepts(id, project_id) on delete restrict;

create index creative_projects_owner_updated_idx on public.creative_projects(user_id, updated_at desc);
create index creative_messages_project_created_idx on public.creative_messages(project_id, created_at);
create index creative_brief_snapshots_project_created_idx on public.creative_brief_snapshots(project_id, created_at desc);
create index creative_concept_sets_project_created_idx on public.creative_concept_sets(project_id, created_at desc);
create index creative_concepts_project_order_idx on public.creative_concepts(project_id, sort_order);

create function public.reject_creative_snapshot_mutation() returns trigger language plpgsql set search_path = pg_catalog as $$
begin
  raise exception 'creative_snapshot_is_immutable';
end
$$;

create trigger creative_messages_immutable before update or delete on public.creative_messages for each row execute function public.reject_creative_snapshot_mutation();
create trigger creative_brief_snapshots_immutable before update on public.creative_brief_snapshots for each row execute function public.reject_creative_snapshot_mutation();
create trigger creative_concept_sets_immutable before update or delete on public.creative_concept_sets for each row execute function public.reject_creative_snapshot_mutation();
create trigger creative_concepts_immutable before update or delete on public.creative_concepts for each row execute function public.reject_creative_snapshot_mutation();

create function public.assert_creative_owner(p_user_id uuid) returns void language plpgsql security invoker set search_path = pg_catalog as $$
begin
  if not (auth.role() = 'service_role' or auth.uid() = p_user_id) then
    raise exception 'creative_project_owner_mismatch';
  end if;
end
$$;

create function public.create_owned_creative_project(p_project jsonb, p_initial_message jsonb)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare v_project public.creative_projects; v_created boolean := false;
begin
  perform public.assert_creative_owner((p_project ->> 'user_id')::uuid);
  if p_initial_message ->> 'project_id' <> p_project ->> 'id' then raise exception 'creative_project_message_mismatch'; end if;
  insert into public.creative_projects (id, user_id, create_idempotency_key, category_plugin_id, category_plugin_version, state, revision, asset_id, active_concept_id, active_composition_version_id, failed_stage, error_code, preview_generation_count, preview_quota, created_at, updated_at)
  values ((p_project ->> 'id')::uuid, (p_project ->> 'user_id')::uuid, p_project ->> 'create_idempotency_key', p_project ->> 'category_plugin_id', p_project ->> 'category_plugin_version', p_project ->> 'state', (p_project ->> 'revision')::integer, (p_project ->> 'asset_id')::uuid, (p_project ->> 'active_concept_id')::uuid, (p_project ->> 'active_composition_version_id')::uuid, p_project ->> 'failed_stage', p_project ->> 'error_code', (p_project ->> 'preview_generation_count')::integer, (p_project ->> 'preview_quota')::integer, (p_project ->> 'created_at')::timestamptz, (p_project ->> 'updated_at')::timestamptz)
  on conflict (user_id, create_idempotency_key) do nothing returning * into v_project;
  if v_project.id is null then
    select * into strict v_project from public.creative_projects where user_id = (p_project ->> 'user_id')::uuid and create_idempotency_key = p_project ->> 'create_idempotency_key';
    return jsonb_build_object('project', to_jsonb(v_project), 'created', false);
  end if;
  v_created := true;
  insert into public.creative_messages (id, project_id, project_owner_id, role, kind, text, asset_id, project_revision, idempotency_key, created_at)
  values ((p_initial_message ->> 'id')::uuid, v_project.id, v_project.user_id, p_initial_message ->> 'role', p_initial_message ->> 'kind', p_initial_message ->> 'text', (p_initial_message ->> 'asset_id')::uuid, (p_initial_message ->> 'project_revision')::integer, p_initial_message ->> 'idempotency_key', (p_initial_message ->> 'created_at')::timestamptz);
  return jsonb_build_object('project', to_jsonb(v_project), 'created', true);
end
$$;

create function public.append_owned_creative_message(p_message jsonb) returns void language plpgsql security definer set search_path = pg_catalog as $$
declare v_owner_id uuid;
begin
  select user_id into strict v_owner_id from public.creative_projects where id = (p_message ->> 'project_id')::uuid;
  perform public.assert_creative_owner(v_owner_id);
  insert into public.creative_messages (id, project_id, project_owner_id, role, kind, text, asset_id, project_revision, idempotency_key, created_at)
  values ((p_message ->> 'id')::uuid, (p_message ->> 'project_id')::uuid, v_owner_id, p_message ->> 'role', p_message ->> 'kind', p_message ->> 'text', (p_message ->> 'asset_id')::uuid, (p_message ->> 'project_revision')::integer, p_message ->> 'idempotency_key', (p_message ->> 'created_at')::timestamptz);
end
$$;

create function public.apply_owned_creative_brief_analysis(p_project_id uuid, p_snapshot jsonb, p_user_id uuid, p_expected_revision integer, p_next_state text)
returns public.creative_projects language plpgsql security definer set search_path = pg_catalog as $$
declare v_project public.creative_projects;
begin
  perform public.assert_creative_owner(p_user_id);
  if p_snapshot ->> 'project_id' <> p_project_id::text then raise exception 'creative_brief_project_mismatch'; end if;
  if (p_snapshot ->> 'source_project_revision')::integer <> p_expected_revision then raise exception 'creative_brief_revision_mismatch'; end if;
  if p_next_state not in ('analyzing', 'needs_input') then raise exception 'invalid_brief_analysis_state'; end if;
  update public.creative_projects set state = p_next_state, revision = revision + 1, updated_at = now()
  where id = p_project_id and user_id = p_user_id and revision = p_expected_revision
  returning * into v_project;
  if v_project.id is null then return null; end if;
  insert into public.creative_brief_snapshots (id, project_id, goal, product, facts, assumptions, missing_required_questions, optional_questions, asset_ids, plugin_schema_version, source_project_revision, created_at)
  values ((p_snapshot ->> 'id')::uuid, (p_snapshot ->> 'project_id')::uuid, p_snapshot ->> 'goal', p_snapshot ->> 'product', p_snapshot -> 'facts', p_snapshot -> 'assumptions', p_snapshot -> 'missing_required_questions', p_snapshot -> 'optional_questions', p_snapshot -> 'asset_ids', p_snapshot ->> 'plugin_schema_version', (p_snapshot ->> 'source_project_revision')::integer, (p_snapshot ->> 'created_at')::timestamptz);
  return v_project;
end
$$;

create function public.apply_owned_creative_concept_generation(
  p_project_id uuid,
  p_user_id uuid,
  p_expected_revision integer,
  p_source_brief_revision integer,
  p_concept_set jsonb,
  p_concepts jsonb
) returns public.creative_projects language plpgsql security definer set search_path = pg_catalog as $$
declare v_project public.creative_projects; v_concept jsonb;
begin
  perform public.assert_creative_owner(p_user_id);
  if jsonb_typeof(p_concepts) <> 'array' or jsonb_array_length(p_concepts) <> 3 then raise exception 'creative_concept_count_invalid'; end if;
  if (select count(*) from jsonb_array_elements(p_concepts) c where (c ->> 'recommended')::boolean) <> 1 then raise exception 'creative_concept_recommendation_invalid'; end if;
  if (select count(distinct (c ->> 'sort_order')::integer) from jsonb_array_elements(p_concepts) c) <> 3
    or exists (select 1 from jsonb_array_elements(p_concepts) c where (c ->> 'sort_order')::integer not between 1 and 3) then raise exception 'creative_concept_order_invalid'; end if;
  if (select count(distinct c ->> 'id') from jsonb_array_elements(p_concepts) c) <> 3 then raise exception 'creative_concept_id_invalid'; end if;
  if exists (select 1 from jsonb_array_elements(p_concepts) c where jsonb_typeof(c -> 'scene_outline') <> 'array' or jsonb_array_length(c -> 'scene_outline') <> 4) then raise exception 'creative_concept_scene_outline_invalid'; end if;
  if p_concept_set ->> 'project_id' <> p_project_id::text
    or exists (select 1 from jsonb_array_elements(p_concepts) c where c ->> 'project_id' <> p_project_id::text or c ->> 'concept_set_id' <> p_concept_set ->> 'id' or c ->> 'brief_snapshot_id' <> p_concept_set ->> 'brief_snapshot_id')
    or (p_concept_set ->> 'brief_snapshot_id')::uuid not in (
      select id from public.creative_brief_snapshots where project_id = p_project_id and source_project_revision = p_source_brief_revision
    ) then raise exception 'creative_concept_source_mismatch'; end if;
  update public.creative_projects set state = 'concepts_ready', revision = revision + 1, updated_at = now()
  where id = p_project_id and user_id = p_user_id and revision = p_expected_revision and state = 'analyzing'
  returning * into v_project;
  if v_project.id is null then return null; end if;
  insert into public.creative_concept_sets (id, project_id, brief_snapshot_id, request_id, prompt_version, model, created_at)
  values ((p_concept_set ->> 'id')::uuid, p_project_id, (p_concept_set ->> 'brief_snapshot_id')::uuid, p_concept_set ->> 'request_id', p_concept_set ->> 'prompt_version', p_concept_set ->> 'model', (p_concept_set ->> 'created_at')::timestamptz);
  for v_concept in select * from jsonb_array_elements(p_concepts) loop
    insert into public.creative_concepts (id, project_id, concept_set_id, brief_snapshot_id, title, hook, angle, scene_outline, fit_reason, recommendation_reason, recommended, sort_order, generation_request_id, generation_prompt_version, generation_model, created_at)
    values ((v_concept ->> 'id')::uuid, p_project_id, (p_concept_set ->> 'id')::uuid, (v_concept ->> 'brief_snapshot_id')::uuid, v_concept ->> 'title', v_concept ->> 'hook', v_concept ->> 'angle', v_concept -> 'scene_outline', v_concept ->> 'fit_reason', v_concept ->> 'recommendation_reason', (v_concept ->> 'recommended')::boolean, (v_concept ->> 'sort_order')::integer, v_concept ->> 'generation_request_id', v_concept ->> 'generation_prompt_version', v_concept ->> 'generation_model', (v_concept ->> 'created_at')::timestamptz);
  end loop;
  return v_project;
end
$$;

create function public.transition_owned_creative_project(
  p_project_id uuid,
  p_user_id uuid,
  p_expected_revision integer,
  p_next_state text,
  p_patch jsonb default '{}'::jsonb
) returns public.creative_projects
language plpgsql security invoker set search_path = pg_catalog as $$
declare
  v_project public.creative_projects;
begin
  perform public.assert_creative_owner(p_user_id);
  if jsonb_typeof(p_patch) <> 'object'
    or p_patch - array['active_concept_id', 'active_composition_version_id', 'failed_stage', 'error_code', 'preview_generation_count'] <> '{}'::jsonb then
    raise exception 'invalid_creative_project_patch';
  end if;
  select * into v_project from public.creative_projects where id = p_project_id and user_id = p_user_id and revision = p_expected_revision for update;
  if v_project.id is null then return null; end if;
  if not (
    (v_project.state = 'draft' and p_next_state = 'analyzing') or
    (v_project.state = 'analyzing' and p_next_state in ('needs_input', 'concepts_ready', 'failed')) or
    (v_project.state = 'needs_input' and p_next_state = 'analyzing') or
    (v_project.state = 'concepts_ready' and p_next_state = 'building_preview') or
    (v_project.state = 'building_preview' and p_next_state in ('preview_ready', 'failed')) or
    (v_project.state = 'preview_ready' and p_next_state = 'rendering') or
    (v_project.state = 'rendering' and p_next_state in ('completed', 'failed')) or
    (v_project.state = 'failed' and ((v_project.failed_stage = 'analysis' and p_next_state = 'analyzing') or (v_project.failed_stage in ('planning', 'compilation') and p_next_state = 'building_preview') or (v_project.failed_stage = 'rendering' and p_next_state = 'rendering')))
  ) then raise exception 'invalid_creative_project_transition'; end if;

  update public.creative_projects
  set state = p_next_state,
      revision = revision + 1,
      active_concept_id = case when p_patch ? 'active_concept_id' then (p_patch ->> 'active_concept_id')::uuid else active_concept_id end,
      active_composition_version_id = case when p_patch ? 'active_composition_version_id' then (p_patch ->> 'active_composition_version_id')::uuid else active_composition_version_id end,
      failed_stage = case when p_patch ? 'failed_stage' then p_patch ->> 'failed_stage' else failed_stage end,
      error_code = case when p_patch ? 'error_code' then p_patch ->> 'error_code' else error_code end,
      preview_generation_count = case when p_patch ? 'preview_generation_count' then (p_patch ->> 'preview_generation_count')::integer else preview_generation_count end,
      updated_at = now()
  where id = p_project_id and user_id = p_user_id and revision = p_expected_revision
  returning * into v_project;
  return v_project;
end
$$;

alter table public.creative_projects enable row level security;
alter table public.creative_messages enable row level security;
alter table public.creative_brief_snapshots enable row level security;
alter table public.creative_concept_sets enable row level security;
alter table public.creative_concepts enable row level security;

create policy "Owners manage creative projects" on public.creative_projects for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Owners read creative messages" on public.creative_messages for select to authenticated using (exists (select 1 from public.creative_projects p where p.id = project_id and p.user_id = auth.uid()));
create policy "Owners create creative messages" on public.creative_messages for insert to authenticated with check (exists (select 1 from public.creative_projects p where p.id = project_id and p.user_id = auth.uid()));
create policy "Owners manage creative briefs" on public.creative_brief_snapshots for all to authenticated using (exists (select 1 from public.creative_projects p where p.id = project_id and p.user_id = auth.uid())) with check (exists (select 1 from public.creative_projects p where p.id = project_id and p.user_id = auth.uid()));
create policy "Owners read creative concept sets" on public.creative_concept_sets for select to authenticated using (exists (select 1 from public.creative_projects p where p.id = project_id and p.user_id = auth.uid()));
create policy "Owners create creative concept sets" on public.creative_concept_sets for insert to authenticated with check (exists (select 1 from public.creative_projects p where p.id = project_id and p.user_id = auth.uid()));
create policy "Owners read creative concepts" on public.creative_concepts for select to authenticated using (exists (select 1 from public.creative_projects p where p.id = project_id and p.user_id = auth.uid()));
create policy "Owners create creative concepts" on public.creative_concepts for insert to authenticated with check (exists (select 1 from public.creative_projects p where p.id = project_id and p.user_id = auth.uid()));

grant select on public.creative_projects, public.creative_messages, public.creative_brief_snapshots, public.creative_concept_sets, public.creative_concepts to authenticated;
revoke insert, update, delete on public.creative_messages, public.creative_brief_snapshots, public.creative_concept_sets, public.creative_concepts from authenticated;
grant insert on public.creative_projects to authenticated;
revoke all on function public.transition_owned_creative_project(uuid, uuid, integer, text, jsonb) from public, anon;
grant execute on function public.transition_owned_creative_project(uuid, uuid, integer, text, jsonb) to authenticated, service_role;
  revoke all on function public.assert_creative_owner(uuid), public.create_owned_creative_project(jsonb, jsonb), public.append_owned_creative_message(jsonb), public.apply_owned_creative_brief_analysis(uuid, jsonb, uuid, integer, text), public.apply_owned_creative_concept_generation(uuid, uuid, integer, integer, jsonb, jsonb) from public, anon;
  grant execute on function public.create_owned_creative_project(jsonb, jsonb), public.append_owned_creative_message(jsonb), public.apply_owned_creative_brief_analysis(uuid, jsonb, uuid, integer, text), public.apply_owned_creative_concept_generation(uuid, uuid, integer, integer, jsonb, jsonb) to authenticated, service_role;
grant select, insert, update, delete on public.creative_projects, public.creative_messages, public.creative_brief_snapshots, public.creative_concept_sets, public.creative_concepts to service_role;

commit;

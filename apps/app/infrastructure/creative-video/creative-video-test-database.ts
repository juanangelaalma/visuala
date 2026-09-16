const databaseSuffix = "_creative_video_test";

type Environment = Record<string, string | undefined>;

export function getCreativeVideoTestDatabaseConfiguration(environment: Environment) {
  const databaseUrl = environment.CREATIVE_VIDEO_TEST_DATABASE_URL;
  if (!databaseUrl) return null;
  if (environment.CREATIVE_VIDEO_TEST_DATABASE_ALLOW_DESTRUCTIVE !== "true") {
    throw new Error("Set CREATIVE_VIDEO_TEST_DATABASE_ALLOW_DESTRUCTIVE=true to use the destructive integration harness.");
  }
  const databaseName = new URL(databaseUrl).pathname.slice(1);
  if (!databaseName.endsWith(databaseSuffix)) {
    throw new Error(`The disposable database name must end with ${databaseSuffix}.`);
  }
  return { databaseUrl, databaseName };
}

export const supabaseTestBootstrapSql = `
do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
do $$ begin create role service_role nologin bypassrls; exception when duplicate_object then null; end $$;
drop schema if exists auth cascade;
drop table if exists public.ai_assets cascade;
create schema auth;
create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
create function auth.role() returns text language sql stable as $$
  select nullif(current_setting('request.jwt.claim.role', true), '')
$$;
create table public.ai_assets (
  id uuid primary key,
  user_id uuid not null references auth.users(id)
);
grant usage on schema auth, public to anon, authenticated, service_role;
grant select on auth.users to authenticated, service_role;
grant select, insert, update, delete on public.ai_assets to authenticated, service_role;
`;

export const supabaseTestCleanupSql = `
drop table if exists public.creative_concepts cascade;
drop table if exists public.creative_concept_sets cascade;
drop table if exists public.creative_brief_snapshots cascade;
drop table if exists public.creative_messages cascade;
drop table if exists public.creative_projects cascade;
drop table if exists public.ai_assets cascade;
drop schema if exists auth cascade;
drop function if exists public.apply_owned_creative_concept_generation(uuid, uuid, integer, integer, jsonb, jsonb);
drop function if exists public.apply_owned_creative_brief_analysis(uuid, jsonb, uuid, integer, text);
drop function if exists public.append_owned_creative_message(jsonb);
drop function if exists public.persist_owned_creative_clarification_answer(uuid, uuid, integer, jsonb);
drop function if exists public.create_owned_creative_project(jsonb, jsonb);
drop function if exists public.transition_owned_creative_project(uuid, uuid, integer, text, jsonb);
drop function if exists public.assert_creative_owner(uuid);
drop function if exists public.reject_creative_snapshot_mutation();
`;

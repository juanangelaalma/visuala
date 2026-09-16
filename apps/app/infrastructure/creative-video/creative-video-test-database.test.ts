import { describe, expect, it } from "vitest";
import {
  getCreativeVideoTestDatabaseConfiguration,
  supabaseTestBootstrapSql,
  supabaseTestCleanupSql,
} from "./creative-video-test-database";

describe("creative video test database bootstrap", () => {
  it("requires the explicit destructive opt-in marker", () => {
    expect(() => getCreativeVideoTestDatabaseConfiguration({
      CREATIVE_VIDEO_TEST_DATABASE_URL: "postgresql://localhost/visuala_creative_video_test",
    })).toThrow("CREATIVE_VIDEO_TEST_DATABASE_ALLOW_DESTRUCTIVE=true");
  });

  it("requires the database name to end with the disposable-test suffix", () => {
    expect(() => getCreativeVideoTestDatabaseConfiguration({
      CREATIVE_VIDEO_TEST_DATABASE_URL: "postgresql://localhost/visuala_production",
      CREATIVE_VIDEO_TEST_DATABASE_ALLOW_DESTRUCTIVE: "true",
    })).toThrow("_creative_video_test");
  });

  it("accepts an opted-in disposable test database", () => {
    expect(getCreativeVideoTestDatabaseConfiguration({
      CREATIVE_VIDEO_TEST_DATABASE_URL: "postgresql://localhost/visuala_creative_video_test",
      CREATIVE_VIDEO_TEST_DATABASE_ALLOW_DESTRUCTIVE: "true",
    })).toEqual({
      databaseUrl: "postgresql://localhost/visuala_creative_video_test",
      databaseName: "visuala_creative_video_test",
    });
  });

  it("bootstraps Supabase-compatible roles, auth helpers, prerequisites, and grants", () => {
    expect(supabaseTestBootstrapSql).toContain("create role anon nologin");
    expect(supabaseTestBootstrapSql).toContain("create role authenticated nologin");
    expect(supabaseTestBootstrapSql).toContain("create role service_role nologin bypassrls");
    expect(supabaseTestBootstrapSql).toContain("create function auth.uid()");
    expect(supabaseTestBootstrapSql).toContain("create function auth.role()");
    expect(supabaseTestBootstrapSql).toContain("create table public.ai_assets");
    expect(supabaseTestBootstrapSql).toContain("grant usage on schema auth, public");
  });

  it("removes migration functions so the same disposable database can be reused", () => {
    expect(supabaseTestCleanupSql).toContain("drop function if exists public.reject_creative_snapshot_mutation()");
    expect(supabaseTestCleanupSql).toContain("drop function if exists public.assert_creative_owner(uuid)");
    expect(supabaseTestCleanupSql).toContain("drop function if exists public.apply_owned_creative_concept_generation(uuid, uuid, integer, integer, jsonb, jsonb)");
    expect(supabaseTestCleanupSql).toContain("drop function if exists public.apply_owned_creative_brief_analysis(uuid, jsonb, uuid, integer, text)");
  });
});

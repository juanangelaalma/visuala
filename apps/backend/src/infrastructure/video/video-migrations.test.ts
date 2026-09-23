import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = (name: string) => readFileSync(resolve(process.cwd(), `supabase/migrations/${name}`), "utf8");
const projects = sql("20260921000100_create_video_projects.sql");
const revisions = sql("20260921000200_create_video_revisions.sql");
const jobs = sql("20260921000300_create_video_render_jobs.sql");
const bucket = sql("20260922000000_allow_video_version_objects.sql");
const projectIdempotency = sql("20260922000100_add_video_project_idempotency.sql");

describe("video schema", () => {
  it("creates every table named in the PRD data model", () => {
    const all = `${projects}${revisions}${jobs}`;
    for (const table of ["video_projects", "video_project_assets", "video_messages", "video_brief_revisions", "video_storyboard_revisions", "video_render_jobs", "video_versions", "video_moderation_events"]) {
      expect(all).toContain(`create table public.${table} `);
    }
  });

  it("denies browser roles and grants service_role on every table", () => {
    for (const [name, migration] of [["projects", projects], ["revisions", revisions], ["jobs", jobs]] as const) {
      const created = [...migration.matchAll(/create table public\.([a-z_]+) /g)].map((match) => match[1]);
      expect(created.length, `${name} migration creates at least one table`).toBeGreaterThan(0);
      for (const table of created) {
        expect(migration, `${table} enables row level security`).toMatch(new RegExp(`alter table public\\.${table} enable row level security`));
        expect(migration, `${table} is revoked from browser roles`).toMatch(new RegExp(`revoke all on table public\\.${table} from anon, authenticated;`));
        expect(migration, `${table} is granted to service_role`).toMatch(new RegExp(`grant (select, insert, update, delete|select, insert, delete|select, insert|insert) on table public\\.${table} to service_role`));
      }
    }
  });

  it("makes approved revisions immutable with column scoped grants", () => {
    expect(revisions).toMatch(/grant update \(is_complete\) on public\.video_brief_revisions to service_role/i);
    expect(revisions).toMatch(/grant update \(approved_at, approval_snapshot\) on public\.video_storyboard_revisions to service_role/i);
    expect(revisions).not.toMatch(/grant select, insert, update, delete on table public\.video_(brief|storyboard)_revisions/i);
  });

  it("permits at most one active render job per project", () => {
    expect(jobs).toMatch(/create unique index video_render_jobs_active_project_idx on public\.video_render_jobs \(project_id\) where status in \('queued', 'preparing', 'rendering', 'uploading'\)/i);
    expect(jobs).toMatch(/unique \(project_id, idempotency_key\)/i);
  });

  it("scopes project creation idempotency to each user", () => {
    expect(projectIdempotency).toMatch(/add column idempotency_key uuid/i);
    expect(projectIdempotency).toMatch(/create unique index video_projects_user_id_idempotency_key_key\s+on public\.video_projects \(user_id, idempotency_key\)\s+where idempotency_key is not null/i);
  });

  it("keeps the revision duration equal to a supported project duration", () => {
    expect(projects).toMatch(/duration_seconds in \(6, 10, 15\)/i);
    expect(revisions).toMatch(/total_duration_seconds integer not null check \(total_duration_seconds in \(6, 10, 15\)\)/i);
  });

  it("caps the rerender counter at three", () => {
    expect(projects).toMatch(/revision_render_count integer not null default 0 check \(revision_render_count >= 0 and revision_render_count <= 3\)/i);
  });

  it("lets the shared bucket hold a rendered MP4", () => {
    expect(bucket).toMatch(/allowed_mime_types\s*=/i);
    expect(bucket).toMatch(/'video\/mp4'/);
    expect(bucket).toMatch(/file_size_limit\s*=\s*524288000/i);
    expect(bucket).toMatch(/where\s+id\s*=\s*'assets'/i);
  });
});

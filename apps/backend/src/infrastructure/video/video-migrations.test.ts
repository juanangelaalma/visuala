import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = (name: string) => readFileSync(resolve(process.cwd(), `supabase/migrations/${name}`), "utf8");
const projects = sql("20260921000100_create_video_projects.sql");
const revisions = sql("20260921000200_create_video_revisions.sql");
const jobs = sql("20260921000300_create_video_render_jobs.sql");
const bucket = sql("20260922000000_allow_video_version_objects.sql");
const projectIdempotency = sql("20260922000100_add_video_project_idempotency.sql");
const engine = sql("20260929000000_create_composition_engine.sql");

describe("video schema", () => {
  it("creates every table named in the PRD data model", () => {
    // Migration files are immutable history: a table may be created by an early file and recreated by a
    // later one, so the whole history is scanned rather than only the newest file.
    const all = `${projects}${revisions}${jobs}${engine}`;
    for (const table of [
      "video_projects",
      "video_project_assets",
      "video_messages",
      "video_brief_revisions",
      "video_art_direction_revisions",
      "video_composition_revisions",
      "video_composition_artifacts",
      "video_composition_events",
      "video_render_jobs",
      "video_versions",
      "video_moderation_events",
    ]) {
      expect(all, `${table} is created`).toContain(`create table public.${table} `);
    }
  });

  it("denies browser roles and grants service_role on every table", () => {
    for (const [name, migration] of [["projects", projects], ["revisions", revisions], ["engine", engine]] as const) {
      const created = [...migration.matchAll(/create table public\.([a-z_]+) /g)].map((match) => match[1]);
      expect(created.length, `${name} migration creates at least one table`).toBeGreaterThan(0);
      for (const table of created) {
        expect(migration, `${table} enables row level security`).toMatch(new RegExp(`alter table public\\.${table} enable row level security`));
        expect(migration, `${table} is revoked from browser roles`).toMatch(new RegExp(`revoke all on table public\\.${table} from anon, authenticated;`));
        expect(migration, `${table} is granted to service_role`).toMatch(new RegExp(`grant (select, insert, update, delete|select, insert, delete|select, insert|insert) on table public\\.${table} to service_role`));
      }
    }
  });

  it("keeps approved briefs immutable with a column scoped grant", () => {
    expect(revisions).toMatch(/grant update \(is_complete\) on public\.video_brief_revisions to service_role/i);
    expect(revisions).not.toMatch(/grant select, insert, update, delete on table public\.video_brief_revisions/i);
  });

  it("keeps the composition chain append-only", () => {
    for (const table of ["video_art_direction_revisions", "video_composition_revisions", "video_composition_artifacts", "video_composition_events", "video_versions"]) {
      expect(engine, `${table} has no blanket update grant`).not.toMatch(new RegExp(`grant select, insert, update, delete on table public\\.${table}`));
    }
    expect(engine).toMatch(/grant select, insert, update, delete on table public\.video_render_jobs to service_role;/);
  });

  it("retires the storyboard pipeline", () => {
    expect(engine).toMatch(/drop table public\.video_storyboard_revisions;/);
    expect(engine).not.toMatch(/create table public\.video_storyboard_revisions/);
  });

  it("permits at most one active render job per project", () => {
    expect(engine).toMatch(/create unique index video_render_jobs_active_project_idx on public\.video_render_jobs \(project_id\) where status in \('queued', 'preparing', 'rendering', 'uploading'\)/i);
    expect(engine).toMatch(/unique \(project_id, idempotency_key\)/i);
  });

  it("scopes project creation idempotency to each user", () => {
    expect(projectIdempotency).toMatch(/add column idempotency_key uuid/i);
    expect(projectIdempotency).toMatch(/create unique index video_projects_user_id_idempotency_key_key\s+on public\.video_projects \(user_id, idempotency_key\)\s+where idempotency_key is not null/i);
  });

  it("narrows the project to the five recipes, one design pack, and a free duration", () => {
    expect(engine).toMatch(/check \(video_type in \('product_promo', 'discount_promo', 'product_launch', 'menu_showcase', 'storefront_showcase'\)\)/i);
    expect(engine).toMatch(/check \(style_id in \('creative-mode'\)\)/i);
    expect(engine).toMatch(/check \(duration_seconds between 4 and 30\)/i);
    expect(engine).toMatch(/update public\.video_projects set style_id = 'creative-mode'/i);
  });

  it("points a render job at a frozen artifact and records a version per output kind", () => {
    expect(engine).toMatch(/composition_artifact_id uuid not null references public\.video_composition_artifacts\(id\) on delete restrict/i);
    expect(engine).toMatch(/kind text not null check \(kind in \('preview', 'final'\)\)/i);
    expect(engine).toMatch(/composition_hash text not null check \(composition_hash ~ '\^\[0-9a-f\]\{64\}\$'\)/i);
  });

  it("stores one artifact per composition hash and one version per project", () => {
    expect(engine).toMatch(/artifact_prefix text not null unique/i);
    expect(engine).toMatch(/unique \(composition_hash\)/i);
    expect(engine).toMatch(/unique \(project_id, version_number\)/i);
  });

  it("makes a fallback revision carry no model provenance, and a planned one carry it", () => {
    expect(engine).toMatch(/check \(\(is_fallback and generated_by is null\) or \(not is_fallback and generated_by is not null\)\)/i);
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

  it("lets the shared bucket hold a frozen composition, which is a directory of files", () => {
    for (const mime of ["text/html", "text/css", "text/javascript", "font/woff2", "audio/mp4"]) {
      expect(engine, `the bucket accepts ${mime}`).toContain(`'${mime}'`);
    }
    expect(engine).toMatch(/update storage\.buckets\s+set allowed_mime_types/);
  });
});

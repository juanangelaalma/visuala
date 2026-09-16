import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260914000000_create_creative_video_foundation.sql"),
  "utf8",
);

describe("creative video persistence migration", () => {
  it("defines transaction-backed atomic creation and guarded concept completion functions", () => {
    expect(migration).toMatch(/create function public\.create_owned_creative_project[\s\S]*insert into public\.creative_projects[\s\S]*insert into public\.creative_messages/);
    expect(migration).toMatch(/create function public\.apply_owned_creative_concept_generation[\s\S]*insert into public\.creative_concept_sets[\s\S]*insert into public\.creative_concepts/);
    expect(migration).not.toContain("store_owned_creative_concept_set");
  });

  it("enforces owner-scoped create idempotency and replays the winner", () => {
    expect(migration).toContain("create_idempotency_key text not null");
    expect(migration).toContain("unique (user_id, create_idempotency_key)");
    expect(migration).toMatch(/on conflict \(user_id, create_idempotency_key\) do nothing/);
    expect(migration).toContain("'created', false");
    expect(migration).toContain("'created', true");
  });

  it("validates the complete concept-set invariant before insertion", () => {
    expect(migration).toContain("creative_concept_count_invalid");
    expect(migration).toContain("creative_concept_recommendation_invalid");
    expect(migration).toContain("creative_concept_order_invalid");
    expect(migration).toContain("creative_concept_id_invalid");
    expect(migration).toContain("creative_concept_scene_outline_invalid");
  });

  it("enforces asset ownership for projects and messages at the database boundary", () => {
    expect(migration).toContain("foreign key (asset_id, user_id) references public.ai_assets(id, user_id)");
    expect(migration).toContain("foreign key (asset_id, project_owner_id) references public.ai_assets(id, user_id)");
  });

  it("enforces same-project brief, concept-set, concept, and active-concept relationships", () => {
    expect(migration).toContain("foreign key (brief_snapshot_id, project_id) references public.creative_brief_snapshots(id, project_id)");
    expect(migration).toContain("foreign key (concept_set_id, project_id) references public.creative_concept_sets(id, project_id)");
    expect(migration).toContain("foreign key (active_concept_id, id) references public.creative_concepts(id, project_id)");
  });

  it("binds authenticated transitions to auth.uid while allowing deliberate service-role calls", () => {
    expect(migration).toContain("auth.role() = 'service_role'");
    expect(migration).toContain("auth.uid() = p_user_id");
    expect(migration).toContain("raise exception 'creative_project_owner_mismatch'");
  });

  it("routes owner-scoped child writes through guarded functions instead of direct grants", () => {
    expect(migration).toMatch(/revoke insert, update, delete[\s\S]*creative_messages[\s\S]*from authenticated/);
    expect(migration).toMatch(/grant execute on function[\s\S]*public\.append_owned_creative_message/);
  });
});

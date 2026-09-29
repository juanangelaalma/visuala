import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  ArtDirectionRevision,
  ArtDirectionRevisionRepository,
  CompositionArtifact,
  CompositionArtifactRepository,
  CompositionEvent,
  CompositionEventRepository,
  CompositionRevision,
  CompositionRevisionRepository,
  CreateArtDirectionRevisionInput,
  CreateCompositionArtifactInput,
  CreateCompositionRevisionInput,
  RecordCompositionEventInput,
} from "../../domain/video-engine/contracts";
import type { Database } from "@visuala/db";

type ArtDirectionRow = Database["public"]["Tables"]["video_art_direction_revisions"]["Row"];
type CompositionRevisionRow = Database["public"]["Tables"]["video_composition_revisions"]["Row"];
type ArtifactRow = Database["public"]["Tables"]["video_composition_artifacts"]["Row"];
type EventRow = Database["public"]["Tables"]["video_composition_events"]["Row"];

/** Postgres' `unique_violation`, raised by the `(project_id, version)` index and by the artifact hash. */
function isUniqueViolation(error: { code?: string }): boolean {
  return error.code === "23505";
}

/** The unique index is the real guard, so two writers that picked the same version resolve here. */
async function nextVersion(supabase: SupabaseClient<Database>, table: "video_art_direction_revisions" | "video_composition_revisions", projectId: string): Promise<number> {
  const { data, error } = await supabase.from(table).select("version")
    .eq("project_id", projectId).order("version", { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  return (data?.version ?? 0) + 1;
}

export class SupabaseArtDirectionRevisionRepository implements ArtDirectionRevisionRepository {
  constructor(private readonly supabase: SupabaseClient<Database>) {}

  async create(input: CreateArtDirectionRevisionInput): Promise<ArtDirectionRevision> {
    const first = await this.insertRow(input);
    if (!first.error) return mapArtDirectionRevision(first.data);
    if (!isUniqueViolation(first.error)) throw first.error;

    const retry = await this.insertRow(input);
    if (retry.error) throw retry.error;
    return mapArtDirectionRevision(retry.data);
  }

  async latestOwned(projectId: string, userId: string): Promise<ArtDirectionRevision | null> {
    const { data, error } = await this.supabase.from("video_art_direction_revisions").select("*")
      .eq("project_id", projectId).eq("user_id", userId)
      .order("version", { ascending: false }).limit(1).maybeSingle();
    if (error) throw error;
    return data ? mapArtDirectionRevision(data) : null;
  }

  private async insertRow(input: CreateArtDirectionRevisionInput) {
    const version = await nextVersion(this.supabase, "video_art_direction_revisions", input.projectId);
    return this.supabase.from("video_art_direction_revisions").insert({
      project_id: input.projectId,
      user_id: input.userId,
      version,
      schema_version: input.schemaVersion,
      art_direction: input.artDirection,
      generated_by: input.generatedBy,
      source_message_ids: input.sourceMessageIds,
    }).select("*").single();
  }
}

export class SupabaseCompositionRevisionRepository implements CompositionRevisionRepository {
  constructor(private readonly supabase: SupabaseClient<Database>) {}

  async create(input: CreateCompositionRevisionInput): Promise<CompositionRevision> {
    const first = await this.insertRow(input);
    if (!first.error) return mapCompositionRevision(first.data);
    if (!isUniqueViolation(first.error)) throw first.error;

    const retry = await this.insertRow(input);
    if (retry.error) throw retry.error;
    return mapCompositionRevision(retry.data);
  }

  async latestOwned(projectId: string, userId: string): Promise<CompositionRevision | null> {
    const { data, error } = await this.supabase.from("video_composition_revisions").select("*")
      .eq("project_id", projectId).eq("user_id", userId)
      .order("version", { ascending: false }).limit(1).maybeSingle();
    if (error) throw error;
    return data ? mapCompositionRevision(data) : null;
  }

  async getOwned(revisionId: string, userId: string): Promise<CompositionRevision | null> {
    const { data, error } = await this.supabase.from("video_composition_revisions").select("*")
      .eq("id", revisionId).eq("user_id", userId).maybeSingle();
    if (error) throw error;
    return data ? mapCompositionRevision(data) : null;
  }

  async listOwned(projectId: string, userId: string, limit: number): Promise<CompositionRevision[]> {
    const { data, error } = await this.supabase.from("video_composition_revisions").select("*")
      .eq("project_id", projectId).eq("user_id", userId)
      .order("version", { ascending: false }).limit(limit);
    if (error) throw error;
    return (data ?? []).map(mapCompositionRevision);
  }

  private async insertRow(input: CreateCompositionRevisionInput) {
    const version = await nextVersion(this.supabase, "video_composition_revisions", input.projectId);
    return this.supabase.from("video_composition_revisions").insert({
      project_id: input.projectId,
      user_id: input.userId,
      version,
      schema_version: input.schemaVersion,
      brief_revision_id: input.briefRevisionId,
      art_direction_revision_id: input.artDirectionRevisionId,
      design_pack_id: input.designPackId,
      design_pack_version: input.designPackVersion,
      spec: input.spec,
      validation_report: input.validationReport,
      candidates: input.candidates,
      is_fallback: input.isFallback,
      generated_by: input.generatedBy,
    }).select("*").single();
  }
}

export class SupabaseCompositionArtifactRepository implements CompositionArtifactRepository {
  constructor(private readonly supabase: SupabaseClient<Database>) {}

  /** A second compile of identical bytes finds the existing row instead of failing on the hash. */
  async create(input: CreateCompositionArtifactInput): Promise<CompositionArtifact> {
    const inserted = await this.supabase.from("video_composition_artifacts").insert({
      id: input.id,
      project_id: input.projectId,
      user_id: input.userId,
      composition_revision_id: input.compositionRevisionId,
      design_pack_id: input.designPackId,
      design_pack_version: input.designPackVersion,
      compiler_version: input.compilerVersion,
      module_versions: input.moduleVersions,
      asset_hashes: input.assetHashes,
      catalog_components: input.catalogComponents,
      composition_hash: input.compositionHash,
      artifact_prefix: input.artifactPrefix,
    }).select("*").single();

    if (!inserted.error) return mapArtifact(inserted.data);
    if (!isUniqueViolation(inserted.error)) throw inserted.error;

    const existing = await this.supabase.from("video_composition_artifacts").select("*")
      .eq("composition_hash", input.compositionHash).maybeSingle();
    if (existing.error) throw existing.error;
    if (existing.data) return mapArtifact(existing.data);
    throw inserted.error;
  }

  async getById(artifactId: string): Promise<CompositionArtifact | null> {
    const { data, error } = await this.supabase.from("video_composition_artifacts").select("*")
      .eq("id", artifactId).maybeSingle();
    if (error) throw error;
    return data ? mapArtifact(data) : null;
  }

  async findByCompositionRevision(compositionRevisionId: string): Promise<CompositionArtifact | null> {
    const { data, error } = await this.supabase.from("video_composition_artifacts").select("*")
      .eq("composition_revision_id", compositionRevisionId).maybeSingle();
    if (error) throw error;
    return data ? mapArtifact(data) : null;
  }

  async latestOwned(projectId: string, userId: string): Promise<CompositionArtifact | null> {
    const { data, error } = await this.supabase.from("video_composition_artifacts").select("*")
      .eq("project_id", projectId).eq("user_id", userId)
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (error) throw error;
    return data ? mapArtifact(data) : null;
  }
}

export class SupabaseCompositionEventRepository implements CompositionEventRepository {
  constructor(private readonly supabase: SupabaseClient<Database>) {}

  async record(input: RecordCompositionEventInput): Promise<void> {
    const { error } = await this.supabase.from("video_composition_events").insert({
      project_id: input.projectId,
      user_id: input.userId,
      event: input.event,
      composition_revision_id: input.compositionRevisionId ?? null,
      render_job_id: input.renderJobId ?? null,
      recipe: input.recipe ?? null,
      design_pack_id: input.designPackId ?? null,
      design_pack_version: input.designPackVersion ?? null,
      catalog_components: input.catalogComponents ?? [],
      planner_latency_ms: input.plannerLatencyMs ?? null,
      is_fallback: input.isFallback ?? null,
      render_status: input.renderStatus ?? null,
      render_duration_ms: input.renderDurationMs ?? null,
      render_error_code: input.renderErrorCode ?? null,
      llm_cost_amount: input.llmCostAmount ?? null,
      llm_cost_currency: input.llmCostCurrency ?? null,
    });
    if (error) throw error;
  }

  async listOwned(projectId: string, userId: string, limit: number): Promise<CompositionEvent[]> {
    const { data, error } = await this.supabase.from("video_composition_events").select("*")
      .eq("project_id", projectId).eq("user_id", userId)
      .order("created_at", { ascending: false }).limit(limit);
    if (error) throw error;
    return (data ?? []).map(mapEvent);
  }
}

export function mapArtDirectionRevision(row: ArtDirectionRow): ArtDirectionRevision {
  return {
    id: row.id,
    projectId: row.project_id,
    userId: row.user_id,
    version: row.version,
    schemaVersion: row.schema_version,
    artDirection: row.art_direction,
    generatedBy: row.generated_by,
    sourceMessageIds: row.source_message_ids,
    createdAt: row.created_at,
  };
}

export function mapCompositionRevision(row: CompositionRevisionRow): CompositionRevision {
  return {
    id: row.id,
    projectId: row.project_id,
    userId: row.user_id,
    version: row.version,
    schemaVersion: row.schema_version,
    briefRevisionId: row.brief_revision_id,
    artDirectionRevisionId: row.art_direction_revision_id,
    designPackId: row.design_pack_id,
    designPackVersion: row.design_pack_version,
    spec: row.spec,
    validationReport: row.validation_report,
    candidates: row.candidates,
    isFallback: row.is_fallback,
    generatedBy: row.generated_by ?? null,
    createdAt: row.created_at,
  };
}

export function mapArtifact(row: ArtifactRow): CompositionArtifact {
  return {
    id: row.id,
    projectId: row.project_id,
    userId: row.user_id,
    compositionRevisionId: row.composition_revision_id,
    designPackId: row.design_pack_id,
    designPackVersion: row.design_pack_version,
    compilerVersion: row.compiler_version,
    moduleVersions: row.module_versions,
    assetHashes: row.asset_hashes,
    catalogComponents: row.catalog_components,
    compositionHash: row.composition_hash,
    artifactPrefix: row.artifact_prefix,
    createdAt: row.created_at,
  };
}

export function mapEvent(row: EventRow): CompositionEvent {
  return {
    id: row.id,
    projectId: row.project_id,
    userId: row.user_id,
    compositionRevisionId: row.composition_revision_id,
    renderJobId: row.render_job_id,
    event: row.event,
    recipe: row.recipe,
    designPackId: row.design_pack_id,
    designPackVersion: row.design_pack_version,
    catalogComponents: row.catalog_components,
    plannerLatencyMs: row.planner_latency_ms,
    isFallback: row.is_fallback,
    renderStatus: row.render_status,
    renderDurationMs: row.render_duration_ms,
    renderErrorCode: row.render_error_code,
    llmCostAmount: row.llm_cost_amount,
    llmCostCurrency: row.llm_cost_currency,
    createdAt: row.created_at,
  };
}

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  CreateCreativeProjectInput,
  CreateCreativeProjectResult,
  CreativeVideoRepository,
  ApplyBriefAnalysisInput,
  ApplyConceptGenerationInput,
  PersistClarificationAnswerInput,
  PersistClarificationAnswerResult,
  ProjectTransitionInput,
} from "@/domain/creative-video/contracts";
import { ProjectRevisionConflictError } from "@/domain/creative-video/errors";
import type {
  BriefSnapshot,
  Concept,
  ConversationMessage,
  CreativeProject,
  CreativeProjectAggregate,
} from "@/domain/creative-video/types";
import type { Database } from "@/infrastructure/supabase/database.types";
import { z } from "zod";

type Tables = Database["public"]["Tables"];
type ProjectRow = Tables["creative_projects"]["Row"];
type MessageRow = Tables["creative_messages"]["Row"];
type BriefRow = Tables["creative_brief_snapshots"]["Row"];
type ConceptRow = Tables["creative_concepts"]["Row"];

export class SupabaseCreativeVideoRepository implements CreativeVideoRepository {
  constructor(private readonly supabase: SupabaseClient<Database>) {}

  async findByCreateKey(userId: string, idempotencyKey: string): Promise<CreativeProjectAggregate | null> {
    const { data, error } = await this.supabase
      .from("creative_projects")
      .select("id")
      .eq("user_id", userId)
      .eq("create_idempotency_key", idempotencyKey)
      .maybeSingle();
    if (error) throw error;
    return data ? this.getOwnedProject(data.id, userId) : null;
  }

  async create(input: CreateCreativeProjectInput): Promise<CreateCreativeProjectResult> {
    const { data, error } = await this.supabase.rpc("create_owned_creative_project", {
      p_project: mapProjectInsert(input.project),
      p_initial_message: mapMessageInsert(input.message),
    });
    if (error) throw error;
    return { aggregate: (await this.getOwnedProject(data.project.id, data.project.user_id))!, created: data.created };
  }

  async getOwnedProject(projectId: string, userId: string): Promise<CreativeProjectAggregate | null> {
    const { data, error } = await this.supabase
      .from("creative_projects")
      .select("*")
      .eq("id", projectId)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;

    const [messages, brief, concepts] = await Promise.all([
      this.listMessages(projectId),
      this.getBrief(projectId),
      this.listConcepts(projectId),
    ]);
    return { project: mapProject(data), messages, brief, concepts };
  }

  async findMessageByKey(projectId: string, idempotencyKey: string): Promise<ConversationMessage | null> {
    const { data, error } = await this.supabase
      .from("creative_messages")
      .select("*")
      .eq("project_id", projectId)
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();
    if (error) throw error;
    return data ? mapMessage(data) : null;
  }

  async appendMessage(message: ConversationMessage): Promise<void> {
    const { error } = await this.supabase.rpc("append_owned_creative_message", {
      p_message: mapMessageInsert(message),
    });
    if (error) throw error;
  }

  async persistClarificationAnswer(input: PersistClarificationAnswerInput): Promise<PersistClarificationAnswerResult> {
    const { data, error } = await this.supabase.rpc("persist_owned_creative_clarification_answer", {
      p_project_id: input.projectId,
      p_user_id: input.userId,
      p_expected_revision: input.expectedRevision,
      p_message: mapMessageInsert(input.message),
    });
    if (error) throw error;
    if (data.status === "stale" || !data.project) return { status: "stale" };
    return { status: data.status, project: mapProject(data.project) };
  }

  async applyBriefAnalysis(input: ApplyBriefAnalysisInput): Promise<CreativeProject> {
    const { data, error } = await this.supabase.rpc("apply_owned_creative_brief_analysis", {
      p_project_id: input.snapshot.projectId,
      p_snapshot: mapBriefInsert(input.snapshot),
      p_user_id: input.userId,
      p_expected_revision: input.expectedRevision,
      p_next_state: input.state,
    });
    if (error) throw error;
    if (!data) throw new ProjectRevisionConflictError();
    return mapProject(data);
  }

  async applyConceptGeneration(input: ApplyConceptGenerationInput): Promise<CreativeProject> {
    const first = input.concepts[0];
    if (!first) throw new Error("A concept generation requires concepts");
    const { data, error } = await this.supabase.rpc("apply_owned_creative_concept_generation", {
      p_project_id: first.projectId,
      p_user_id: input.userId,
      p_expected_revision: input.expectedRevision,
      p_source_brief_revision: input.sourceBriefRevision,
      p_concept_set: mapConceptSetInsert(first),
      p_concepts: input.concepts.map(mapConceptInsert),
    });
    if (error) throw error;
    if (!data) throw new ProjectRevisionConflictError();
    return mapProject(data);
  }

  async transition(input: ProjectTransitionInput): Promise<CreativeProject> {
    const { data, error } = await this.supabase.rpc("transition_owned_creative_project", {
      p_project_id: input.projectId,
      p_user_id: input.userId,
      p_expected_revision: input.expectedRevision,
      p_next_state: input.state,
      p_patch: mapTransitionPatch(input.patch),
    });
    if (error) throw error;
    if (!data) throw new ProjectRevisionConflictError();
    return mapProject(data);
  }

  private async listMessages(projectId: string): Promise<ConversationMessage[]> {
    const { data, error } = await this.supabase.from("creative_messages").select("*").eq("project_id", projectId).order("created_at");
    if (error) throw error;
    return data.map(mapMessage);
  }

  private async getBrief(projectId: string): Promise<BriefSnapshot | null> {
    const { data, error } = await this.supabase.from("creative_brief_snapshots").select("*").eq("project_id", projectId).order("created_at", { ascending: false });
    if (error) throw error;
    return data[0] ? mapBrief(data[0]) : null;
  }

  private async listConcepts(projectId: string): Promise<Concept[]> {
    const { data, error } = await this.supabase.from("creative_concepts").select("*").eq("project_id", projectId).order("sort_order");
    if (error) throw error;
    return data.map(mapConcept);
  }
}

function mapProjectInsert(project: CreativeProject): Tables["creative_projects"]["Insert"] {
  return {
    id: project.id, user_id: project.userId, create_idempotency_key: project.createIdempotencyKey, category_plugin_id: project.category.id,
    category_plugin_version: project.category.version, state: project.state, revision: project.revision,
    asset_id: project.assetId, active_concept_id: project.activeConceptId,
    active_composition_version_id: project.activeCompositionVersionId, failed_stage: project.failedStage,
    error_code: project.errorCode, preview_generation_count: project.previewGenerationCount,
    preview_quota: project.previewQuota, created_at: project.createdAt, updated_at: project.updatedAt,
  };
}

function mapProject(row: ProjectRow): CreativeProject {
  return {
    id: row.id, userId: row.user_id, createIdempotencyKey: row.create_idempotency_key, category: { id: row.category_plugin_id, version: row.category_plugin_version },
    state: row.state, revision: row.revision, assetId: row.asset_id, activeConceptId: row.active_concept_id,
    activeCompositionVersionId: row.active_composition_version_id, failedStage: row.failed_stage,
    errorCode: row.error_code, previewGenerationCount: row.preview_generation_count,
    previewQuota: row.preview_quota, createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

function mapMessageInsert(message: ConversationMessage): Tables["creative_messages"]["Insert"] {
  return { id: message.id, project_id: message.projectId, role: message.role, kind: message.kind, text: message.text, asset_id: message.assetId, project_revision: message.projectRevision, idempotency_key: message.idempotencyKey, created_at: message.createdAt };
}

function mapMessage(row: MessageRow): ConversationMessage {
  return { id: row.id, projectId: row.project_id, role: row.role, kind: row.kind, text: row.text, assetId: row.asset_id, projectRevision: row.project_revision, idempotencyKey: row.idempotency_key, createdAt: row.created_at };
}

function mapBriefInsert(snapshot: BriefSnapshot): Tables["creative_brief_snapshots"]["Insert"] {
  return { id: snapshot.id, project_id: snapshot.projectId, goal: snapshot.goal, product: snapshot.product, facts: snapshot.facts, assumptions: snapshot.assumptions, missing_required_questions: snapshot.missingRequiredQuestions, optional_questions: snapshot.optionalQuestions, asset_ids: snapshot.assetIds, plugin_schema_version: snapshot.pluginSchemaVersion, source_project_revision: snapshot.sourceProjectRevision, created_at: snapshot.createdAt };
}

function mapBrief(row: BriefRow): BriefSnapshot {
  const parsed = persistedBriefPayloadSchema.safeParse({ facts: row.facts, assumptions: row.assumptions, missingRequiredQuestions: row.missing_required_questions, optionalQuestions: row.optional_questions, assetIds: row.asset_ids });
  if (!parsed.success) throw new Error("Persisted creative video data is invalid.");
  return { id: row.id, projectId: row.project_id, goal: row.goal, product: row.product, ...parsed.data, pluginSchemaVersion: row.plugin_schema_version, sourceProjectRevision: row.source_project_revision, createdAt: row.created_at };
}

function mapConceptInsert(concept: Concept): Tables["creative_concepts"]["Insert"] {
  return { id: concept.id, project_id: concept.projectId, concept_set_id: concept.generation.requestId, brief_snapshot_id: concept.briefSnapshotId, title: concept.title, hook: concept.hook, angle: concept.angle, scene_outline: concept.sceneOutline, fit_reason: concept.fitReason, recommendation_reason: concept.recommendationReason, recommended: concept.recommended, sort_order: concept.order, generation_request_id: concept.generation.requestId, generation_prompt_version: concept.generation.promptVersion, generation_model: concept.generation.model, created_at: concept.createdAt };
}

function mapConceptSetInsert(concept: Concept): Tables["creative_concept_sets"]["Insert"] {
  return { id: concept.generation.requestId, project_id: concept.projectId, brief_snapshot_id: concept.briefSnapshotId, request_id: concept.generation.requestId, prompt_version: concept.generation.promptVersion, model: concept.generation.model, created_at: concept.createdAt };
}

function mapConcept(row: ConceptRow): Concept {
  const parsed = persistedSceneOutlineSchema.safeParse(row.scene_outline);
  if (!parsed.success) throw new Error("Persisted creative video data is invalid.");
  return { id: row.id, projectId: row.project_id, briefSnapshotId: row.brief_snapshot_id, title: row.title, hook: row.hook, angle: row.angle, sceneOutline: parsed.data, fitReason: row.fit_reason, recommendationReason: row.recommendation_reason, recommended: row.recommended, order: row.sort_order, generation: { requestId: row.generation_request_id, promptVersion: row.generation_prompt_version, model: row.generation_model }, createdAt: row.created_at };
}

const persistedBriefPayloadSchema = z.object({
  facts: z.array(z.object({ id: z.string().min(1), value: z.unknown(), provenance: z.enum(["user", "visual_observation", "assumption"]) })),
  assumptions: z.array(z.string()),
  missingRequiredQuestions: z.array(z.string()),
  optionalQuestions: z.array(z.string()),
  assetIds: z.array(z.string()),
});
const persistedSceneOutlineSchema = z.tuple([z.string(), z.string(), z.string(), z.string()]);

function mapTransitionPatch(patch: ProjectTransitionInput["patch"]): Record<string, unknown> {
  if (!patch) return {};
  return Object.fromEntries(Object.entries({ active_concept_id: patch.activeConceptId, active_composition_version_id: patch.activeCompositionVersionId, failed_stage: patch.failedStage, error_code: patch.errorCode, preview_generation_count: patch.previewGenerationCount }).filter(([, value]) => value !== undefined));
}

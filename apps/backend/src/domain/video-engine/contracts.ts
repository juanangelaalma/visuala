/** The render job statuses the partial unique index on `(project_id)` treats as in flight. */
export const ENGINE_RENDER_JOB_STATUSES = [
  "queued",
  "preparing",
  "rendering",
  "uploading",
  "succeeded",
  "failed",
  "cancelled",
] as const;

export type EngineRenderJobStatus = (typeof ENGINE_RENDER_JOB_STATUSES)[number];

export const ACTIVE_ENGINE_RENDER_JOB_STATUSES = ["queued", "preparing", "rendering", "uploading"] as const;

export type OutputKind = "preview" | "final";

export type ArtDirectionRevision = {
  id: string;
  projectId: string;
  userId: string;
  version: number;
  schemaVersion: string;
  artDirection: unknown;
  generatedBy: unknown;
  sourceMessageIds: string[];
  createdAt: string;
};

export type CompositionRevision = {
  id: string;
  projectId: string;
  userId: string;
  version: number;
  schemaVersion: string;
  briefRevisionId: string;
  artDirectionRevisionId: string;
  designPackId: string;
  designPackVersion: string;
  spec: unknown;
  validationReport: unknown;
  candidates: unknown;
  isFallback: boolean;
  /** Null exactly when the revision is a fallback: a modelled plan carries its provenance. */
  generatedBy: unknown | null;
  createdAt: string;
};

export type CompositionArtifact = {
  id: string;
  projectId: string;
  userId: string;
  compositionRevisionId: string;
  designPackId: string;
  designPackVersion: string;
  compilerVersion: string;
  moduleVersions: unknown;
  assetHashes: unknown;
  catalogComponents: string[];
  compositionHash: string;
  artifactPrefix: string;
  createdAt: string;
};

export type CompositionEvent = {
  id: string;
  projectId: string;
  userId: string;
  compositionRevisionId: string | null;
  renderJobId: string | null;
  event: string;
  recipe: string | null;
  designPackId: string | null;
  designPackVersion: string | null;
  catalogComponents: string[];
  plannerLatencyMs: number | null;
  isFallback: boolean | null;
  renderStatus: string | null;
  renderDurationMs: number | null;
  renderErrorCode: string | null;
  llmCostAmount: number | null;
  llmCostCurrency: string | null;
  createdAt: string;
};

export type RenderJob = {
  id: string;
  projectId: string;
  userId: string;
  idempotencyKey: string;
  compositionArtifactId: string;
  kind: OutputKind;
  parentVersionId?: string;
  isRevision: boolean;
  inputSnapshot: unknown;
  status: EngineRenderJobStatus;
  attempts: number;
  queuedAt: string;
  startedAt?: string;
  finishedAt?: string;
  errorCode?: string;
  createdAt: string;
  updatedAt: string;
};

export type VideoVersion = {
  id: string;
  projectId: string;
  userId: string;
  versionNumber: number;
  renderJobId: string;
  parentVersionId?: string;
  outputObjectKey: string;
  kind: OutputKind;
  durationSeconds: number;
  aspectRatio: string;
  resolution: string;
  compositionHash: string;
  createdAt: string;
};

export type CreateArtDirectionRevisionInput = {
  projectId: string;
  userId: string;
  schemaVersion: string;
  artDirection: unknown;
  generatedBy: unknown;
  sourceMessageIds: string[];
};

export interface ArtDirectionRevisionRepository {
  create(input: CreateArtDirectionRevisionInput): Promise<ArtDirectionRevision>;
  latestOwned(projectId: string, userId: string): Promise<ArtDirectionRevision | null>;
}

export type CreateCompositionRevisionInput = {
  projectId: string;
  userId: string;
  schemaVersion: string;
  briefRevisionId: string;
  artDirectionRevisionId: string;
  designPackId: string;
  designPackVersion: string;
  spec: unknown;
  validationReport: unknown;
  candidates: unknown;
  isFallback: boolean;
  generatedBy: unknown | null;
};

export interface CompositionRevisionRepository {
  create(input: CreateCompositionRevisionInput): Promise<CompositionRevision>;
  /** Newest first, so the workspace can show the plan it is about to render. */
  latestOwned(projectId: string, userId: string): Promise<CompositionRevision | null>;
  listOwned(projectId: string, userId: string, limit: number): Promise<CompositionRevision[]>;
  getOwned(revisionId: string, userId: string): Promise<CompositionRevision | null>;
}

export type CreateCompositionArtifactInput = {
  id: string;
  projectId: string;
  userId: string;
  compositionRevisionId: string;
  designPackId: string;
  designPackVersion: string;
  compilerVersion: string;
  moduleVersions: unknown;
  assetHashes: unknown;
  catalogComponents: string[];
  compositionHash: string;
  artifactPrefix: string;
};

export interface CompositionArtifactRepository {
  /**
   * Content addressed: compiling the same bytes twice returns the row that already exists, so a
   * regeneration that produces an identical composition does not fail on the unique hash.
   */
  create(input: CreateCompositionArtifactInput): Promise<CompositionArtifact>;
  getById(artifactId: string): Promise<CompositionArtifact | null>;
  findByCompositionRevision(compositionRevisionId: string): Promise<CompositionArtifact | null>;
  latestOwned(projectId: string, userId: string): Promise<CompositionArtifact | null>;
}

export type RecordCompositionEventInput = {
  projectId: string;
  userId: string;
  event: string;
  compositionRevisionId?: string | null;
  renderJobId?: string | null;
  recipe?: string | null;
  designPackId?: string | null;
  designPackVersion?: string | null;
  catalogComponents?: string[];
  plannerLatencyMs?: number | null;
  isFallback?: boolean | null;
  renderStatus?: string | null;
  renderDurationMs?: number | null;
  renderErrorCode?: string | null;
  llmCostAmount?: number | null;
  llmCostCurrency?: string | null;
};

export interface CompositionEventRepository {
  record(input: RecordCompositionEventInput): Promise<void>;
  listOwned(projectId: string, userId: string, limit: number): Promise<CompositionEvent[]>;
}

export type CreateRenderJobInput = {
  id: string;
  projectId: string;
  userId: string;
  idempotencyKey: string;
  compositionArtifactId: string;
  kind: OutputKind;
  parentVersionId?: string;
  isRevision: boolean;
  inputSnapshot: unknown;
};

/**
 * `getById`, `begin`, `fail`, `listQueued`, and `listStale` take no owner: the worker is server-side
 * and has no session, and the queue and the reclaimer are server-wide by definition. Every other read
 * filters on `user_id` inside the query, so a route cannot widen its scope by forgetting a check.
 */
export interface RenderJobRepository {
  create(input: CreateRenderJobInput): Promise<RenderJob>;
  getOwned(jobId: string, userId: string): Promise<RenderJob | null>;
  getById(jobId: string): Promise<RenderJob | null>;
  findByIdempotencyKey(projectId: string, userId: string, idempotencyKey: string): Promise<RenderJob | null>;
  findActiveForProject(projectId: string, userId: string): Promise<RenderJob | null>;
  /** Conditional `queued -> preparing` that also increments `attempts`. Null when the row was not queued. */
  begin(jobId: string): Promise<RenderJob | null>;
  fail(jobId: string, errorCode: string): Promise<RenderJob | null>;
  cancel(jobId: string, userId: string): Promise<RenderJob | null>;
  latestOwned(projectId: string, userId: string): Promise<RenderJob | null>;
  listQueued(limit: number): Promise<RenderJob[]>;
  listStale(startedBefore: string, limit: number): Promise<RenderJob[]>;
  /** Conditional `preparing -> rendering`. Null means the worker no longer owns the job. */
  markRendering(jobId: string): Promise<RenderJob | null>;
  /** Conditional `rendering -> uploading`. Null means the worker no longer owns the job. */
  markUploading(jobId: string): Promise<RenderJob | null>;
  /** Conditional `uploading -> succeeded`, stamping `finished_at`. */
  succeed(jobId: string): Promise<RenderJob | null>;
}

export type CreateVideoVersionInput = {
  /** Minted before the upload, because the object key names the version id. */
  id: string;
  projectId: string;
  userId: string;
  versionNumber: number;
  renderJobId: string;
  parentVersionId?: string;
  outputObjectKey: string;
  kind: OutputKind;
  durationSeconds: number;
  aspectRatio: string;
  resolution: string;
  compositionHash: string;
};

export interface VideoVersionRepository {
  create(input: CreateVideoVersionInput): Promise<VideoVersion>;
  getOwned(versionId: string, userId: string): Promise<VideoVersion | null>;
  /** The version list a user may download: previews are excluded here, not in the caller. */
  listFinalOwned(projectId: string, userId: string): Promise<VideoVersion[]>;
  latestOwned(projectId: string, userId: string, kind: OutputKind): Promise<VideoVersion | null>;
  nextVersionNumber(projectId: string): Promise<number>;
}

export function isActiveRenderJobStatus(status: EngineRenderJobStatus): boolean {
  return (ACTIVE_ENGINE_RENDER_JOB_STATUSES as readonly string[]).includes(status);
}

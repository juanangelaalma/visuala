import { z } from "zod";
import { findMissingBriefFields, findUnsupportedCommercialFacts, videoBriefSchema } from "../../domain/video/brief";
import { findStoryboardProblems, storyboardSchema } from "../../domain/video/storyboard";
import { outputSettingsSchema, VIDEO_STYLE_IDS, videoTypeSchema } from "../../domain/video/settings";
import { VideoError } from "../../domain/video/errors";
import type { VideoBriefRevisionRepository, VideoProjectRepository, VideoStoryboardRevisionRepository } from "../../domain/video/contracts";
import type { VideoProject } from "../../domain/video/types";

export const APPROVAL_SCHEMA_VERSION = "video-approval@v1";

export const approvalSnapshotSchema = z.object({
  schemaVersion: z.literal(APPROVAL_SCHEMA_VERSION),
  approvedAt: z.string(),
  briefRevisionId: z.string().uuid(),
  briefVersion: z.number().int().positive(),
  storyboardRevisionId: z.string().uuid(),
  storyboardVersion: z.number().int().positive(),
  videoType: videoTypeSchema,
  styleId: z.enum(VIDEO_STYLE_IDS),
  settings: outputSettingsSchema,
  promptVersion: z.string().min(1),
  profileId: z.string().min(1),
  provider: z.string().min(1),
  model: z.string().min(1),
}).strict();

export type ApprovalSnapshot = z.infer<typeof approvalSnapshotSchema>;

type ApprovalDependencies = {
  projects: Pick<VideoProjectRepository, "getOwned" | "transition">;
  briefRevisions: Pick<VideoBriefRevisionRepository, "latestOwned">;
  storyboardRevisions: Pick<VideoStoryboardRevisionRepository, "latestOwned" | "approve">;
  now: () => string;
};

/**
 * The gate between a reviewed plan and an expensive render. Everything a render needs to be
 * reproducible is proven here first: the brief satisfies what its video type requires, every
 * commercial fact traces back to something the user said, and the storyboard fits the project's
 * settings and the brief revision it was written for. Only then is the snapshot frozen onto the
 * storyboard revision and the project moved to `approved`.
 *
 * Approval is idempotent by design: an already approved project returns the snapshot that was
 * frozen, and no second write ever happens, because the snapshot only means something if it is
 * immutable.
 */
export async function approveVideoProject(
  command: { userId: string; projectId: string },
  dependencies: ApprovalDependencies,
): Promise<{ project: VideoProject; approval: ApprovalSnapshot }> {
  const project = await requireProject(command.projectId, command.userId, dependencies);

  // Re-approval: the snapshot already exists, so it is read back instead of re-derived. A project
  // that reads `approved` without an approved storyboard is a broken invariant, not a new approval.
  if (project.status === "approved") {
    const existing = await dependencies.storyboardRevisions.latestOwned(project.id, command.userId);
    if (existing?.approvedAt) return { project, approval: approvalSnapshotSchema.parse(existing.approvalSnapshot) };
    throw new VideoError("video_state_conflict", "The project has no approved storyboard to return.");
  }

  if (project.status !== "awaiting_approval" && project.status !== "revision_draft") {
    throw new VideoError("video_state_conflict", `A project in ${project.status} cannot be approved.`);
  }

  const briefRevision = await dependencies.briefRevisions.latestOwned(project.id, command.userId);
  if (!briefRevision) throw incomplete("A brief is required before approval.");

  // The stored brief is re-validated rather than trusted: `is_complete` was computed by whoever
  // wrote the revision, and approval is the last point at which a bad brief can be stopped.
  const brief = videoBriefSchema.safeParse(briefRevision.brief);
  if (!brief.success) throw incomplete("The brief is not valid.");
  const missing = findMissingBriefFields(brief.data, project.videoType);
  if (missing.length > 0) throw incomplete(`The brief is missing: ${missing.join(", ")}.`);
  const unsupported = findUnsupportedCommercialFacts(brief.data);
  if (unsupported.length > 0) throw incomplete(`Confirm these details first: ${unsupported.join(", ")}.`);

  const storyboardRevision = await dependencies.storyboardRevisions.latestOwned(project.id, command.userId);
  if (!storyboardRevision) throw incomplete("A storyboard is required before approval.");
  if (storyboardRevision.briefRevisionId !== briefRevision.id) throw incomplete("The storyboard was built from a different brief.");

  const storyboard = storyboardSchema.safeParse({ scenes: storyboardRevision.scenes });
  if (!storyboard.success) throw incomplete("The storyboard is not valid.");
  const problems = findStoryboardProblems(storyboard.data.scenes, project.settings);
  if (problems.length > 0) throw incomplete(`The storyboard cannot be rendered: ${problems.join(", ")}.`);

  const approval = buildApprovalSnapshot({
    project,
    briefRevision,
    storyboardRevision,
    generatedBy: briefRevision.generatedBy,
    approvedAt: dependencies.now(),
  });

  const approved = await dependencies.storyboardRevisions.approve(storyboardRevision.id, command.userId, approval.approvedAt, approval);
  if (!approved) throw new VideoError("video_state_conflict", "The storyboard changed before it could be approved.");

  // A conditional transition, so two concurrent approvals cannot both move the project: the loser
  // gets null, re-reads, and reports the approval it just froze once it sees the project approved.
  const transitioned = await dependencies.projects.transition(project.id, command.userId, project.status, "approved");
  if (!transitioned) {
    const current = await requireProject(command.projectId, command.userId, dependencies);
    if (current.status !== "approved") throw new VideoError("video_state_conflict", "The project could not be approved.");
    return { project: current, approval };
  }

  return { project: transitioned, approval };
}

export function buildApprovalSnapshot(input: {
  project: Pick<VideoProject, "videoType" | "styleId" | "settings">;
  briefRevision: { id: string; version: number };
  storyboardRevision: { id: string; version: number };
  generatedBy: { profileId: string; provider: string; model: string; promptVersion: string };
  approvedAt: string;
}): ApprovalSnapshot {
  return approvalSnapshotSchema.parse({
    schemaVersion: APPROVAL_SCHEMA_VERSION,
    approvedAt: input.approvedAt,
    briefRevisionId: input.briefRevision.id,
    briefVersion: input.briefRevision.version,
    storyboardRevisionId: input.storyboardRevision.id,
    storyboardVersion: input.storyboardRevision.version,
    videoType: input.project.videoType,
    styleId: input.project.styleId,
    settings: input.project.settings,
    promptVersion: input.generatedBy.promptVersion,
    profileId: input.generatedBy.profileId,
    provider: input.generatedBy.provider,
    model: input.generatedBy.model,
  });
}

async function requireProject(projectId: string, userId: string, dependencies: ApprovalDependencies): Promise<VideoProject> {
  const project = await dependencies.projects.getOwned(projectId, userId);
  if (!project) throw new VideoError("video_project_not_found", "The video project was not found.");
  return project;
}

function incomplete(message: string): VideoError {
  return new VideoError("video_approval_incomplete", message);
}

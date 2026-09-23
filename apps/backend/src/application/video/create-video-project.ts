import { z } from "zod";
import type { VideoProjectRepository } from "../../domain/video/contracts";
import { VideoError } from "../../domain/video/errors";
import { validateOutputSettings } from "../../domain/video/settings";
import type { VideoOutputSettings, VideoProject, VideoStyleId, VideoType } from "../../domain/video/types";

const MAX_TITLE_LENGTH = 120;
const IDEMPOTENCY_CONSTRAINT = "video_projects_user_id_idempotency_key_key";
const idempotencyKeySchema = z.string().uuid();

export type CreateVideoProjectCommand = {
  userId: string;
  idempotencyKey: string;
  title: string;
  videoType: VideoType;
  styleId: VideoStyleId;
  settings: VideoOutputSettings;
};

export type CreateProjectDependencies = {
  projects: Pick<VideoProjectRepository, "create" | "findByIdempotencyKey">;
  createId: () => string;
};

export async function createVideoProject(
  command: CreateVideoProjectCommand,
  dependencies: CreateProjectDependencies,
): Promise<{ project: VideoProject; created: boolean }> {
  const validated = validateCommand(command);
  const existing = await dependencies.projects.findByIdempotencyKey(validated.userId, validated.idempotencyKey);
  if (existing) return { project: existing, created: false };

  try {
    const project = await dependencies.projects.create({ id: dependencies.createId(), ...validated });
    return { project, created: true };
  } catch (error) {
    if (!isIdempotencyConflict(error)) throw error;

    const winner = await dependencies.projects.findByIdempotencyKey(validated.userId, validated.idempotencyKey);
    if (winner) return { project: winner, created: false };
    throw error;
  }
}

function validateCommand(command: CreateVideoProjectCommand): CreateVideoProjectCommand {
  const title = command.title.trim();
  if (title.length === 0 || title.length > MAX_TITLE_LENGTH || !idempotencyKeySchema.safeParse(command.idempotencyKey).success) {
    throw new VideoError("video_input_invalid", "The project request is invalid.");
  }

  return { ...command, title, settings: validateOutputSettings(command.settings) };
}

function isIdempotencyConflict(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const persistenceError = error as { code?: string; constraint?: string; message?: string };
  return persistenceError.code === "23505"
    && (persistenceError.constraint === IDEMPOTENCY_CONSTRAINT
      || persistenceError.message?.includes(`constraint \"${IDEMPOTENCY_CONSTRAINT}\"`) === true);
}

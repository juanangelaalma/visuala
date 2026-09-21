import { VideoError } from "../../domain/video/errors";
import type { VideoMessageRepository, VideoProjectRepository } from "../../domain/video/contracts";
import type { VideoMessage, VideoProject } from "../../domain/video/types";

/** Mirrors the `char_length(content) between 1 and 4000` check on `video_messages.content`. */
const MAX_MESSAGE_LENGTH = 4000;

export type MessageDependencies = {
  projects: Pick<VideoProjectRepository, "getOwned" | "transition">;
  messages: VideoMessageRepository;
  createId: () => string;
};

export type AppendVideoMessageCommand = {
  userId: string;
  projectId: string;
  content: string;
  assetIds?: string[];
};

/**
 * Persists what the user said and, on the first message, opens the interview. The assistant reply,
 * the interviewer loop, and the moderation call are not part of this use case: the AI
 * orchestration plan fills them in behind the same HTTP contract.
 */
export async function appendVideoMessage(
  command: AppendVideoMessageCommand,
  dependencies: MessageDependencies,
): Promise<{ message: VideoMessage; project: VideoProject }> {
  let project = await requireActiveProject(command.projectId, command.userId, dependencies);

  const content = command.content.trim();
  if (content.length === 0 || content.length > MAX_MESSAGE_LENGTH) throw invalidInput("Write a message between 1 and 4000 characters.");

  if (project.status === "draft") project = await enterInterviewing(project, command.userId, dependencies);

  const message = await dependencies.messages.append({
    id: dependencies.createId(),
    projectId: command.projectId,
    userId: command.userId,
    role: "user",
    content,
    assetIds: command.assetIds ?? [],
  });

  return { message, project };
}

export async function listVideoMessages(
  command: { userId: string; projectId: string },
  dependencies: MessageDependencies,
): Promise<MessageResponse[]> {
  // The ownership check is here rather than in the query: a project the caller does not own must
  // read as not found, not as an empty conversation.
  await requireActiveProject(command.projectId, command.userId, dependencies);

  const messages = await dependencies.messages.listOwned(command.projectId, command.userId);
  return messages.map(toMessageResponse);
}

export type MessageResponse = {
  id: string;
  role: VideoMessage["role"];
  content: string;
  assetIds: string[];
  controls: unknown;
  createdAt: string;
};

/** The only shape a message is allowed to leave the backend in: no user id, no project id. */
export function toMessageResponse(message: VideoMessage): MessageResponse {
  return {
    id: message.id,
    role: message.role,
    content: message.content,
    assetIds: message.assetIds,
    controls: message.controls,
    createdAt: message.createdAt,
  };
}

/**
 * The conditional update only matches while the project is still a draft, so a concurrent first
 * message wins instead of both writing the transition. The loser re-reads the project the winner
 * left behind and still reports success, because the interview has started either way.
 */
async function enterInterviewing(project: VideoProject, userId: string, dependencies: MessageDependencies): Promise<VideoProject> {
  const transitioned = await dependencies.projects.transition(project.id, userId, "draft", "interviewing");
  if (transitioned) return transitioned;

  const current = await dependencies.projects.getOwned(project.id, userId);
  if (!current) throw projectNotFound();
  // A re-read that still reports `draft` means the winning write landed after this read; the
  // project is no longer a draft from this request's point of view.
  return current.status === "draft" ? { ...current, status: "interviewing" } : current;
}

async function requireActiveProject(projectId: string, userId: string, dependencies: MessageDependencies): Promise<VideoProject> {
  const project = await dependencies.projects.getOwned(projectId, userId);
  if (!project || project.status === "deleted") throw projectNotFound();
  return project;
}

function invalidInput(message: string): VideoError {
  return new VideoError("video_input_invalid", message);
}

function projectNotFound(): VideoError {
  return new VideoError("video_project_not_found", "The video project was not found.");
}

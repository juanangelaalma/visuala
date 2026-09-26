import { AIError } from "../../domain/ai-service/errors";
import type { VideoConversationDependencies } from "./conversation";
import type { VideoMessage } from "../../domain/video/types";
import type { VideoProjectRepository } from "../../domain/video/contracts";
import { VideoError } from "../../domain/video/errors";
import { runInterviewer } from "./interviewer";

type OpeningDependencies = Omit<Pick<VideoConversationDependencies, "projects" | "messages" | "assets" | "ai" | "createId">, "projects"> & {
  projects: Pick<VideoProjectRepository, "getOwned">;
};

export async function openVideoInterview(
  command: { userId: string; projectId: string },
  dependencies: OpeningDependencies,
): Promise<VideoMessage[]> {
  const project = await dependencies.projects.getOwned(command.projectId, command.userId);
  if (!project || project.status === "deleted") throw new VideoError("video_project_not_found", "The video project was not found.");

  const transcript = await dependencies.messages.listOwned(project.id, command.userId);
  if (transcript.length > 0 || (project.status !== "draft" && project.status !== "interviewing")) return transcript;

  const assets = await dependencies.assets.listOwned(project.id, command.userId);
  const result = await runInterviewer(
    { userId: command.userId, project, transcript: [{
      id: project.id, projectId: project.id, userId: command.userId, role: "user",
      content: "Begin the interview. No product facts have been provided yet.",
      controls: null, assetIds: [], createdAt: "",
    }], draft: null, assetCount: assets.length },
    { ai: dependencies.ai, createRequestId: dependencies.createId },
  );
  if (!result.turn || result.turn.briefComplete) {
    throw new AIError({ code: "AI_INVALID_OUTPUT", safeMessage: "AI provider returned invalid output.", requestId: result.generatedBy.requestId, retryable: false });
  }

  const latest = await dependencies.messages.listOwned(project.id, command.userId);
  if (latest.length > 0) return latest;

  try {
    const opening = await dependencies.messages.append({
      id: project.id, projectId: project.id, userId: command.userId, role: "assistant",
      content: result.turn.question, controls: result.turn,
    });
    return [opening];
  } catch (error) {
    if (!isDuplicateMessage(error)) throw error;
    const winner = await dependencies.messages.listOwned(project.id, command.userId);
    if (winner.length === 0) throw error;
    return winner;
  }
}

function isDuplicateMessage(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "23505";
}

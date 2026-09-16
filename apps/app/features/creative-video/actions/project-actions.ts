"use server";

import { AssetCleanupError, createCreativeProject } from "@/application/creative-video/create-project";
import { answerCreativeVideoClarification } from "@/application/creative-video/answer-clarification";
import { createCreativeVideoServices } from "@/application/creative-video/services";
import { ProjectRevisionConflictError } from "@/domain/creative-video/errors";
import type { CreativeProjectState } from "@/domain/creative-video/types";
import { answerClarificationSchema, createProjectSchema } from "../schemas/project-schema";

export type CreativeVideoActionState = {
  projectId?: string;
  revision?: number;
  state?: CreativeProjectState;
  error?: string;
  message?: string;
  cleanupOperationId?: string;
  refreshRequired?: boolean;
};

export async function createCreativeProjectAction(
  _: CreativeVideoActionState,
  formData: FormData,
): Promise<CreativeVideoActionState> {
  const parsed = createProjectSchema.safeParse({ ...Object.fromEntries(formData), image: formData.get("image") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid project request." };

  try {
    return await createAuthenticatedProject(parsed.data);
  } catch (error) {
    if (error instanceof AssetCleanupError) {
      console.error("Failed to create creative video project", { name: error.name, ...error.context });
      return { error: `Project creation needs cleanup. Contact support with reference ${error.context.cleanupOperationId}.`, cleanupOperationId: error.context.cleanupOperationId };
    }
    console.error("Failed to create creative video project", { name: error instanceof Error ? error.name : "UnknownError" });
    return { error: "Could not create the project." };
  }
}

export async function answerCreativeVideoAction(
  _: CreativeVideoActionState,
  formData: FormData,
): Promise<CreativeVideoActionState> {
  try {
    const services = await createCreativeVideoServices();
    const user = await services.authProvider.getCurrentUser();
    if (!user) return { error: "Sign in to continue." };
    const parsed = answerClarificationSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid project request." };
    return await answerAuthenticatedClarification(services, user.id, parsed.data);
  } catch (error) {
    if (error instanceof ProjectRevisionConflictError) return { error: error.safeMessage, refreshRequired: true };
    console.error("Failed to answer creative video clarification", { name: error instanceof Error ? error.name : "UnknownError" });
    return { error: "Could not save the answer." };
  }
}

async function createAuthenticatedProject(input: typeof createProjectSchema._output): Promise<CreativeVideoActionState> {
  const services = await createCreativeVideoServices();
  const user = await services.authProvider.getCurrentUser();
  if (!user) return { error: "Sign in to continue." };
  const aggregate = await createCreativeProject(services.creation, {
    userId: user.id,
    prompt: input.prompt,
    image: input.image,
    idempotencyKey: input.idempotencyKey,
    category: { id: input.categoryId, version: input.categoryVersion },
  });
  return { projectId: aggregate.project.id, revision: aggregate.project.revision, state: aggregate.project.state, message: "Project created." };
}

async function answerAuthenticatedClarification(services: Awaited<ReturnType<typeof createCreativeVideoServices>>, userId: string, input: typeof answerClarificationSchema._output): Promise<CreativeVideoActionState> {
  const result = await answerCreativeVideoClarification(services.clarification, { ...input, userId });
  return { projectId: input.projectId, revision: result.revision, state: result.state === "concept_generation_started" ? "analyzing" : result.state, message: result.duplicate ? "Answer already saved." : "Answer saved." };
}

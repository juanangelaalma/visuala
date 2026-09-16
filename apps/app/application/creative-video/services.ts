import "server-only";

import { createAuthServices } from "@/application/auth/services";
import { createAIService, createOwnedAssetRegistration, createOwnedAssetResolver } from "@/infrastructure/ai-service/create-ai-service";
import { AIServiceBriefInterpreter } from "@/infrastructure/creative-video/ai-service-brief-interpreter";
import { AIServiceConceptPlanner } from "@/infrastructure/creative-video/ai-service-concept-planner";
import { generateCreativeConcepts } from "./generate-concepts";
import { analyzeCreativeProject, type ConceptGenerationBoundary } from "./analyze-project";
import { SupabaseCreativeVideoRepository } from "@/infrastructure/creative-video/supabase-creative-video-repository";
import { createCreativeVideoPluginRegistry } from "@/infrastructure/creative-video/plugins/create-plugin-registry";
import { createSupabaseServerClient } from "@/infrastructure/supabase/server-client";

export async function createCreativeVideoServices() {
  const [supabase, auth] = await Promise.all([createSupabaseServerClient(), createAuthServices()]);
  const projects = new SupabaseCreativeVideoRepository(supabase);
  const plugins = createCreativeVideoPluginRegistry();
  const createId = () => crypto.randomUUID();
  const now = () => new Date();
  const ai = createAIService();
  const concepts: ConceptGenerationBoundary = {
    generate: async ({ project, brief }) => {
      await generateCreativeConcepts({ projects, planner: new AIServiceConceptPlanner(ai, plugins), createId, now }, { project, brief, requestId: createId() });
    },
  };
  const analysis = { projects, interpreter: new AIServiceBriefInterpreter(ai, plugins), concepts, createId, now };
  return {
    authProvider: auth.authProvider,
    projects,
    projectAssets: createOwnedAssetResolver(),
    creation: {
      projects,
      assets: createOwnedAssetRegistration(),
      plugins,
      createId,
      createCleanupOperationId: () => crypto.randomUUID(),
      now,
      analyze: (input: { userId: string; projectId: string; sourceRevision: number; requestId: string }) => analyzeCreativeProject(analysis, input).then(() => undefined),
    },
    clarification: analysis,
  };
}

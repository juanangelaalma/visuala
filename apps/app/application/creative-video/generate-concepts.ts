import type { ConceptPlanner } from "@/domain/creative-video/concept-planner";
import type { CreativeVideoRepository } from "@/domain/creative-video/contracts";
import { ProjectRevisionConflictError } from "@/domain/creative-video/errors";
import type { BriefSnapshot, Concept, CreativeProject } from "@/domain/creative-video/types";

export type GenerateCreativeConceptsDependencies = {
  projects: Pick<CreativeVideoRepository, "applyConceptGeneration">;
  planner: ConceptPlanner;
  createId(): string;
  now(): Date;
};

export type GenerateCreativeConceptsInput = {
  project: CreativeProject;
  brief: BriefSnapshot;
  requestId: string;
};

export async function generateCreativeConcepts(dependencies: GenerateCreativeConceptsDependencies, input: GenerateCreativeConceptsInput) {
  const planning = await dependencies.planner.generateConcepts({ requestId: input.requestId, userId: input.project.userId, projectId: input.project.id, category: input.project.category, brief: input.brief });
  const concepts = planning.concepts.map((concept, index) => ({ ...concept, id: dependencies.createId(), projectId: input.project.id, briefSnapshotId: input.brief.id, order: index + 1, generation: planning.generation, createdAt: dependencies.now().toISOString() })) as readonly Concept[];
  try {
    const project = await dependencies.projects.applyConceptGeneration({ concepts, userId: input.project.userId, expectedRevision: input.project.revision, sourceBriefRevision: input.brief.sourceProjectRevision });
    return { status: "completed" as const, project, concepts };
  } catch (error) {
    if (error instanceof ProjectRevisionConflictError) return { status: "stale" as const };
    throw error;
  }
}

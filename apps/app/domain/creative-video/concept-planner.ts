import type { BriefSnapshot, ConceptGenerationMetadata, VersionRef } from "./types";

export type PlannedConcept = {
  id: string;
  title: string;
  hook: string;
  angle: string;
  sceneOutline: readonly [string, string, string, string];
  fitReason: string;
  recommendationReason: string;
  recommended: boolean;
};

export type ConceptPlannerInput = {
  requestId: string;
  userId: string;
  projectId: string;
  category: VersionRef;
  brief: BriefSnapshot;
};

export type ConceptPlanningResult = {
  concepts: readonly [PlannedConcept, PlannedConcept, PlannedConcept];
  generation: ConceptGenerationMetadata;
};

export interface ConceptPlanner {
  generateConcepts(input: ConceptPlannerInput): Promise<ConceptPlanningResult>;
}

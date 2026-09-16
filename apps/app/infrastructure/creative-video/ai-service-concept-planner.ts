import type { AIService } from "@/domain/ai-service/contracts";
import type { ConceptPlanner, ConceptPlannerInput, ConceptPlanningResult } from "@/domain/creative-video/concept-planner";
import type { PluginRegistry } from "@/domain/creative-video/plugin-registry";

export class AIServiceConceptPlanner implements ConceptPlanner {
  constructor(private readonly ai: AIService, private readonly plugins: Pick<PluginRegistry, "resolveCategory">) {}

  async generateConcepts(input: ConceptPlannerInput): Promise<ConceptPlanningResult> {
    const plugin = this.plugins.resolveCategory(input.category);
    const result = await this.ai.generateStructured({
      requestId: input.requestId,
      task: "planner",
      context: { userId: input.userId, projectId: input.projectId },
      instructions: plugin.plan.plannerInstructions,
      messages: [{ role: "user", content: JSON.stringify(input.brief) }],
      promptVersion: plugin.plan.plannerPromptVersion,
      schema: { name: `${plugin.ref.id}-concept-set`, version: plugin.plan.schemaVersion, schema: plugin.plan.schema },
    });
    const parsed = plugin.plan.schema.parse(result.data);
    if (!isConceptSet(parsed)) throw new Error("Concept plugin returned an invalid concept set.");
    return { concepts: parsed.concepts, generation: { requestId: result.requestId, promptVersion: plugin.plan.plannerPromptVersion, model: result.model } };
  }
}

function isConceptSet(value: unknown): value is { concepts: ConceptPlanningResult["concepts"] } {
  return typeof value === "object" && value !== null && "concepts" in value && Array.isArray(value.concepts) && value.concepts.length === 3;
}

import type { AIService } from "@/domain/ai-service/contracts";
import type { BriefInterpreter, BriefInterpreterInput, BriefInterpretation } from "@/domain/creative-video/brief-interpreter";
import type { BriefAnalysis } from "@/domain/creative-video/brief-interpreter";
import { z } from "zod";
import type { PluginRegistry } from "@/domain/creative-video/plugin-registry";

export class AIServiceBriefInterpreter implements BriefInterpreter {
  constructor(private readonly ai: AIService, private readonly plugins: Pick<PluginRegistry, "resolveCategory">) {}

  async interpret(input: BriefInterpreterInput): Promise<BriefInterpretation> {
    const plugin = this.plugins.resolveCategory(input.category);
    const result = await this.ai.generateStructured({
      requestId: input.requestId,
      task: "interviewer",
      context: { userId: input.userId, projectId: input.projectId },
      instructions: buildInterviewerInstructions(plugin.brief.interviewerInstructions, input),
      messages: input.messages.map(({ role, text, assetId }) => ({ role, content: text, ...(assetId ? { assetId } : {}) })),
      promptVersion: plugin.brief.interviewerPromptVersion,
      schema: { name: `${plugin.ref.id}-brief-analysis`, version: plugin.brief.schemaVersion, schema: plugin.brief.schema },
    });
    return {
      analysis: requireBriefAnalysis(plugin.brief.postValidate(result.data, input.messages.filter(({ role }) => role === "user").map(({ text }) => text))),
      generation: { requestId: result.requestId, promptVersion: plugin.brief.interviewerPromptVersion, model: result.model },
      schemaVersion: plugin.brief.schemaVersion,
    };
  }
}

function requireBriefAnalysis(value: unknown): BriefAnalysis {
  const result = briefAnalysisSchema.safeParse(value);
  if (!result.success) throw new Error("Category brief policy returned invalid data.");
  return result.data;
}

const briefAnalysisSchema: z.ZodType<BriefAnalysis> = z.object({
  goal: z.string(),
  product: z.object({ name: z.string().nullable(), category: z.string(), confidence: z.number() }),
  facts: z.array(z.object({ factKey: z.string(), value: z.unknown(), provenance: z.enum(["user", "visual_observation", "assumption"]) })),
  assumptions: z.array(z.string()),
  missingRequired: z.array(z.object({ factKey: z.string(), question: z.string() })),
  optionalQuestions: z.array(z.object({ factKey: z.string(), question: z.string() })),
  sufficient: z.boolean(),
});

function buildInterviewerInstructions(instructions: string, input: BriefInterpreterInput): string {
  if (!input.previousBrief) return instructions;
  return `${instructions}\n\nExisting brief facts:\n${JSON.stringify({ facts: input.previousBrief.facts, assumptions: input.previousBrief.assumptions })}`;
}

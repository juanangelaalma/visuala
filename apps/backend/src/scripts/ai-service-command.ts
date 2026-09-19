import { z } from "zod";
import type { AIConfigurationCheck } from "@/application/ai-service/services";
import type { AIService } from "@/domain/ai-service/contracts";
import type { GenerateStructuredRequest, GenerateTextRequest } from "@/domain/ai-service/types";

type FactoryOptions = { profileOverride?: string; schemas?: Readonly<Record<string, z.ZodType>> };

export type AIServiceCommandDependencies = {
  environment: Readonly<Record<string, string | undefined>>;
  createId: () => string;
  checkConfiguredAIService: (options?: FactoryOptions) => AIConfigurationCheck;
  createAIService: (options?: FactoryOptions) => AIService;
  log: (message: string) => void;
  warn: (message: string) => void;
};

export async function runAIServiceCommand(args: readonly string[], dependencies: AIServiceCommandDependencies): Promise<void> {
  const command = args[0];
  const profileOverride = optionalArgument(args, "--profile");
  if (profileOverride && !command?.startsWith("smoke:")) throw new Error("--profile is available only for smoke commands.");
  if (command === "check-config") return printConfigurationCheck(dependencies, profileOverride);
  if (command === "smoke:text") return runTextSmoke(dependencies, profileOverride);
  if (command === "smoke:structured") return runStructuredSmoke(dependencies, profileOverride);
  if (command === "smoke:vision") return runVisionSmoke(dependencies, profileOverride);
  throw new Error("Choose check-config, smoke:text, smoke:structured, or smoke:vision.");
}

function printConfigurationCheck(dependencies: AIServiceCommandDependencies, profileOverride?: string): void {
  const result = dependencies.checkConfiguredAIService({ profileOverride });
  dependencies.log(`AI configuration: ${result.status}`);
  result.profiles.forEach(({ id, provider, model }) => dependencies.log(`profile=${id} provider=${provider} model=${model ?? "unused"}`));
  result.tasks.forEach(({ task, profileId }) => dependencies.log(`task=${task} profile=${profileId}`));
}

async function runTextSmoke(dependencies: AIServiceCommandDependencies, profileOverride?: string): Promise<void> {
  warnPaidCall(dependencies);
  printSmokeResult(dependencies, await dependencies.createAIService({ profileOverride }).generateText(textRequest(dependencies)));
}

async function runStructuredSmoke(dependencies: AIServiceCommandDependencies, profileOverride?: string): Promise<void> {
  warnPaidCall(dependencies);
  const schema = z.object({ status: z.literal("ok") });
  const request: GenerateStructuredRequest<z.infer<typeof schema>> = {
    ...textRequest(dependencies),
    instructions: "Return the requested JSON object.",
    messages: [{ role: "user", content: "Return status set to ok." }],
    schema: { name: "smoke-result", version: "v1", schema },
  };
  const service = dependencies.createAIService({ profileOverride, schemas: { "smoke-result@v1": schema } });
  printSmokeResult(dependencies, await service.generateStructured(request));
}

async function runVisionSmoke(dependencies: AIServiceCommandDependencies, profileOverride?: string): Promise<void> {
  warnPaidCall(dependencies);
  const userId = requiredEnvironmentValue(dependencies, "AI_SMOKE_USER_ID");
  const assetId = requiredEnvironmentValue(dependencies, "AI_SMOKE_ASSET_ID");
  const request = textRequest(dependencies, { context: { userId }, messages: [{ role: "user", content: "Describe this image briefly.", assetId }] });
  printSmokeResult(dependencies, await dependencies.createAIService({ profileOverride }).generateText(request));
}

function textRequest(dependencies: AIServiceCommandDependencies, overrides: Partial<GenerateTextRequest> = {}): GenerateTextRequest {
  return {
    requestId: dependencies.createId(),
    task: "connection_test",
    context: { userId: requiredEnvironmentValue(dependencies, "AI_SMOKE_USER_ID") },
    instructions: "Answer briefly.",
    messages: [{ role: "user", content: "Reply with ok." }],
    promptVersion: "smoke-v1",
    ...overrides,
  };
}

function warnPaidCall(dependencies: AIServiceCommandDependencies): void {
  dependencies.warn("Warning: this smoke command sends a paid provider request and may consume tokens.");
}

function printSmokeResult(dependencies: AIServiceCommandDependencies, result: { requestId: string; profileId: string; provider: string; model: string }): void {
  dependencies.log(`status=success request=${result.requestId} profile=${result.profileId} provider=${result.provider} model=${result.model}`);
}

function optionalArgument(args: readonly string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
}

function requiredEnvironmentValue(dependencies: AIServiceCommandDependencies, name: string): string {
  const value = dependencies.environment[name]?.trim();
  if (!value) throw new Error(`${name} is required for this smoke command.`);
  return value;
}

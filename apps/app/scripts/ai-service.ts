import { AIError } from "../domain/ai-service/errors";
import { checkConfiguredAIService, createAIService } from "../infrastructure/ai-service/create-ai-service";
import { runAIServiceCommand } from "./ai-service-command";

void runAIServiceCommand(process.argv.slice(2), {
  environment: process.env,
  createId: () => crypto.randomUUID(),
  checkConfiguredAIService,
  createAIService,
  log: console.log,
  warn: console.warn,
}).catch(reportFailure);

function reportFailure(error: unknown): never {
  const code = error instanceof AIError ? error.code : "AI_CLI_ERROR";
  const message = error instanceof AIError ? error.safeMessage : error instanceof Error ? error.message : "AI command failed.";
  console.error(`${code}: ${message}`);
  process.exit(1);
}

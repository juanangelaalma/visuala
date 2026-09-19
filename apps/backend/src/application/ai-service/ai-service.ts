import type { ResolvedAIConfig } from "../../domain/ai-service/config";
import type { AIService, AssetResolver, ProviderAdapter, UsageRecorder } from "../../domain/ai-service/contracts";
import { AIError, diagnosticField, sanitizedDiagnostic } from "../../domain/ai-service/errors";
import type { AIAttemptUsage } from "../../domain/ai-service/usage";
import type { AIOperationOutcome, AIUsage, GenerateStructuredRequest, GenerateTextRequest, ProviderResultMetadata, StructuredResult, TextResult } from "../../domain/ai-service/types";
import { aggregateOperationUsage, calculateAttemptCost } from "./calculate-cost";
import { validateStructuredRequest, validateTextRequest } from "./validate-request";
import { ConcurrencyLimiter } from "./concurrency-limiter";

type Dependencies = {
  resolveConfig: (task: GenerateTextRequest["task"]) => ResolvedAIConfig;
  getAdapter: (config: ResolvedAIConfig) => ProviderAdapter;
  assetResolver: AssetResolver;
  usageRecorder: UsageRecorder;
  now: () => number;
  sleep: (milliseconds: number, signal?: AbortSignal) => Promise<void>;
  random: () => number;
  createId: () => string;
  maximumConcurrency?: number;
  limiter?: ConcurrencyLimiter;
  tightenLimiter?: (maximumConcurrency: number) => ConcurrencyLimiter;
  scheduler: TimerScheduler;
  recorderTimeoutMs?: number;
};

type TimerScheduler = {
  setTimeout(callback: () => void, milliseconds: number): unknown;
  clearTimeout(id: unknown): void;
};

type GenerateRequest = GenerateTextRequest | GenerateStructuredRequest<unknown>;
type ProviderOutput = ProviderResultMetadata & { text?: string; json?: string };
type AttemptResult<T> = { output: ProviderOutput; value: T; attempts: AIAttemptUsage[]; attemptCount: number };

export class DefaultAIService implements AIService {
  private readonly limiter: ConcurrencyLimiter;

  constructor(private readonly dependencies: Dependencies) {
    this.limiter = dependencies.limiter ?? new ConcurrencyLimiter(dependencies.maximumConcurrency ?? 1_000);
  }

  async generateText(request: GenerateTextRequest): Promise<TextResult> {
    return this.execute(request, async (adapterRequest, adapter) => adapter.generateText(adapterRequest), (output) => {
      requireSuccessfulOutput(output, request.requestId, output.text ?? "");
      return output.text ?? "";
    }, (metadata, value) => ({ ...metadata, text: value }));
  }

  async generateStructured<T>(request: GenerateStructuredRequest<T>): Promise<StructuredResult<T>> {
    return this.execute(request, async (adapterRequest, adapter) => adapter.generateStructured({ ...adapterRequest,
      schemaName: request.schema.name, schemaVersion: request.schema.version }), (output) => {
      requireSuccessfulOutput(output, request.requestId, output.json ?? "");
      return parseStructuredOutput(request, output.json ?? "");
    }, (metadata, value) => ({ ...metadata, data: value }));
  }

  private async execute<T, R>(request: GenerateRequest,
    invoke: (providerRequest: ProviderRequest, adapter: ProviderAdapter) => Promise<ProviderOutput>,
    validate: (output: ProviderOutput) => T,
    makeResult: (metadata: Omit<TextResult, "text">, value: T) => R): Promise<R> {
    const startedAt = this.dependencies.now();
    if (request.abortSignal?.aborted) throw cancelledError(request.requestId);
    const config = cloneConfig(this.dependencies.resolveConfig(request.task));
    await this.startOperation(request, config);
    let release: (() => void) | undefined;
    try {
      const validatedRequest = "schema" in request ? validateStructuredRequest(request, config) : validateTextRequest(request, config);
      const asset = await this.resolveAsset(validatedRequest, config);
      if (request.abortSignal?.aborted) throw cancelledError(request.requestId);
      release = await this.acquirePermit(validatedRequest, config, startedAt);
      const attempt = await this.runAttempts(validatedRequest, config, asset, startedAt, invoke, validate);
      const aggregate = aggregateOperationUsage(attempt.attempts, config.pricing);
      const metadata = resultMetadata(validatedRequest.requestId, config, attempt.output, aggregate, this.dependencies.now() - startedAt, attempt.attemptCount);
      await this.finalizeOperationSafely(request.requestId, outcomeFromSuccess(metadata, aggregate));
      return makeResult(metadata, attempt.value);
    } catch (error) {
      const failure = error instanceof AttemptFailure ? error : new AttemptFailure(normalizeError(error, request.requestId), 0, []);
      await this.finalizeOperationSafely(request.requestId, outcomeFromFailure(failure, config, this.dependencies.now() - startedAt));
      throw failure.error;
    } finally {
      release?.();
    }
  }

  private async acquirePermit(request: GenerateRequest, config: ResolvedAIConfig, startedAt: number): Promise<() => void> {
    const remaining = config.limits.totalDeadlineMs - (this.dependencies.now() - startedAt);
    const deadline = combinedSignal(request.abortSignal ?? new AbortController().signal, remaining, this.dependencies.scheduler);
    try {
      const limiter = this.dependencies.tightenLimiter?.(config.limits.maxConcurrency) ?? this.limiter;
      const release = await limiter.acquire(deadline.signal);
      if (this.dependencies.now() - startedAt >= config.limits.totalDeadlineMs) {
        release();
        throw timeoutError(request.requestId);
      }
      return release;
    } catch (error) {
      if (request.abortSignal?.aborted) throw cancelledError(request.requestId);
      if (deadline.timedOut()) throw timeoutError(request.requestId);
      throw error;
    } finally {
      deadline.cleanup();
    }
  }

  private async runAttempts<T>(request: GenerateRequest, config: ResolvedAIConfig,
    asset: Awaited<ReturnType<AssetResolver["resolve"]>> | undefined, startedAt: number,
    invoke: (providerRequest: ProviderRequest, adapter: ProviderAdapter) => Promise<ProviderOutput>,
    validate: (output: ProviderOutput) => T): Promise<AttemptResult<T>> {
    const attempts: AIAttemptUsage[] = [];
    const signal = request.abortSignal ?? new AbortController().signal;
    for (let attemptNumber = 1; attemptNumber <= config.limits.maxAttempts; attemptNumber += 1) {
      const remaining = config.limits.totalDeadlineMs - (this.dependencies.now() - startedAt);
      const executionBudget = Math.min(config.limits.attemptTimeoutMs, remaining);
      if (executionBudget <= 0) throw new AttemptFailure(timeoutError(request.requestId), attemptNumber - 1, attempts);
      const attemptId = this.dependencies.createId();
      try {
        await this.dependencies.usageRecorder.startAttempt({ requestId: request.requestId, attemptId, attemptNumber,
          profileId: config.profileId, provider: config.provider, model: config.modelId });
      } catch {
        throw new AttemptFailure(unavailableError(request.requestId), attemptNumber - 1, attempts);
      }
      const attemptStartedAt = this.dependencies.now();
      const attemptSignal = combinedSignal(signal, executionBudget, this.dependencies.scheduler);
      try {
        const output = await invoke(providerRequest(request, asset, attemptId, attemptNumber, attemptSignal.signal),
          this.dependencies.getAdapter(cloneConfig(config)));
        const usage = attemptUsage(output, false);
        const value = validate(output);
        attempts.push(usage);
        await this.finalizeAttempt(attemptId, output, attemptStartedAt, null, "rejected", false, config);
        return { output, value, attempts, attemptCount: attemptNumber };
      } catch (error) {
        const normalized = signal.aborted ? cancelledError(request.requestId)
          : attemptSignal.timedOut() ? timeoutError(request.requestId) : normalizeError(error, request.requestId);
        const billingUnknown = normalized.dispatchOutcome === "ambiguous";
        const provider = error instanceof OutputValidationError ? error.provider : errorMetadata(normalized, config);
        if (!(error instanceof OutputValidationError) || attempts.length < attemptNumber) {
          attempts.push(billingUnknown ? unknownAttemptUsage() : attemptUsage(provider, false));
        }
        await this.finalizeAttempt(attemptId, provider, attemptStartedAt, normalized.code, normalized.dispatchOutcome, billingUnknown, config);
        if (!this.canRetry(normalized, attemptNumber, config)) throw new AttemptFailure(normalized, attemptNumber, attempts);
        const delay = retryDelay(normalized, attemptNumber, this.dependencies.random());
        const remainingAfterDelay = config.limits.totalDeadlineMs - (this.dependencies.now() - startedAt + delay);
        if (remainingAfterDelay < config.limits.attemptTimeoutMs) {
          throw new AttemptFailure(timeoutError(request.requestId), attemptNumber, attempts);
        }
        try {
          await this.dependencies.sleep(delay, signal);
        } catch {
          if (signal.aborted) throw new AttemptFailure(cancelledError(request.requestId), attemptNumber, attempts);
          throw new AttemptFailure(unavailableError(request.requestId), attemptNumber, attempts);
        }
      } finally {
        attemptSignal.cleanup();
      }
    }
    throw new AttemptFailure(unavailableError(request.requestId), config.limits.maxAttempts, attempts);
  }

  private canRetry(error: AIError, attemptNumber: number, config: ResolvedAIConfig): boolean {
    return (error.code === "AI_RATE_LIMITED" || error.code === "AI_UNAVAILABLE") && error.retryable
      && error.dispatchOutcome === "rejected" && attemptNumber < config.limits.maxAttempts;
  }

  private async startOperation(request: GenerateRequest, config: ResolvedAIConfig): Promise<void> {
    try {
      await this.dependencies.usageRecorder.startOperation({ requestId: request.requestId, task: request.task,
        userId: request.context.userId, projectId: request.context.projectId, promptVersion: request.promptVersion,
        profileId: config.profileId, provider: config.provider, model: config.modelId,
        ...( "schema" in request ? { schemaName: request.schema.name, schemaVersion: request.schema.version } : {}) });
    } catch {
      throw unavailableError(request.requestId);
    }
  }

  private async resolveAsset(request: GenerateTextRequest, config: ResolvedAIConfig) {
    const assetId = request.messages.find((message) => message.assetId)?.assetId;
    const { maxImageBytes, maxImageWidth, maxImageHeight } = config.limits;
    return assetId ? this.dependencies.assetResolver.resolve(assetId, request.context.userId,
      { maxImageBytes, maxImageWidth, maxImageHeight }) : undefined;
  }

  private async finalizeAttempt(attemptId: string, provider: ProviderResultMetadata, startedAt: number,
    errorCode: AIError["code"] | null, dispatchOutcome: AIError["dispatchOutcome"], billingUnknown: boolean,
    config: ResolvedAIConfig): Promise<void> {
    const attempt = billingUnknown ? unknownAttemptUsage() : attemptUsage(provider, false);
    const estimatedCost = calculateAttemptCost(attempt, config.pricing);
    try {
      await this.boundedRecorderCall(this.dependencies.usageRecorder.finalizeAttempt(attemptId, { providerRequestId: provider.providerRequestId,
        latencyMs: this.dependencies.now() - startedAt, usage: attempt,
        errorCode, dispatchOutcome, usageUnknown: billingUnknown, billingUnknown,
        estimatedCost, costComplete: estimatedCost !== null }));
    } catch {
      void this.recordFailureDiagnostic("attempt", attemptId, errorCode ?? undefined);
    }
  }

  private async finalizeOperationSafely(requestId: string, outcome: AIOperationOutcome): Promise<void> {
    try {
      await this.boundedRecorderCall(this.dependencies.usageRecorder.finalizeOperation(requestId, outcome));
    } catch {
      void this.recordFailureDiagnostic("operation", requestId, outcome.errorCode ?? undefined);
    }
  }

  private async recordFailureDiagnostic(kind: "attempt" | "operation", requestId: string, code?: AIError["code"]): Promise<void> {
    try {
      await this.boundedRecorderCall(this.dependencies.usageRecorder.recordDiagnostic(requestId,
        sanitizedDiagnostic(`ai_${kind}_finalize_failed`, diagnosticField("code", "recording_failed")), code));
    } catch {}
  }

  private async boundedRecorderCall(call: Promise<void>): Promise<void> {
    const timeout = scheduledRejection(this.dependencies.recorderTimeoutMs ?? 1_000, this.dependencies.scheduler);
    try {
      await Promise.race([call, timeout.promise]);
    } finally {
      timeout.cleanup();
    }
  }
}

type ProviderRequest = Parameters<ProviderAdapter["generateText"]>[0];

class AttemptFailure extends Error {
  constructor(readonly error: AIError, readonly attemptCount: number, readonly attempts: AIAttemptUsage[]) {
    super(error.safeMessage);
  }
}

function providerRequest(request: GenerateTextRequest, asset: Awaited<ReturnType<AssetResolver["resolve"]>> | undefined,
  attemptId: string, attemptNumber: number, signal: AbortSignal): ProviderRequest {
  return { requestId: request.requestId, instructions: request.instructions, messages: request.messages, asset,
    attempt: { attemptId, attemptNumber, signal } };
}

function cloneConfig(config: ResolvedAIConfig): ResolvedAIConfig {
  const snapshot = { ...config, capabilities: Object.freeze({ ...config.capabilities }), limits: Object.freeze({ ...config.limits }),
    ...(config.pricing ? { pricing: Object.freeze({ ...config.pricing }) } : {}) };
  return Object.freeze(snapshot);
}

function retryDelay(error: AIError, attemptNumber: number, random: number): number {
  if (error.retryAfterMs !== undefined) return Math.max(0, Math.min(error.retryAfterMs, 30_000));
  return Math.floor(Math.min(1_000 * 2 ** (attemptNumber - 1), 30_000) * random);
}

function requireSuccessfulOutput(result: ProviderResultMetadata, requestId: string, output: string): void {
  if (result.finishReason === "refusal") throw new OutputValidationError(
    serviceError("AI_REFUSED", "AI provider refused the request.", requestId), result);
  if (result.finishReason !== "stop" || !output.trim()) throw new OutputValidationError(invalidOutputError(requestId), result);
}

function parseStructuredOutput<T>(request: GenerateStructuredRequest<T>, json: string): T {
  try {
    return request.schema.schema.parse(JSON.parse(json));
  } catch (error) {
    if (error instanceof OutputValidationError) throw error;
    throw invalidOutputError(request.requestId);
  }
}

function resultMetadata(requestId: string, config: ResolvedAIConfig, provider: ProviderResultMetadata,
  aggregate: ReturnType<typeof aggregateOperationUsage>, latencyMs: number, attemptCount: number): Omit<TextResult, "text"> {
  return { requestId, profileId: config.profileId, provider: config.provider, model: provider.model,
    providerRequestId: provider.providerRequestId, attemptCount, finishReason: provider.finishReason,
    usage: usageFromAggregate(aggregate), estimatedCost: aggregate.estimatedCost, latencyMs };
}

function attemptUsage(provider: ProviderResultMetadata, billingUnknown: boolean): AIAttemptUsage {
  return { ...provider.usage, cachedInputTokens: null, reasoningTokens: null, imageCount: null, billingUnknown };
}

function unknownAttemptUsage(): AIAttemptUsage {
  return { ...unknownUsage(), cachedInputTokens: null, reasoningTokens: null, imageCount: null, billingUnknown: true };
}

function outcomeFromSuccess(result: Omit<TextResult, "text">, aggregate: ReturnType<typeof aggregateOperationUsage>): AIOperationOutcome {
  return { latencyMs: result.latencyMs, attemptCount: result.attemptCount, finishReason: result.finishReason,
    usage: result.usage, estimatedCost: aggregate.estimatedCost, costComplete: aggregate.costComplete, errorCode: null };
}

function outcomeFromFailure(failure: AttemptFailure, config: ResolvedAIConfig, latencyMs: number): AIOperationOutcome {
  const aggregate = aggregateOperationUsage(failure.attempts, config.pricing);
  return { latencyMs, attemptCount: failure.attemptCount, finishReason: null, usage: usageFromAggregate(aggregate),
    estimatedCost: aggregate.estimatedCost, costComplete: aggregate.costComplete, errorCode: failure.error.code };
}

function usageFromAggregate(usage: ReturnType<typeof aggregateOperationUsage>): AIUsage {
  return { inputTokens: usage.inputTokens, outputTokens: usage.outputTokens, totalTokens: usage.totalTokens };
}

function errorMetadata(error: AIError, config: ResolvedAIConfig): ProviderResultMetadata {
  return { providerRequestId: error.providerRequestId ?? null, model: config.modelId, finishReason: "unknown", usage: unknownUsage() };
}

function unknownUsage(): AIUsage { return { inputTokens: null, outputTokens: null, totalTokens: null }; }

function normalizeError(error: unknown, requestId: string): AIError {
  if (error instanceof OutputValidationError) return error.error;
  if (error instanceof DOMException && error.name === "AbortError") return cancelledError(requestId);
  return error instanceof AIError ? error : unavailableError(requestId);
}

class OutputValidationError extends Error {
  constructor(readonly error: AIError, readonly provider: ProviderResultMetadata) {
    super(error.safeMessage);
  }
}

function invalidOutputError(requestId: string): AIError {
  return serviceError("AI_INVALID_OUTPUT", "AI provider returned invalid output.", requestId);
}

function unavailableError(requestId: string): AIError {
  return serviceError("AI_UNAVAILABLE", "AI service is unavailable.", requestId);
}

function timeoutError(requestId: string): AIError {
  return serviceError("AI_TIMEOUT", "AI request timed out.", requestId);
}

function cancelledError(requestId: string): AIError {
  return serviceError("AI_CANCELLED", "AI request was cancelled.", requestId);
}

function serviceError(code: AIError["code"], safeMessage: string, requestId: string): AIError {
  return new AIError({ code, safeMessage, requestId, retryable: false });
}

function combinedSignal(external: AbortSignal, milliseconds: number, scheduler: TimerScheduler) {
  const controller = new AbortController();
  let timedOut = false;
  const abortFromExternal = () => controller.abort(external.reason);
  external.addEventListener("abort", abortFromExternal, { once: true });
  const timer = scheduler.setTimeout(() => {
    timedOut = true;
    controller.abort(new DOMException("The operation timed out.", "TimeoutError"));
  }, milliseconds);
  if (external.aborted) abortFromExternal();
  return { signal: controller.signal, timedOut: () => timedOut, cleanup: () => {
    scheduler.clearTimeout(timer);
    external.removeEventListener("abort", abortFromExternal);
  } };
}

function scheduledRejection(milliseconds: number, scheduler: TimerScheduler) {
  let timer: unknown;
  const promise = new Promise<never>((_resolve, reject) => {
    timer = scheduler.setTimeout(() => reject(new Error("Recorder timed out.")), milliseconds);
  });
  return { promise, cleanup: () => scheduler.clearTimeout(timer) };
}

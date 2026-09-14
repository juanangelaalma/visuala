import { z } from "zod";
import { describe, expect, it, vi } from "vitest";
import type { ResolvedAIConfig } from "../../domain/ai-service/config";
import type { AssetResolver, ProviderAdapter, UsageRecorder } from "../../domain/ai-service/contracts";
import { AIError } from "../../domain/ai-service/errors";
import type { GenerateStructuredRequest, GenerateTextRequest, ProviderTextResult } from "../../domain/ai-service/types";
import { DefaultAIService } from "./ai-service";

const config: ResolvedAIConfig = {
  profileId: "primary", apiFormat: "google", baseUrl: "https://example.com/", apiKey: "secret",
  modelId: "configured-model", provider: "google",
  capabilities: { text: true, vision: true, nativeStructuredOutput: true },
  limits: { maxInputCharacters: 1_000, maxOutputTokens: 100, maxImages: 1, maxImageBytes: 1_000,
    maxImageWidth: 1_000, maxImageHeight: 1_000, maxConcurrency: 2, attemptTimeoutMs: 1_000,
    totalDeadlineMs: 5_000, maxAttempts: 2 },
  pricing: { pricingVersion: "v1", source: "published", currency: "USD", inputPerMillionTokens: 1, outputPerMillionTokens: 2 },
};

describe("DefaultAIService success and output", () => {
  it("returns text success metadata and records the durable operation before adapter invocation", async () => {
    const fixture = makeFixture();
    const result = await fixture.service.generateText(textRequest());
    expect(result).toEqual({ requestId: "request-1", profileId: "primary", provider: "google", model: "actual-model",
      providerRequestId: "provider-1", attemptCount: 1, finishReason: "stop",
      usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
      estimatedCost: { amount: 0.00002, currency: "USD", pricingVersion: "v1", source: "published" },
      latencyMs: 25, text: "answer" });
    expect(fixture.events.slice(0, 3)).toEqual(["operation:start", "attempt:start:1", "adapter:text:1"]);
    expect(fixture.operationRecords[0]).toMatchObject({ profileId: "primary", provider: "google", model: "configured-model" });
  });

  it("persists the resolved snapshot before reporting a pre-attempt validation failure", async () => {
    const fixture = makeFixture();

    await expect(fixture.service.generateText(textRequest({ messages: [] }))).rejects.toMatchObject({ code: "AI_INPUT_INVALID" });

    expect(fixture.operationRecords[0]).toMatchObject({ profileId: "primary", provider: "google", model: "configured-model" });
    expect(fixture.operationOutcomes[0]).toMatchObject({ attemptCount: 0, errorCode: "AI_INPUT_INVALID" });
  });

  it("resolves one asset before all attempts", async () => {
    const fixture = makeFixture();
    await fixture.service.generateText(textRequest({ messages: [{ role: "user", content: "look", assetId: "asset-1" }] }));
    expect(fixture.resolveAsset).toHaveBeenCalledOnce();
    expect(fixture.events.indexOf("asset:resolve")).toBeLessThan(fixture.events.indexOf("adapter:text:1"));
    expect(fixture.resolveAsset).toHaveBeenCalledWith("asset-1", "user-1", {
      maxImageBytes: 1_000, maxImageWidth: 1_000, maxImageHeight: 1_000,
    });
  });

  it("parses and validates structured JSON without a repair call", async () => {
    const fixture = makeFixture({ structuredJson: '{"answer":"yes"}' });
    const result = await fixture.service.generateStructured(structuredRequest());
    expect(result.data).toEqual({ answer: "yes" });
    expect(fixture.generateStructured).toHaveBeenCalledOnce();
    expect(fixture.generateText).not.toHaveBeenCalled();
  });

  it.each([
    ["refusal", { finishReason: "refusal", text: "no" }, "AI_REFUSED"],
    ["truncated", { finishReason: "length", text: "partial" }, "AI_INVALID_OUTPUT"],
    ["empty output", { finishReason: "stop", text: "" }, "AI_INVALID_OUTPUT"],
  ] as const)("rejects %s output", async (_name, result, code) => {
    const fixture = makeFixture({ textResult: result });
    await expect(fixture.service.generateText(textRequest())).rejects.toMatchObject({ code });
  });

  it.each([
    ["invalid JSON", "{"],
    ["schema mismatch", '{"answer":3}'],
  ])("rejects %s structured output without repair", async (_name, structuredJson) => {
    const fixture = makeFixture({ structuredJson });
    await expect(fixture.service.generateStructured(structuredRequest())).rejects.toMatchObject({ code: "AI_INVALID_OUTPUT" });
    expect(fixture.generateStructured).toHaveBeenCalledOnce();
  });

  it("does not call the adapter when operation-start persistence fails", async () => {
    const fixture = makeFixture({ startOperationError: new Error("db secret") });
    await expect(fixture.service.generateText(textRequest())).rejects.toMatchObject({ code: "AI_UNAVAILABLE" });
    expect(fixture.generateText).not.toHaveBeenCalled();
  });

  it("preserves success when final recording fails and emits a sanitized diagnostic", async () => {
    const fixture = makeFixture({ finalizeOperationError: new Error("database secret") });
    await expect(fixture.service.generateText(textRequest())).resolves.toMatchObject({ text: "answer" });
    expect(fixture.recordDiagnostic).toHaveBeenCalledWith("request-1", { event: "ai_operation_finalize_failed", fields: { code: "recording_failed" } }, undefined);
  });

  it("records invalid provider output as the failed first attempt with known usage and cost", async () => {
    const fixture = makeFixture({ textResult: { finishReason: "refusal" } });

    await expect(fixture.service.generateText(textRequest())).rejects.toMatchObject({ code: "AI_REFUSED" });

    expect(fixture.attemptOutcomes[0]).toMatchObject({ errorCode: "AI_REFUSED", usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 } });
    expect(fixture.operationOutcomes[0]).toMatchObject({ attemptCount: 1, errorCode: "AI_REFUSED",
      usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 }, estimatedCost: { amount: 0.00002 } });
  });

  it("fails closed when attempt-start persistence fails", async () => {
    const fixture = makeFixture({ startAttemptError: new Error("database unavailable") });

    await expect(fixture.service.generateText(textRequest())).rejects.toMatchObject({ code: "AI_UNAVAILABLE" });

    expect(fixture.generateText).not.toHaveBeenCalled();
  });

  it("preserves success when final recorders hang", async () => {
    const fixture = makeFixture({ hangFinalizers: true });

    const promise = fixture.service.generateText(textRequest());
    for (let index = 0; index < 4; index += 1) {
      await fixture.waitForPendingTimer();
      fixture.scheduler.advanceBy(100);
      await fixture.flush(5);
    }

    await expect(promise).resolves.toMatchObject({ text: "answer" });
    expect(fixture.scheduler.pendingCount()).toBe(0);
  });
});

describe("DefaultAIService retry and deadline", () => {
  it("retries one explicitly rejected transient failure with the same profile snapshot", async () => {
    const firstConfig = structuredClone(config);
    const changedConfig = { ...structuredClone(config), profileId: "changed", modelId: "changed-model" };
    const fixture = makeFixture({
      configs: [firstConfig, changedConfig],
      textErrors: [retryableError({ code: "AI_RATE_LIMITED", retryAfterMs: 200 })],
    });

    const result = await fixture.service.generateText(textRequest());

    expect(result).toMatchObject({ profileId: "primary", attemptCount: 2 });
    expect(fixture.resolveConfig).toHaveBeenCalledOnce();
    expect(fixture.sleep).toHaveBeenCalledWith(200, expect.any(AbortSignal));
    expect(fixture.attemptRecords.map((record) => record.profileId)).toEqual(["primary", "primary"]);
  });

  it("does not retry when the remaining deadline cannot cover the delay", async () => {
    const fixture = makeFixture({
      textErrors: [retryableError({ code: "AI_UNAVAILABLE", retryAfterMs: 5_000 })],
    });

    await expect(fixture.service.generateText(textRequest())).rejects.toMatchObject({ code: "AI_TIMEOUT" });
    expect(fixture.generateText).toHaveBeenCalledOnce();
    expect(fixture.sleep).not.toHaveBeenCalled();
  });

  it("stops after an ambiguous retryable failure and records unknown billing", async () => {
    const fixture = makeFixture({
      textErrors: [retryableError({ dispatchOutcome: "ambiguous" })],
    });

    await expect(fixture.service.generateText(textRequest())).rejects.toMatchObject({ code: "AI_UNAVAILABLE" });
    expect(fixture.generateText).toHaveBeenCalledOnce();
    expect(fixture.attemptOutcomes[0]).toMatchObject({ dispatchOutcome: "ambiguous", usageUnknown: true,
      billingUnknown: true, usage: unknownUsage(), estimatedCost: null, costComplete: false });
  });

  it("uses deterministic exponential jitter when Retry-After is absent", async () => {
    const fixture = makeFixture({ textErrors: [retryableError()], randomValues: [0.5] });

    await fixture.service.generateText(textRequest());

    expect(fixture.sleep).toHaveBeenCalledWith(500, expect.any(AbortSignal));
  });

  it("records each attempt and never exceeds the configured two attempts", async () => {
    const fixture = makeFixture({ textErrors: [retryableError(), retryableError()] });

    await expect(fixture.service.generateText(textRequest())).rejects.toMatchObject({ code: "AI_UNAVAILABLE" });

    expect(fixture.generateText).toHaveBeenCalledTimes(2);
    expect(fixture.attemptRecords.map((record) => record.attemptNumber)).toEqual([1, 2]);
    expect(fixture.attemptOutcomes).toHaveLength(2);
  });

  it.each([
    "AI_CONFIG_ERROR", "AI_INPUT_INVALID", "AI_CAPABILITY_UNSUPPORTED", "AI_AUTH_ERROR",
    "AI_REFUSED", "AI_INVALID_OUTPUT",
  ] as const)("does not retry %s", async (code) => {
    const fixture = makeFixture({ textErrors: [retryableError({ code, retryable: false })] });

    await expect(fixture.service.generateText(textRequest())).rejects.toMatchObject({ code });

    expect(fixture.generateText).toHaveBeenCalledOnce();
    expect(fixture.sleep).not.toHaveBeenCalled();
  });

  it("does not retry a rejected error outside the explicit transient code allowlist", async () => {
    const fixture = makeFixture({ textErrors: [retryableError({ code: "AI_AUTH_ERROR" })] });

    await expect(fixture.service.generateText(textRequest())).rejects.toMatchObject({ code: "AI_AUTH_ERROR" });

    expect(fixture.generateText).toHaveBeenCalledOnce();
  });

  it("bounds provider Retry-After before reserving an execution attempt", async () => {
    const fixture = makeFixture({ textErrors: [retryableError({ retryAfterMs: 60_000 })], configOverrides: {
      limits: { ...config.limits, totalDeadlineMs: 40_000 },
    } });

    await fixture.service.generateText(textRequest());

    expect(fixture.sleep).toHaveBeenCalledWith(30_000, expect.any(AbortSignal));
  });

  it("does not start the next attempt without its minimum execution budget", async () => {
    const fixture = makeFixture({ textErrors: [retryableError({ retryAfterMs: 4_100 })] });

    await expect(fixture.service.generateText(textRequest())).rejects.toMatchObject({ code: "AI_TIMEOUT" });

    expect(fixture.generateText).toHaveBeenCalledOnce();
  });

  it("prevents an adapter from mutating the resolved profile snapshot", async () => {
    const fixture = makeFixture({ adapterConfigMutation: true });

    const result = await fixture.service.generateText(textRequest());

    expect(result).toMatchObject({ profileId: "primary", model: "actual-model" });
    expect(fixture.attemptRecords.map((record) => record.model)).toEqual(["configured-model"]);
  });
});

describe("DefaultAIService cancellation and concurrency", () => {
  it("maps abort before start to cancellation without invoking the adapter", async () => {
    const controller = new AbortController();
    controller.abort();
    const fixture = makeFixture();

    await expect(fixture.service.generateText(textRequest({ abortSignal: controller.signal }))).rejects.toMatchObject({ code: "AI_CANCELLED" });

    expect(fixture.generateText).not.toHaveBeenCalled();
  });

  it("cancels after asset resolution without invoking the adapter", async () => {
    const controller = new AbortController();
    const fixture = makeFixture({ resolveAssetImplementation: async () => {
      controller.abort();
      return { assetId: "asset-1", bytes: Uint8Array.of(1), mimeType: "image/png" };
    } });

    await expect(fixture.service.generateText(textRequest({ abortSignal: controller.signal,
      messages: [{ role: "user", content: "look", assetId: "asset-1" }] }))).rejects.toMatchObject({ code: "AI_CANCELLED" });

    expect(fixture.generateText).not.toHaveBeenCalled();
  });

  it("prioritizes caller cancellation over an adapter error", async () => {
    const controller = new AbortController();
    const fixture = makeFixture({ adapterImplementation: async () => {
      controller.abort();
      throw retryableError();
    } });

    await expect(fixture.service.generateText(textRequest({ abortSignal: controller.signal }))).rejects.toMatchObject({ code: "AI_CANCELLED" });
  });

  it("maps attempt timeout to AI_TIMEOUT and cleans the scheduled timer", async () => {
    const fixture = makeFixture({ adapterImplementation: (request) => new Promise((_resolve, reject) => {
      request.attempt.signal.addEventListener("abort", () => reject(request.attempt.signal.reason), { once: true });
    }) });

    const promise = fixture.service.generateText(textRequest());
    await fixture.flush(10);
    fixture.scheduler.advanceBy(1_000);

    await expect(promise).rejects.toMatchObject({ code: "AI_TIMEOUT" });
    expect(fixture.scheduler.pendingCount()).toBe(0);
  });

  it("uses the remaining total deadline when it is shorter than the attempt timeout", async () => {
    const fixture = makeFixture({ configOverrides: { limits: { ...config.limits, totalDeadlineMs: 400 } },
      adapterImplementation: (request) => new Promise((_resolve, reject) => {
        request.attempt.signal.addEventListener("abort", () => reject(request.attempt.signal.reason), { once: true });
      }) });

    const promise = fixture.service.generateText(textRequest());
    await fixture.flush();
    fixture.scheduler.advanceBy(400);

    await expect(promise).rejects.toMatchObject({ code: "AI_TIMEOUT" });
    expect(fixture.scheduler.pendingCount()).toBe(0);
  });

  it("cancels during backoff and schedules no future retry", async () => {
    const controller = new AbortController();
    const fixture = makeFixture({
      textErrors: [retryableError()],
      sleepImplementation: async (_milliseconds, signal) => {
        controller.abort();
        signal?.throwIfAborted();
      },
    });

    await expect(fixture.service.generateText(textRequest({ abortSignal: controller.signal }))).rejects.toMatchObject({ code: "AI_CANCELLED" });

    expect(fixture.generateText).toHaveBeenCalledOnce();
  });

  it("maps caller cancellation during adapter work and releases concurrency", async () => {
    const controller = new AbortController();
    let adapterCall = 0;
    const fixture = makeFixture({ adapterImplementation: async (request) => {
      if (adapterCall++ === 0) {
        controller.abort();
        request.attempt.signal.throwIfAborted();
      }
      return { text: "answer", model: "actual-model", providerRequestId: "provider-1", finishReason: "stop",
        usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 } };
    } });

    await expect(fixture.service.generateText(textRequest({ abortSignal: controller.signal }))).rejects.toMatchObject({ code: "AI_CANCELLED" });
    await expect(fixture.service.generateText(textRequest({ requestId: "request-2" }))).resolves.toMatchObject({ text: "answer" });
  });

  it("includes waiting for a concurrency permit in the total deadline", async () => {
    const fixture = makeFixture({ maximumConcurrency: 1, holdFirstAdapter: true });
    const first = fixture.service.generateText(textRequest());
    await fixture.adapterStarted;
    const second = fixture.service.generateText(textRequest({ requestId: "request-2" }));
    await Promise.resolve();
    fixture.advanceTime(5_000);
    fixture.releaseAdapter();
    await first;
    await expect(second).rejects.toMatchObject({ code: "AI_TIMEOUT" });
  });

  it("rejects at the deadline while the concurrency permit remains occupied", async () => {
    const fixture = makeFixture({ maximumConcurrency: 1, holdFirstAdapter: true });
    void fixture.service.generateText(textRequest());
    await fixture.adapterStarted;
    const queued = fixture.service.generateText(textRequest({ requestId: "request-2" }));
    await fixture.waitForPendingTimer();

    fixture.scheduler.advanceBy(5_000);
    await fixture.flush(5);
    fixture.scheduler.advanceBy(100);

    await expect(queued).rejects.toMatchObject({ code: "AI_TIMEOUT" });
    expect(fixture.generateText).toHaveBeenCalledOnce();
  });

  it("prioritizes caller abort when it races the queued deadline", async () => {
    const controller = new AbortController();
    const fixture = makeFixture({ maximumConcurrency: 1, holdFirstAdapter: true });
    void fixture.service.generateText(textRequest());
    await fixture.adapterStarted;
    const queued = fixture.service.generateText(textRequest({ requestId: "request-2", abortSignal: controller.signal }));
    await fixture.waitForPendingTimer();

    controller.abort();
    fixture.scheduler.advanceBy(5_000);

    await expect(queued).rejects.toMatchObject({ code: "AI_CANCELLED" });
    expect(fixture.generateText).toHaveBeenCalledOnce();
  });
});

type FixtureOptions = {
  textResult?: Partial<ProviderTextResult>;
  structuredJson?: string;
  startOperationError?: Error;
  finalizeOperationError?: Error;
  textErrors?: AIError[];
  configs?: ResolvedAIConfig[];
  randomValues?: number[];
  sleepImplementation?: (milliseconds: number, signal?: AbortSignal) => Promise<void>;
  adapterImplementation?: (request: Parameters<ProviderAdapter["generateText"]>[0]) => Promise<ProviderTextResult>;
  maximumConcurrency?: number;
  holdFirstAdapter?: boolean;
  startAttemptError?: Error;
  hangFinalizers?: boolean;
  configOverrides?: Partial<ResolvedAIConfig>;
  adapterConfigMutation?: boolean;
  resolveAssetImplementation?: AssetResolver["resolve"];
};

function makeFixture(options: FixtureOptions = {}) {
  const events: string[] = [];
  let now = 100;
  let textCall = 0;
  let configCall = 0;
  let randomCall = 0;
  let releaseAdapter: () => void = () => undefined;
  let notifyAdapterStarted: () => void = () => undefined;
  const adapterStarted = new Promise<void>((resolve) => { notifyAdapterStarted = resolve; });
  const adapterGate = new Promise<void>((resolve) => { releaseAdapter = resolve; });
  const result = { text: "answer", model: "actual-model", providerRequestId: "provider-1", finishReason: "stop" as const,
    usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 }, ...options.textResult };
  const generateText = vi.fn(async (request) => {
    events.push(`adapter:text:${request.attempt.attemptNumber}`);
    now += 25;
    const error = options.textErrors?.[textCall++];
    if (error) throw error;
    if (options.adapterImplementation) return options.adapterImplementation(request);
    if (options.holdFirstAdapter && request.requestId === "request-1") {
      notifyAdapterStarted();
      await adapterGate;
    }
    return result;
  });
  const generateStructured = vi.fn(async (request) => { events.push(`adapter:structured:${request.attempt.attemptNumber}`); now += 25; return { ...result, json: options.structuredJson ?? '{"answer":"yes"}' }; });
  const adapter: ProviderAdapter = { generateText, generateStructured };
  const resolveAsset = vi.fn(async (...arguments_: Parameters<AssetResolver["resolve"]>) => {
    events.push("asset:resolve");
    return options.resolveAssetImplementation?.(...arguments_) ?? { assetId: "asset-1", bytes: Uint8Array.of(1), mimeType: "image/png" as const };
  });
  const assetResolver: AssetResolver = { resolve: resolveAsset };
  const operationRecords: Parameters<UsageRecorder["startOperation"]>[0][] = [];
  const startOperation = vi.fn(async (record) => { events.push("operation:start"); operationRecords.push(record); if (options.startOperationError) throw options.startOperationError; });
  const operationOutcomes: Parameters<UsageRecorder["finalizeOperation"]>[1][] = [];
  const finalizeOperation = vi.fn(async (_requestId, outcome) => {
    events.push("operation:finalize"); operationOutcomes.push(outcome);
    if (options.hangFinalizers) await new Promise(() => undefined);
    if (options.finalizeOperationError) throw options.finalizeOperationError;
  });
  const attemptRecords: Parameters<UsageRecorder["startAttempt"]>[0][] = [];
  const attemptOutcomes: Parameters<UsageRecorder["finalizeAttempt"]>[1][] = [];
  const startAttempt = vi.fn(async (record) => {
    events.push(`attempt:start:${record.attemptNumber}`); attemptRecords.push(record);
    if (options.startAttemptError) throw options.startAttemptError;
  });
  const finalizeAttempt = vi.fn(async (_attemptId, outcome) => {
    events.push("attempt:finalize"); attemptOutcomes.push(outcome);
    if (options.hangFinalizers) await new Promise(() => undefined);
  });
  const recordDiagnostic = vi.fn(async () => { if (options.hangFinalizers) await new Promise(() => undefined); });
  const usageRecorder: UsageRecorder = { startOperation, finalizeOperation, startAttempt, finalizeAttempt, recordDiagnostic };
  const resolvedConfig = { ...config, ...options.configOverrides };
  const resolveConfig = vi.fn(() => options.configs?.[configCall++] ?? resolvedConfig);
  const sleep = vi.fn(async (milliseconds: number, signal?: AbortSignal) => {
    if (options.sleepImplementation) return options.sleepImplementation(milliseconds, signal);
    now += milliseconds;
  });
  const scheduler = new FakeScheduler(() => now, (value) => { now = value; });
  const service = new DefaultAIService({ resolveConfig, getAdapter: (profile) => {
    if (options.adapterConfigMutation) {
      try { (profile as { modelId: string }).modelId = "mutated-model"; } catch {}
    }
    return adapter;
  }, assetResolver, usageRecorder,
    now: () => now, sleep, random: () => options.randomValues?.[randomCall++] ?? 0, createId: () => `attempt-${attemptRecords.length + 1}`,
    maximumConcurrency: options.maximumConcurrency, scheduler, recorderTimeoutMs: 100 });
  return { service, events, generateText, generateStructured, resolveAsset, recordDiagnostic, resolveConfig, sleep,
    operationRecords, attemptRecords, attemptOutcomes, operationOutcomes, adapterStarted, releaseAdapter, scheduler,
    flush: async (count = 3) => { for (let index = 0; index < count; index += 1) await Promise.resolve(); },
    waitForPendingTimer: async () => {
      for (let index = 0; index < 20 && scheduler.pendingCount() === 0; index += 1) await Promise.resolve();
    },
    advanceTime: (milliseconds: number) => { now += milliseconds; } };
}

function textRequest(overrides: Partial<GenerateTextRequest> = {}): GenerateTextRequest {
  return { requestId: "request-1", task: "planner", context: { userId: "user-1" }, instructions: "answer",
    messages: [{ role: "user", content: "question" }], promptVersion: "v1", ...overrides };
}

function structuredRequest(): GenerateStructuredRequest<{ answer: string }> {
  return { ...textRequest(), schema: { name: "answer", version: "v1", schema: z.object({ answer: z.string() }) } };
}

function retryableError(overrides: Partial<ConstructorParameters<typeof AIError>[0]> = {}): AIError {
  return new AIError({ code: "AI_UNAVAILABLE", safeMessage: "AI provider is unavailable.", requestId: "request-1",
    retryable: true, dispatchOutcome: "rejected", ...overrides });
}

function unknownUsage() {
  return { inputTokens: null, outputTokens: null, totalTokens: null };
}

class FakeScheduler {
  private nextId = 1;
  private readonly timers = new Map<number, { at: number; callback: () => void }>();

  constructor(private readonly now: () => number, private readonly setNow: (value: number) => void) {}

  setTimeout(callback: () => void, milliseconds: number): number {
    const id = this.nextId++;
    this.timers.set(id, { at: this.now() + milliseconds, callback });
    return id;
  }

  clearTimeout(id: unknown): void {
    this.timers.delete(id as number);
  }

  advanceBy(milliseconds: number): void {
    this.setNow(this.now() + milliseconds);
    for (const [id, timer] of [...this.timers].sort((a, b) => a[1].at - b[1].at)) {
      if (timer.at <= this.now()) {
        this.timers.delete(id);
        timer.callback();
      }
    }
  }

  pendingCount(): number {
    return this.timers.size;
  }
}

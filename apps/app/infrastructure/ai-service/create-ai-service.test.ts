import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("../supabase/service-role-client", () => ({
  createSupabaseServiceRoleClient: vi.fn(() => ({ from: vi.fn(), factoryEnvironment: process.env })),
}));
vi.mock("./r2-object-store", () => ({ R2ObjectStore: class { constructor(readonly environment?: unknown) {} } }));
vi.mock("../../application/ai-service/resolve-asset", () => ({ resolveOwnedAsset: vi.fn() }));
vi.mock("./supabase-usage-recorder", () => ({
  SupabaseUsageRecorder: class {
    startOperation = vi.fn().mockResolvedValue(undefined);
    finalizeOperation = vi.fn().mockResolvedValue(undefined);
    startAttempt = vi.fn().mockResolvedValue(undefined);
    finalizeAttempt = vi.fn().mockResolvedValue(undefined);
    recordDiagnostic = vi.fn().mockResolvedValue(undefined);
  },
}));

import { resolveOwnedAsset } from "../../application/ai-service/resolve-asset";
import { checkConfiguredAIService, createAIService } from "./create-ai-service";
import { resetProcessAIServiceLimiterForTests } from "./create-ai-service.test-utils";

const HERE = dirname(fileURLToPath(import.meta.url));
const ACTIVE_KEY = "active-key-value";

describe("AI service server factory", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    resetProcessAIServiceLimiterForTests();
  });

  it("checks every task mapping without making a provider request", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const result = checkConfiguredAIService({ environment: configuredEnvironment() });

    expect(result).toEqual({
      status: "valid",
      profiles: [{ id: "primary", provider: "google", model: "gemini-test" }],
      tasks: [
        { task: "connection_test", profileId: "primary" },
        { task: "interviewer", profileId: "primary" },
        { task: "planner", profileId: "primary" },
        { task: "product_analysis", profileId: "primary" },
      ],
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("fails when an active profile credential is missing without exposing credentials", () => {
    const environment = configuredEnvironment();
    delete environment.AI_GOOGLE_API_KEY;

    expect(() => checkConfiguredAIService({ environment })).toThrowError(
      expect.objectContaining({ code: "AI_CONFIG_ERROR", message: "AI service configuration is invalid." }),
    );
  });

  it("allows an unused registered profile to omit its credential", () => {
    const environment = configuredEnvironment({
      AI_PROFILES_JSON: JSON.stringify([primaryProfile(), secondaryProfile()]),
    });

    expect(checkConfiguredAIService({ environment }).profiles).toEqual([
      { id: "primary", provider: "google", model: "gemini-test" },
      { id: "secondary", provider: "google", model: null },
    ]);
  });

  it("allows connection-test override only for registered profile IDs", () => {
    const environment = configuredEnvironment({
      AI_PROFILES_JSON: JSON.stringify([primaryProfile(), secondaryProfile()]),
      AI_GOOGLE_SECONDARY_KEY: "secondary-key-value",
      AI_GOOGLE_SECONDARY_MODEL: "gemini-secondary",
    });

    expect(checkConfiguredAIService({ environment, profileOverride: "secondary" }).tasks[0]).toEqual({
      task: "connection_test",
      profileId: "secondary",
    });
    expect(() => checkConfiguredAIService({ environment, profileOverride: "unknown" })).toThrowError(
      expect.objectContaining({ code: "AI_CONFIG_ERROR" }),
    );
  });

  it("creates services from the current configuration instead of caching the service", () => {
    const primary = createAIService({ environment: configuredEnvironment() });
    const secondary = createAIService({
      environment: configuredEnvironment({
        AI_PROFILES_JSON: JSON.stringify([primaryProfile(), secondaryProfile()]),
        AI_GOOGLE_SECONDARY_KEY: "secondary-key-value",
        AI_GOOGLE_SECONDARY_MODEL: "gemini-secondary",
      }),
      profileOverride: "secondary",
    });

    expect(primary).not.toBe(secondary);
  });

  it("caps overlapping operations across services at the first configured process maximum", async () => {
    let active = 0;
    let maximumActive = 0;
    const releases: Array<() => void> = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await new Promise<void>((resolve) => releases.push(resolve));
      active -= 1;
      return successfulProviderResponse();
    });
    const environment = configuredEnvironment({ AI_MAX_CONCURRENCY: "2" });
    const primary = createAIService({ environment });
    const secondary = createAIService({ environment });

    const operations = [
      primary.generateText(textRequest("request-1")),
      secondary.generateText(textRequest("request-2")),
      primary.generateText(textRequest("request-3")),
    ];
    await vi.waitFor(() => expect(releases).toHaveLength(2));
    releases.shift()?.();
    await vi.waitFor(() => expect(releases).toHaveLength(2));
    releases.splice(0).forEach((release) => release());
    await Promise.all(operations);

    expect(maximumActive).toBe(2);
  });

  it("enforces the lower task concurrency limit across service instances", async () => {
    let active = 0;
    let maximumActive = 0;
    const releases: Array<() => void> = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await new Promise<void>((resolve) => releases.push(resolve));
      active -= 1;
      return successfulProviderResponse();
    });
    const environment = configuredEnvironment({
      AI_MAX_CONCURRENCY: "3",
      AI_TASKS_JSON: JSON.stringify([
        { task: "connection_test", profileId: "primary", limits: { maxConcurrency: 1 } },
        { task: "interviewer", profileId: "primary" },
        { task: "planner", profileId: "primary" },
        { task: "product_analysis", profileId: "primary" },
      ]),
    });
    const firstService = createAIService({ environment });
    const secondService = createAIService({ environment });

    const first = firstService.generateText(textRequest("request-1"));
    const second = secondService.generateText(textRequest("request-2"));
    await vi.waitFor(() => expect(releases).toHaveLength(1));
    releases.shift()?.();
    await vi.waitFor(() => expect(releases).toHaveLength(1));
    releases.shift()?.();
    await Promise.all([first, second]);

    expect(maximumActive).toBe(1);
  });

  it("prevents mixed task concurrency limits from overlapping above the lower process cap", async () => {
    let active = 0;
    let maximumActive = 0;
    const releases: Array<() => void> = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await new Promise<void>((resolve) => releases.push(resolve));
      active -= 1;
      return successfulProviderResponse();
    });
    const strictService = createAIService({ environment: configuredEnvironment({
      AI_MAX_CONCURRENCY: "3",
      AI_TASKS_JSON: taskConfiguration(1),
    }) });
    const relaxedService = createAIService({ environment: configuredEnvironment({
      AI_MAX_CONCURRENCY: "3",
      AI_TASKS_JSON: taskConfiguration(2),
    }) });

    const first = strictService.generateText(textRequest("request-1"));
    await vi.waitFor(() => expect(releases).toHaveLength(1));
    const second = relaxedService.generateText(textRequest("request-2"));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(releases).toHaveLength(1);
    releases.shift()?.();
    await vi.waitFor(() => expect(releases).toHaveLength(1));
    releases.shift()?.();
    await Promise.all([first, second]);

    expect(maximumActive).toBe(1);
  });

  it("rejects a different process concurrency maximum after the first factory call", () => {
    createAIService({ environment: configuredEnvironment({ AI_MAX_CONCURRENCY: "2" }) });

    expect(() => createAIService({ environment: configuredEnvironment({ AI_MAX_CONCURRENCY: "3" }) })).toThrowError(
      expect.objectContaining({ code: "AI_CONFIG_ERROR", message: "AI service configuration is invalid." }),
    );
  });

  it("keeps structured schemas keyed by name and version", () => {
    const environment = configuredEnvironment();
    const schemas = { "smoke-result@v1": { safeParse: vi.fn() } as never };

    expect(createAIService({ environment, schemas })).toBeDefined();
    expect(() => createAIService({ environment, schemas: { "smoke-result": schemas["smoke-result@v1"] } })).toThrowError(
      expect.objectContaining({ code: "AI_CONFIG_ERROR" }),
    );
  });

  it("passes effective task image limits through the production factory", async () => {
    vi.mocked(resolveOwnedAsset).mockResolvedValue({ assetId: "asset-1", bytes: Uint8Array.of(1), mimeType: "image/png" });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(successfulProviderResponse());
    const environment = configuredEnvironment({ AI_TASKS_JSON: JSON.stringify([
      { task: "connection_test", profileId: "primary", limits: { maxImageBytes: 25, maxImageWidth: 4, maxImageHeight: 5 } },
      { task: "interviewer", profileId: "primary" }, { task: "planner", profileId: "primary" },
      { task: "product_analysis", profileId: "primary" },
    ]) });

    await createAIService({ environment }).generateText({ ...textRequest("request-image"),
      messages: [{ role: "user", content: "Look", assetId: "asset-1" }] });

    expect(resolveOwnedAsset).toHaveBeenCalledWith({ assetId: "asset-1", userId: "user-1",
      limits: { maxImageBytes: 25, maxImageWidth: 4, maxImageHeight: 5 } }, expect.any(Object));
  });

  it("validates every unused profile entry before returning typed configuration", () => {
    const invalidUnusedProfile = { ...secondaryProfile(), capabilities: { text: "yes" } };
    const environment = configuredEnvironment({
      AI_PROFILES_JSON: JSON.stringify([primaryProfile(), invalidUnusedProfile]),
    });

    expect(() => checkConfiguredAIService({ environment })).toThrowError(
      expect.objectContaining({ code: "AI_CONFIG_ERROR" }),
    );
  });

  it("validates every task entry before returning typed configuration", () => {
    const environment = configuredEnvironment({
      AI_TASKS_JSON: JSON.stringify([
        { task: "connection_test", profileId: "primary" },
        { task: "unused-task", profileId: "primary" },
      ]),
    });

    expect(() => checkConfiguredAIService({ environment })).toThrowError(
      expect.objectContaining({ code: "AI_CONFIG_ERROR" }),
    );
  });

  it("does not depend on Atlas or video-flow modules", () => {
    const source = readFileSync(resolve(HERE, "create-ai-service.ts"), "utf8");

    expect(source).not.toMatch(/domain\/ai\/|application\/ai\/|infrastructure\/ai\/|atlas|video/i);
  });
});

function configuredEnvironment(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    AI_PROFILES_JSON: JSON.stringify([primaryProfile()]),
    AI_TASKS_JSON: JSON.stringify([
      { task: "connection_test", profileId: "primary" },
      { task: "interviewer", profileId: "primary" },
      { task: "planner", profileId: "primary" },
      { task: "product_analysis", profileId: "primary" },
    ]),
    AI_MAX_CONCURRENCY: "3",
    AI_GOOGLE_API_KEY: ACTIVE_KEY,
    AI_GOOGLE_MODEL: "gemini-test",
    NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "service-role-example",
    R2_ACCOUNT_ID: "account-example",
    R2_ACCESS_KEY_ID: "access-example",
    R2_SECRET_ACCESS_KEY: "secret-example",
    R2_BUCKET: "assets-example",
    ...overrides,
  };
}

function taskConfiguration(maxConcurrency: number): string {
  return JSON.stringify([
    { task: "connection_test", profileId: "primary", limits: { maxConcurrency } },
    { task: "interviewer", profileId: "primary" },
    { task: "planner", profileId: "primary" },
    { task: "product_analysis", profileId: "primary" },
  ]);
}

function primaryProfile() {
  return {
    id: "primary",
    apiFormat: "google-generate-content",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    apiKeyEnv: "AI_GOOGLE_API_KEY",
    modelIdEnv: "AI_GOOGLE_MODEL",
    provider: "google",
    capabilities: { text: true, vision: true, nativeStructuredOutput: true },
    limits: {
      maxInputCharacters: 20_000,
      maxOutputTokens: 2_048,
      maxImages: 1,
      maxImageBytes: 10_000_000,
      maxImageWidth: 8_192,
      maxImageHeight: 8_192,
      maxConcurrency: 3,
      attemptTimeoutMs: 30_000,
      totalDeadlineMs: 65_000,
      maxAttempts: 2,
    },
  };
}

function secondaryProfile() {
  return {
    ...primaryProfile(),
    id: "secondary",
    apiKeyEnv: "AI_GOOGLE_SECONDARY_KEY",
    modelIdEnv: "AI_GOOGLE_SECONDARY_MODEL",
  };
}

function textRequest(requestId: string) {
  return {
    requestId,
    task: "connection_test" as const,
    context: { userId: "user-1" },
    instructions: "Reply.",
    messages: [{ role: "user" as const, content: "Hello" }],
    promptVersion: "v1",
  };
}

function successfulProviderResponse(): Response {
  return Response.json({
    responseId: "provider-request",
    candidates: [{ content: { parts: [{ text: "ok" }] }, finishReason: "STOP" }],
    usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1, totalTokenCount: 2 },
  });
}

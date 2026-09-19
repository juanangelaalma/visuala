import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  publicClient: vi.fn(),
  userClient: vi.fn(),
  userRepository: vi.fn(),
  findById: vi.fn(),
  createAIService: vi.fn(),
  createAIAssetServices: vi.fn(),
  checkConfiguredAIService: vi.fn(),
  registerAsset: vi.fn(),
  resolveOwnedAsset: vi.fn(),
  generateText: vi.fn(),
}));

vi.mock("@/infrastructure/supabase/clients", () => ({
  createSupabasePublicClient: mocks.publicClient,
  createSupabaseUserClient: mocks.userClient,
}));
vi.mock("@/infrastructure/auth/supabase-user-repository", () => ({ SupabaseUserRepository: mocks.userRepository }));
vi.mock("@/application/ai-service/services", () => ({
  createAIService: mocks.createAIService,
  createAIAssetServices: mocks.createAIAssetServices,
  checkConfiguredAIService: mocks.checkConfiguredAIService,
}));
vi.mock("@/application/ai-service/register-asset", () => ({ registerAsset: mocks.registerAsset }));
vi.mock("@/application/ai-service/resolve-asset", () => ({ resolveOwnedAsset: mocks.resolveOwnedAsset }));

import { AIError } from "@/domain/ai-service/errors";
import { createApp } from "@/app";

const user = { id: "user-1", email: "user@example.com", user_metadata: {} };
const assetServices = { assetRepository: {}, objectStore: {} };
const textRequest = { task: "interviewer" as const, instructions: "Ask a question.", promptVersion: "v1", messages: [{ role: "user" as const, content: "Hi" }] };

function send(method: string, path: string, options: { token?: string; body?: unknown; contentType?: string; raw?: string } = {}) {
  return createApp().handle(
    new Request(`http://localhost${path}`, {
      method,
      headers: {
        ...(options.raw === undefined ? { "content-type": options.contentType ?? "application/json" } : { "content-type": options.contentType ?? "application/octet-stream" }),
        ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
      },
      ...(options.raw !== undefined ? { body: options.raw } : options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
    }),
  );
}

describe("ai routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user }, error: null });
    mocks.publicClient.mockReturnValue({ auth: { getUser: mocks.getUser } });
    mocks.userClient.mockReturnValue({ scoped: true });
    mocks.userRepository.mockReturnValue({ findById: mocks.findById });
    mocks.findById.mockResolvedValue(null);
    mocks.createAIService.mockReturnValue({ generateText: mocks.generateText, generateStructured: vi.fn() });
    mocks.createAIAssetServices.mockReturnValue(assetServices);
    mocks.generateText.mockResolvedValue({ requestId: "req-1", text: "ok", profileId: "local-primary", provider: "local", model: "test" });
    mocks.checkConfiguredAIService.mockReturnValue({ status: "valid", profiles: [], tasks: [] });
  });

  describe("POST /ai/generate/text", () => {
    it("requires authentication", async () => {
      const response = await send("POST", "/ai/generate/text", { body: textRequest });

      expect(response.status).toBe(401);
      expect(mocks.generateText).not.toHaveBeenCalled();
    });

    it("rejects an invalid body", async () => {
      const response = await send("POST", "/ai/generate/text", { token: "token", body: { task: "nope" } });

      expect(response.status).toBe(422);
      await expect(response.json()).resolves.toEqual({ error: "Invalid request." });
      expect(mocks.generateText).not.toHaveBeenCalled();
    });

    it("generates text for the authenticated user with a server issued request id", async () => {
      const response = await send("POST", "/ai/generate/text", { token: "token", body: { ...textRequest, projectId: "project-1" } });

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({ text: "ok" });

      const [request] = mocks.generateText.mock.calls[0];
      expect(request).toMatchObject({
        task: "interviewer",
        instructions: "Ask a question.",
        promptVersion: "v1",
        context: { userId: "user-1", projectId: "project-1" },
        messages: [{ role: "user", content: "Hi" }],
      });
      expect(typeof request.requestId).toBe("string");
      expect(request.requestId).toHaveLength(36);
    });

    it("maps an AI error to a safe response", async () => {
      mocks.generateText.mockRejectedValue(new AIError({ code: "AI_RATE_LIMITED", safeMessage: "Rate limited.", requestId: "req-1", retryable: true, retryAfterMs: 1500 }));

      const response = await send("POST", "/ai/generate/text", { token: "token", body: textRequest });

      expect(response.status).toBe(429);
      await expect(response.json()).resolves.toEqual({ error: "Rate limited.", code: "AI_RATE_LIMITED", requestId: "req-1", retryable: true, retryAfterMs: 1500 });
    });
  });

  describe("POST /ai/assets", () => {
    it("rejects an unsupported declared content type without touching the repository", async () => {
      const response = await send("POST", "/ai/assets", { token: "token", raw: "not-an-image", contentType: "text/plain" });

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toMatchObject({ code: "AI_INPUT_INVALID" });
      expect(mocks.registerAsset).not.toHaveBeenCalled();
    });

    it("registers an asset for the authenticated user", async () => {
      mocks.registerAsset.mockResolvedValue({ id: "asset-1", userId: "user-1", mimeType: "image/png", byteSize: 4, width: 1, height: 1, sha256: "a".repeat(64), createdAt: "now" });

      const response = await send("POST", "/ai/assets", { token: "token", raw: "PNGD", contentType: "image/png" });

      expect(response.status).toBe(201);
      await expect(response.json()).resolves.toEqual({ asset: { id: "asset-1", mimeType: "image/png", byteSize: 4, width: 1, height: 1, sha256: "a".repeat(64), createdAt: "now" } });

      const [input, dependencies] = mocks.registerAsset.mock.calls[0];
      expect(input).toMatchObject({ userId: "user-1", declaredMimeType: "image/png" });
      expect(Array.from(input.bytes as Uint8Array)).toEqual([80, 78, 71, 68]);
      expect(dependencies.repository).toBe(assetServices.assetRepository);
      expect(typeof dependencies.createAssetId()).toBe("string");
    });

    it("propagates an invalid image as a safe 400", async () => {
      mocks.registerAsset.mockRejectedValue(new AIError({ code: "AI_INPUT_INVALID", safeMessage: "Upload a valid JPEG, PNG, or WebP image up to 10 MB.", requestId: "asset", retryable: false }));

      const response = await send("POST", "/ai/assets", { token: "token", raw: "PNGD", contentType: "image/png" });

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toMatchObject({ code: "AI_INPUT_INVALID" });
    });
  });

  describe("GET /ai/assets/:assetId", () => {
    it("streams the owned asset bytes with its mime type", async () => {
      mocks.resolveOwnedAsset.mockResolvedValue({ assetId: "asset-1", bytes: new Uint8Array([1, 2, 3]), mimeType: "image/png" });

      const response = await send("GET", "/ai/assets/asset-1", { token: "token" });

      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe("image/png");
      expect(Array.from(new Uint8Array(await response.arrayBuffer()))).toEqual([1, 2, 3]);
      expect(mocks.resolveOwnedAsset).toHaveBeenCalledWith({ assetId: "asset-1", userId: "user-1" }, { repository: assetServices.assetRepository, objectStore: assetServices.objectStore });
    });
  });

  describe("GET /ai/config", () => {
    it("requires authentication and an admin profile", async () => {
      const anonymous = await send("GET", "/ai/config");
      expect(anonymous.status).toBe(401);

      mocks.findById.mockResolvedValue({ id: "user-1", role: "user" });
      const forbidden = await send("GET", "/ai/config", { token: "token" });
      expect(forbidden.status).toBe(403);
      expect(mocks.checkConfiguredAIService).not.toHaveBeenCalled();
    });

    it("reports the configuration check to an admin", async () => {
      mocks.findById.mockResolvedValue({ id: "user-1", role: "admin" });

      const response = await send("GET", "/ai/config", { token: "token" });

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ status: "valid", profiles: [], tasks: [] });
      expect(mocks.checkConfiguredAIService).toHaveBeenCalledOnce();
    });
  });
});

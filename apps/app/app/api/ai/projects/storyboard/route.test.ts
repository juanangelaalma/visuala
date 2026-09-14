import { beforeEach, describe, expect, it, vi } from "vitest";
import { storyboardSchema } from "@/domain/ai/types";
import { AIError } from "@/domain/ai-service/errors";

const mocks = vi.hoisted(() => ({ authenticated: vi.fn(), createAIService: vi.fn(), generateStructured: vi.fn(), serviceClient: vi.fn(), randomUUID: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("../../_shared", async (load) => ({ ...(await load()), authenticated: mocks.authenticated }));
vi.mock("@/infrastructure/ai-service/create-ai-service", () => ({ createAIService: mocks.createAIService }));
vi.mock("@/infrastructure/supabase/service-role-client", () => ({ createSupabaseServiceRoleClient: mocks.serviceClient }));
vi.mock("node:crypto", async (load) => ({ ...(await load()), randomUUID: mocks.randomUUID }));
import { POST } from "./route";

const PRODUCT = { name: "Lamp", description: "Desk lamp", category: "Home", audience: "Students", sellingPoint: "Compact", offer: "", cta: "Buy now", keyMessage: "Bright desk", concept: "Study setup" };
const SCENE = { title: "Hook", sceneType: "hook_light_motion", motionComplexity: "low", imagePrompt: "Lamp on desk", videoPrompt: "Slow push", negativePrompt: "text", dialogue: "Look", duration: 12 };

function request(body: unknown = { product: PRODUCT, creator: "Ayu", duration: 12, quality: "standard", referenceAssets: [] }) {
  return new Request("http://localhost/api/ai/projects/storyboard", { method: "POST", headers: { "content-type": "application/json", "idempotency-key": "request-key" }, body: JSON.stringify(body) });
}

function database() {
  let table = "";
  const operations: Array<{ method: string; table: string; value?: unknown }> = [];
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  chain.select = vi.fn(() => chain);
  chain.eq = vi.fn(() => chain);
  chain.order = vi.fn(() => chain);
  chain.insert = vi.fn((value) => { operations.push({ method: "insert", table, value }); return chain; });
  chain.update = vi.fn((value) => { operations.push({ method: "update", table, value }); return chain; });
  chain.maybeSingle = vi.fn().mockResolvedValue({ data: null });
  chain.single = vi.fn(async () => ({ data: { id: "project-1", duration_seconds: 12, quality: "standard", created_at: "2026-09-13" }, error: null }));
  chain.then = vi.fn((resolve) => resolve(table === "ai_scenes" ? { data: [{ id: "scene-1", position: 0, title: "Hook", scene_type: "hook_light_motion", motion_complexity: "low", image_prompt: "Lamp on desk", video_prompt: "Slow push", negative_prompt: "text", dialogue: "Look", duration_seconds: 12 }], error: null } : { data: null, error: null }));
  const from = vi.fn((selectedTable: string) => { table = selectedTable; return chain; });
  return { from, chain, operations };
}

let db: ReturnType<typeof database>;

describe("storyboard route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authenticated.mockResolvedValue({ id: "user-1" });
    mocks.randomUUID.mockReturnValue("ai-request-1");
    mocks.createAIService.mockReturnValue({ generateStructured: mocks.generateStructured });
    mocks.generateStructured.mockResolvedValue({ data: { scenes: [SCENE] }, provider: "google", model: "server-model", providerRequestId: "provider-1", attemptCount: 1, finishReason: "stop", usage: {}, estimatedCost: null, latencyMs: 1, requestId: "ai-request-1", profileId: "primary" });
    db = database();
    db.chain.select.mockImplementation(() => db.chain);
    mocks.serviceClient.mockReturnValue(db);
  });

  it("generates the storyboard through the server AI service and preserves persistence response", async () => {
    const response = await POST(request());
    expect(mocks.createAIService).toHaveBeenCalledWith({ schemas: { "storyboard@1": storyboardSchema } });
    expect(mocks.generateStructured).toHaveBeenCalledWith({
      requestId: "ai-request-1", task: "planner", context: { userId: "user-1", projectId: "project-1" },
      instructions: "Create a 12s vertical 9:16 Indonesian UGC affiliate storyboard. Product: {\"name\":\"Lamp\",\"description\":\"Desk lamp\",\"category\":\"Home\",\"audience\":\"Students\",\"sellingPoint\":\"Compact\",\"offer\":\"\",\"cta\":\"Buy now\",\"keyMessage\":\"Bright desk\",\"concept\":\"Study setup\"}. Creator: Ayu. Return valid scenes with a shared visual style, imagePrompt, videoPrompt, negativePrompt, dialogue, and durations totaling 12. Do not render promotional copy inside images.",
      messages: [{ role: "user", content: "Create the storyboard." }], promptVersion: "storyboard-v1",
      schema: { name: "storyboard", version: "1", schema: storyboardSchema },
    });
    expect({ status: response.status, body: await response.json() }).toMatchObject({ status: 201, body: { project: { id: "project-1", status: "storyboard_ready" }, scenes: [{ id: "scene-1", title: "Hook" }] } });
  });

  it("returns normalized safe AI failures while preserving failure persistence", async () => {
    mocks.generateStructured.mockRejectedValue(new AIError({ code: "AI_UNAVAILABLE", safeMessage: "secret provider detail", requestId: "ai-request-1", retryable: true }));
    const response = await POST(request());
    expect({ status: response.status, body: await response.json() }).toEqual({ status: 503, body: { error: { code: "AI_UNAVAILABLE", message: "The AI service is unavailable." } } });
  });

  it("persists normalized scenes in generated order", async () => {
    mocks.generateStructured.mockResolvedValue({ data: { scenes: [{ ...SCENE, title: "Hook", duration: 6 }, { ...SCENE, title: "Demo", sceneType: "demo_medium_motion", duration: 6 }] } });

    await POST(request());

    expect(db.operations.find(({ table }) => table === "ai_scenes")?.value).toEqual([
      { project_id: "project-1", position: 0, title: "Hook", scene_type: "hook_light_motion", motion_complexity: "low", image_prompt: "Lamp on desk", video_prompt: "Slow push", negative_prompt: "text", dialogue: "Look", duration_seconds: 6 },
      { project_id: "project-1", position: 1, title: "Demo", scene_type: "demo_medium_motion", motion_complexity: "low", image_prompt: "Lamp on desk", video_prompt: "Slow push", negative_prompt: "text", dialogue: "Look", duration_seconds: 6 },
    ]);
  });

  it("marks generation succeeded without persisting provider diagnostics", async () => {
    await POST(request());

    const update = db.operations.find(({ table, value }) => table === "ai_generations" && (value as { status?: string }).status === "succeeded")?.value;
    expect(update).toMatchObject({ status: "succeeded", provider_response: null, completed_at: expect.any(String) });
  });

  it("marks the project storyboard ready after successful generation", async () => {
    await POST(request());

    expect(db.operations).toContainEqual({ method: "update", table: "ai_projects", value: { status: "storyboard_ready" } });
  });

  it("returns the existing project and ordered scenes without generating again", async () => {
    db.chain.maybeSingle.mockResolvedValue({ data: { id: "project-existing", status: "storyboard_ready", duration_seconds: 12, quality: "standard", created_at: "2026-09-12" } });

    const response = await POST(request());

    expect({ status: response.status, body: await response.json() }).toEqual({ status: 200, body: { project: { id: "project-existing", status: "storyboard_ready", durationSeconds: 12, quality: "standard", createdAt: "2026-09-12" }, scenes: [{ id: "scene-1", position: 0, title: "Hook", sceneType: "hook_light_motion", motionComplexity: "low", imagePrompt: "Lamp on desk", videoPrompt: "Slow push", negativePrompt: "text", dialogue: "Look", durationSeconds: 12, approvedImageGenerationId: null }] } });
    expect(mocks.generateStructured).not.toHaveBeenCalled();
  });

  it("marks failed generation and project with safe diagnostics", async () => {
    mocks.generateStructured.mockRejectedValue(new AIError({ code: "AI_UNAVAILABLE", safeMessage: "secret provider detail", requestId: "ai-request-1", retryable: true }));

    await POST(request());

    expect(db.operations).toContainEqual({ method: "update", table: "ai_generations", value: { status: "failed", error_code: "STORYBOARD_FAILED", error_message: "Storyboard generation failed", completed_at: expect.any(String) } });
    expect(db.operations).toContainEqual({ method: "update", table: "ai_projects", value: { status: "storyboard_failed" } });
  });

  it("rejects browser-controlled provider, model, and schema fields", async () => {
    const response = await POST(request({ product: PRODUCT, creator: "Ayu", duration: 12, quality: "standard", referenceAssets: [], provider: "browser", model: "browser-model", schema: {} }));

    expect({ status: response.status, body: await response.json() }).toEqual({ status: 400, body: { error: { code: "INVALID_REQUEST", message: "Request validation failed" } } });
    expect(mocks.generateStructured).not.toHaveBeenCalled();
  });
});

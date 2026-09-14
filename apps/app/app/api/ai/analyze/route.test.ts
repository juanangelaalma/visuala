import { beforeEach, describe, expect, it, vi } from "vitest";
import { productSchema } from "@/domain/ai/types";
import { AIError } from "@/domain/ai-service/errors";

const mocks = vi.hoisted(() => ({ authenticated: vi.fn(), createAIService: vi.fn(), generateStructured: vi.fn(), randomUUID: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("../_shared", async (load) => ({ ...(await load()), authenticated: mocks.authenticated }));
vi.mock("@/infrastructure/ai-service/create-ai-service", () => ({ createAIService: mocks.createAIService }));
vi.mock("node:crypto", async (load) => ({ ...(await load()), randomUUID: mocks.randomUUID }));
import { POST } from "./route";

const ASSET_ID = "11111111-1111-4111-8111-111111111111";
const PRODUCT = { name: "Lamp", description: "Desk lamp", category: "Home", audience: "Students", sellingPoint: "Compact", offer: "", cta: "Buy now", keyMessage: "Bright desk", concept: "Study setup" };

function request(body: unknown = { assetId: ASSET_ID }) {
  return new Request("http://localhost/api/ai/analyze", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}

describe("analyze route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authenticated.mockResolvedValue({ id: "user-1" });
    mocks.randomUUID.mockReturnValue("request-1");
    mocks.createAIService.mockReturnValue({ generateStructured: mocks.generateStructured });
    mocks.generateStructured.mockResolvedValue({ data: PRODUCT });
  });

  it("analyzes one owned asset through the server AI service", async () => {
    const response = await POST(request());

    expect(mocks.createAIService).toHaveBeenCalledWith({ schemas: { "product@1": productSchema } });
    expect(mocks.generateStructured).toHaveBeenCalledWith({
      requestId: "request-1", task: "product_analysis", context: { userId: "user-1" },
      instructions: "Analyze these product and marketplace images for an Indonesian affiliate video. Return JSON with exactly: name, description, category, audience, sellingPoint, offer, cta, keyMessage, concept. Do not invent unverifiable claims.",
      messages: [{ role: "user", content: "Analyze the product shown in this asset.", assetId: ASSET_ID }],
      promptVersion: "product-analysis-v1", schema: { name: "product", version: "1", schema: productSchema },
    });
    expect(await response.json()).toEqual({ product: PRODUCT });
  });

  it("rejects browser-controlled generation options", async () => {
    const response = await POST(request({ assetId: ASSET_ID, provider: "browser", model: "browser", schema: {} }));
    expect({ status: response.status, body: await response.json() }).toEqual({ status: 400, body: { error: { code: "INVALID_REQUEST", message: "Request validation failed" } } });
  });

  it("maps owned-asset rejection to a safe response", async () => {
    mocks.generateStructured.mockRejectedValue(new AIError({ code: "AI_INPUT_INVALID", safeMessage: "private asset detail", requestId: "request-1", retryable: false }));
    const response = await POST(request());
    expect({ status: response.status, body: await response.json() }).toEqual({ status: 400, body: { error: { code: "AI_INPUT_INVALID", message: "The AI input is invalid." } } });
  });

  it("preserves authentication failures", async () => {
    const { ApiError } = await import("../_shared");
    mocks.authenticated.mockRejectedValue(new ApiError(401, "AUTH_REQUIRED", "Authentication required"));
    const response = await POST(request());
    expect(response.status).toBe(401);
  });
});

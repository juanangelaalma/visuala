import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authenticated: vi.fn(), registerAsset: vi.fn(), repository: vi.fn(), objectStore: vi.fn(), serviceClient: vi.fn(),
}));
vi.mock("../_shared", async (load) => ({ ...(await load()), authenticated: mocks.authenticated }));
vi.mock("@/application/ai-service/register-asset", () => ({ registerAsset: mocks.registerAsset }));
vi.mock("@/infrastructure/ai-service/supabase-asset-repository", () => ({ SupabaseAssetRepository: mocks.repository }));
vi.mock("@/infrastructure/ai-service/r2-object-store", () => ({ R2ObjectStore: mocks.objectStore }));
vi.mock("@/infrastructure/supabase/service-role-client", () => ({ createSupabaseServiceRoleClient: mocks.serviceClient }));
import { POST } from "./route";

function request(files: File[]) {
  const form = new FormData();
  files.forEach((file) => form.append("image", file));
  return new Request("http://localhost/api/ai/assets", { method: "POST", body: form });
}

describe("AI assets route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authenticated.mockResolvedValue({ id: "user-1" });
    mocks.serviceClient.mockReturnValue({});
    mocks.registerAsset.mockResolvedValue({ id: "asset-1", mimeType: "image/png", byteSize: 29, width: 2, height: 3, objectKey: "private/key" });
  });

  it("registers one authenticated image and returns safe metadata", async () => {
    const response = await POST(request([new File([Uint8Array.of(1)], "image.png", { type: "image/png" })]));
    expect({ status: response.status, body: await response.json() }).toEqual({
      status: 201,
      body: { asset: { id: "asset-1", mimeType: "image/png", byteSize: 29, width: 2, height: 3 } },
    });
  });

  it("rejects requests without exactly one file", async () => {
    const response = await POST(request([]));
    expect({ status: response.status, body: await response.json() }).toEqual({
      status: 400, body: { error: { code: "INVALID_ASSET", message: "Upload one image." } },
    });
  });

  it("preserves the existing authentication response", async () => {
    const { ApiError } = await import("../_shared");
    mocks.authenticated.mockRejectedValue(new ApiError(401, "AUTH_REQUIRED", "Authentication required"));
    const response = await POST(request([new File([Uint8Array.of(1)], "image.png", { type: "image/png" })]));
    expect({ status: response.status, body: await response.json() }).toEqual({
      status: 401, body: { error: { code: "AUTH_REQUIRED", message: "Authentication required" } },
    });
  });

  it("hides internal upload failures", async () => {
    mocks.registerAsset.mockRejectedValue(new Error("secret bucket detail"));
    const response = await POST(request([new File([Uint8Array.of(1)], "image.png", { type: "image/png" })]));
    expect({ status: response.status, body: await response.json() }).toEqual({
      status: 500, body: { error: { code: "INTERNAL_ERROR", message: "The request could not be completed" } },
    });
  });
});

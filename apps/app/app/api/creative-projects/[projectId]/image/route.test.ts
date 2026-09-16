import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ services: vi.fn(), getImage: vi.fn(), error: vi.fn() }));
vi.mock("@/application/creative-video/services", () => ({ createCreativeVideoServices: mocks.services }));
vi.mock("@/application/creative-video/get-owned-project-image", () => ({ getOwnedCreativeProjectImage: mocks.getImage }));
import { GET } from "./route";

describe("creative project image route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(mocks.error);
  });

  it("requires authentication", async () => {
    mocks.services.mockResolvedValue(services(null));

    const response = await GET(new Request("https://visuala.test"), context());

    expect(response.status).toBe(401);
  });

  it("hides missing and foreign projects", async () => {
    mocks.services.mockResolvedValue(services({ id: "user-1" }));
    mocks.getImage.mockResolvedValue(null);

    const response = await GET(new Request("https://visuala.test"), context());

    expect(response.status).toBe(404);
  });

  it("returns validated owned image bytes without exposing storage metadata", async () => {
    mocks.services.mockResolvedValue(services({ id: "user-1" }));
    mocks.getImage.mockResolvedValue({ assetId: "asset-1", bytes: new Uint8Array([1, 2]), mimeType: "image/png" });

    const response = await GET(new Request("https://visuala.test"), context());

    expect({ status: response.status, type: response.headers.get("Content-Type"), cache: response.headers.get("Cache-Control"), bytes: [...new Uint8Array(await response.arrayBuffer())] }).toEqual({ status: 200, type: "image/png", cache: "private, no-store", bytes: [1, 2] });
  });

  it("returns a stable safe server error", async () => {
    mocks.services.mockRejectedValue(new Error("secret object key"));

    const response = await GET(new Request("https://visuala.test"), context());

    expect({ status: response.status, body: await response.json() }).toEqual({ status: 500, body: { error: "Could not load project image." } });
  });
});

function services(user: unknown) {
  return { authProvider: { getCurrentUser: vi.fn().mockResolvedValue(user) }, projects: {}, projectAssets: {} };
}

function context() {
  return { params: Promise.resolve({ projectId: "project-1" }) };
}

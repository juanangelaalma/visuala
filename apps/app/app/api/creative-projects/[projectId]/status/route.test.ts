import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ services: vi.fn(), getOwned: vi.fn(), error: vi.fn() }));
vi.mock("@/application/creative-video/services", () => ({ createCreativeVideoServices: mocks.services }));
vi.mock("@/application/creative-video/get-owned-project", () => ({ getOwnedCreativeProject: mocks.getOwned }));
import { GET } from "./route";

describe("creative project status route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(mocks.error);
  });

  it("requires authentication", async () => {
    mocks.services.mockResolvedValue(services(null));

    const response = await GET(request(), context());

    expect({ status: response.status, body: await response.json() }).toEqual({ status: 401, body: { error: "Sign in to continue." } });
  });

  it("hides missing and foreign projects behind the same response", async () => {
    mocks.services.mockResolvedValue(services({ id: "user-1" }));
    mocks.getOwned.mockResolvedValue(null);

    const response = await GET(request(), context());

    expect({ status: response.status, body: await response.json() }).toEqual({ status: 404, body: { error: "Creative project not found." } });
  });

  it("returns a small unchanged response when the revision is current", async () => {
    mocks.services.mockResolvedValue(services({ id: "user-1" }));
    mocks.getOwned.mockResolvedValue(aggregate());

    const response = await GET(request(4), context());

    expect(await response.json()).toEqual({ projectId: "project-1", revision: 4, state: "needs_input", updatedAt: "2026-09-15T00:01:00.000Z" });
  });

  it("returns the aggregate when the project advanced", async () => {
    const value = aggregate();
    mocks.services.mockResolvedValue(services({ id: "user-1" }));
    mocks.getOwned.mockResolvedValue(value);

    const response = await GET(request(3), context());

    expect(await response.json()).toEqual({ projectId: "project-1", revision: 4, state: "needs_input", updatedAt: "2026-09-15T00:01:00.000Z", aggregate: value });
  });

  it("rejects an invalid revision with a stable safe response", async () => {
    mocks.services.mockResolvedValue(services({ id: "user-1" }));

    const response = await GET(request("invalid"), context());

    expect({ status: response.status, body: await response.json() }).toEqual({ status: 400, body: { error: "Invalid project revision." } });
    expect(mocks.getOwned).not.toHaveBeenCalled();
  });

  it("returns a stable safe server error", async () => {
    mocks.services.mockRejectedValue(new Error("database secret"));

    const response = await GET(request(), context());

    expect({ status: response.status, body: await response.json() }).toEqual({ status: 500, body: { error: "Could not load creative project status." } });
  });
});

function services(user: unknown) {
  return { authProvider: { getCurrentUser: vi.fn().mockResolvedValue(user) }, projects: {} };
}

function request(revision?: number | string) {
  return new Request(`https://visuala.test/api/creative-projects/project-1/status${revision === undefined ? "" : `?revision=${revision}`}`);
}

function context() {
  return { params: Promise.resolve({ projectId: "project-1" }) };
}

function aggregate() {
  return { project: { id: "project-1", revision: 4, state: "needs_input", updatedAt: "2026-09-15T00:01:00.000Z" }, messages: [], brief: null, concepts: [] };
}

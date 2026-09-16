import { describe, expect, it, vi } from "vitest";
import { getOwnedCreativeProjectImage } from "./get-owned-project-image";

describe("getOwnedCreativeProjectImage", () => {
  it("resolves only the asset attached to an owned project", async () => {
    const aggregate = { project: { assetId: "asset-1" } };
    const projects = { getOwnedProject: vi.fn().mockResolvedValue(aggregate) };
    const assets = { resolve: vi.fn().mockResolvedValue({ assetId: "asset-1", bytes: new Uint8Array([1]), mimeType: "image/png" }) };

    const result = await getOwnedCreativeProjectImage({ projects: projects as never, assets }, { projectId: "project-1", userId: "user-1" });

    expect(result).toEqual({ assetId: "asset-1", bytes: new Uint8Array([1]), mimeType: "image/png" });
    expect(assets.resolve).toHaveBeenCalledWith("asset-1", "user-1");
  });

  it("does not resolve an asset for a missing or foreign project", async () => {
    const assets = { resolve: vi.fn() };

    const result = await getOwnedCreativeProjectImage({ projects: { getOwnedProject: vi.fn().mockResolvedValue(null) } as never, assets }, { projectId: "project-1", userId: "user-2" });

    expect(result).toBeNull();
    expect(assets.resolve).not.toHaveBeenCalled();
  });
});

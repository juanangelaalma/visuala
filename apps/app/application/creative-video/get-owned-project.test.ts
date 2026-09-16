import { describe, expect, it, vi } from "vitest";
import { getOwnedCreativeProject } from "./get-owned-project";

describe("getOwnedCreativeProject", () => {
  it("returns the aggregate scoped to the authenticated owner", async () => {
    const aggregate = { project: { id: "project-1" } };
    const projects = { getOwnedProject: vi.fn().mockResolvedValue(aggregate) };

    const result = await getOwnedCreativeProject(projects as never, "project-1", "user-1");

    expect(result).toBe(aggregate);
    expect(projects.getOwnedProject).toHaveBeenCalledWith("project-1", "user-1");
  });
});

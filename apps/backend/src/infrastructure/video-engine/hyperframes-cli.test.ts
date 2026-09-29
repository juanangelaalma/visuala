import { describe, expect, it, vi } from "vitest";
import { HYPERFRAMES_CLI_VERSION, createHyperframesCli, parseAddResult } from "./hyperframes-cli";

const ADD_PAYLOAD = {
  ok: true,
  name: "heygen-avatar-promo-card",
  type: "hyperframes:block",
  written: ["/tmp/proj/compositions/heygen-avatar-promo-card.html"],
  installed: ["heygen-avatar-promo-card"],
  snippet: '<div data-composition-src="compositions/heygen-avatar-promo-card.html" data-duration="10"></div>',
  warnings: [],
};

describe("createHyperframesCli", () => {
  it("adds an item through the pinned CLI package", async () => {
    const run = vi.fn(async () => JSON.stringify(ADD_PAYLOAD));

    const result = await createHyperframesCli(run).add({ name: "heygen-avatar-promo-card", dir: "/tmp/proj" });

    expect(result.snippet).toContain("data-composition-src");
    expect(run).toHaveBeenCalledWith(["add", "heygen-avatar-promo-card", "--json", "--no-clipboard", "--dir", "/tmp/proj"]);
    expect(HYPERFRAMES_CLI_VERSION).toBe("0.8.59");
  });

  it("runs the browser gate for a directory", async () => {
    const run = vi.fn(async () => JSON.stringify({ ok: true, findings: [] }));

    await expect(createHyperframesCli(run).check({ dir: "/tmp/proj" })).resolves.toEqual({ ok: true, findings: [] });
    expect(run).toHaveBeenCalledWith(["check", "--json", "/tmp/proj"]);
  });

  it("rejects output that is not JSON", async () => {
    const run = vi.fn(async () => "not json");

    await expect(createHyperframesCli(run).add({ name: "x", dir: "/tmp" })).rejects.toMatchObject({ code: "cli_unreadable" });
  });
});

describe("parseAddResult", () => {
  it("rejects a result that reports a failure", () => {
    expect(() => parseAddResult(JSON.stringify({ ...ADD_PAYLOAD, ok: false }))).toThrow(/could not install/);
  });

  it("rejects a result with no host snippet", () => {
    expect(() => parseAddResult(JSON.stringify({ ...ADD_PAYLOAD, snippet: "  " }))).toThrow(/could not install/);
  });

  it("rejects a payload missing required fields", () => {
    expect(() => parseAddResult(JSON.stringify({ ok: true }))).toThrow(/installed item/);
  });
});

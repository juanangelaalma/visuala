import { describe, expect, it, vi } from "vitest";
import { createHyperframesCli, parseAddResult, parseCheckResult } from "./hyperframes-cli";

const ADD_PAYLOAD = {
  ok: true,
  name: "heygen-avatar-promo-card",
  type: "hyperframes:block",
  written: ["/tmp/proj/compositions/heygen-avatar-promo-card.html"],
  installed: ["heygen-avatar-promo-card"],
  snippet: '<div data-composition-src="compositions/heygen-avatar-promo-card.html" data-duration="10"></div>',
  warnings: [],
};

function checkPayload() {
  const section = { ok: true, errorCount: 0, warningCount: 0, infoCount: 0, findings: [] };
  return {
    ok: true,
    strict: false,
    lint: { ...section, filesScanned: 1 },
    runtime: { ...section },
    layout: { ...section, duration: 6, samples: [1, 3, 5], truncated: false },
    motion: { ...section, enabled: false, samples: 0 },
    contrast: { ...section, enabled: true, samples: [1, 3, 5], checked: 3, passed: 3 },
    snapshots: { enabled: false, files: [], times: [], findingFiles: [] },
  };
}

describe("createHyperframesCli", () => {
  it("adds an item through the pinned CLI package", async () => {
    const run = vi.fn(async () => JSON.stringify(ADD_PAYLOAD));

    const result = await createHyperframesCli(run).add({ name: "heygen-avatar-promo-card", dir: "/tmp/proj" });

    expect(result.snippet).toContain("data-composition-src");
    expect(run).toHaveBeenCalledWith(["add", "heygen-avatar-promo-card", "--json", "--no-clipboard", "--dir", "/tmp/proj"]);
  });

  it("rejects an unreadable browser gate result even when it claims success", async () => {
    const run = vi.fn(async () => JSON.stringify({ ok: true, findings: [] }));

    await expect(createHyperframesCli(run).check({ dir: "/tmp/proj" })).rejects.toMatchObject({ code: "cli_unreadable" });
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

describe("parseCheckResult", () => {
  it.each([
    { ok: true },
    { ok: true, findings: [] },
    { ...checkPayload(), runtime: undefined },
    { ...checkPayload(), layout: { ...checkPayload().layout, samples: [] } },
    { ...checkPayload(), contrast: { ...checkPayload().contrast, enabled: false } },
    { ...checkPayload(), layout: { ...checkPayload().layout, truncated: true } },
  ])("fails closed when the browser report is incomplete", (payload) => {
    expect(() => parseCheckResult(JSON.stringify(payload))).toThrow();
  });

  it("rejects a failed check with actionable finding details", () => {
    const payload = checkPayload();
    const finding = { code: "content_overlap", severity: "error", message: "Headline overlaps CTA", sourceFile: "index.html", selector: "#cta", time: 4 };
    expect(() => parseCheckResult(JSON.stringify({
      ...payload,
      ok: false,
      layout: { ...payload.layout, ok: false, errorCount: 1, findings: [finding] },
    }))).toThrow(/content_overlap.*Headline overlaps CTA.*#cta.*4s/);
  });

  it("does not trust a successful envelope over failed findings", () => {
    const payload = checkPayload();
    expect(() => parseCheckResult(JSON.stringify({
      ...payload,
      runtime: { ...payload.runtime, ok: false, errorCount: 1, findings: [{ code: "font_missing", severity: "error", message: "Font failed", sourceFile: "index.html", selector: "h1", time: 1 }] },
    }))).toThrow(/font_missing/);
  });

  it("rejects inconsistent finding counts", () => {
    const payload = checkPayload();
    expect(() => parseCheckResult(JSON.stringify({ ...payload, runtime: { ...payload.runtime, errorCount: 1 } }))).toThrow(/inconsistent/);
  });
});

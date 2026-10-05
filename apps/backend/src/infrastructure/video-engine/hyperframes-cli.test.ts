import { type ChildProcess, execFile } from "node:child_process";
import { describe, expect, it, vi } from "vitest";
import { createHyperframesCli, HyperframesCliError, HyperframesContentError, parseAddResult, parseCheckResult } from "./hyperframes-cli";

vi.mock("node:child_process", () => ({ execFile: vi.fn() }));

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

function failedCheckPayload(section: "lint" | "runtime" | "layout" | "motion" | "contrast", code: string, severity: "error" | "warning" = "error") {
  const payload = checkPayload();
  return {
    ...payload,
    ok: false,
    strict: severity === "warning",
    [section]: {
      ...payload[section],
      ok: severity !== "error",
      errorCount: severity === "error" ? 1 : 0,
      warningCount: severity === "warning" ? 1 : 0,
      findings: [{ code, severity, message: "Authored finding detail", sourceFile: "index.html", selector: "#cta", time: 4 }],
    },
  };
}

function checkFailure(payload: unknown) {
  try {
    parseCheckResult(JSON.stringify(payload));
  } catch (error) {
    return error;
  }
  throw new Error("Expected the browser gate to reject this report.");
}

describe("createHyperframesCli", () => {
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
    const error = checkFailure(payload);
    expect(error).toMatchObject({ code: "cli_unreadable" });
    expect(error).not.toBeInstanceOf(HyperframesContentError);
  });

  it.each([
    ["layout", "content_overlap"],
    ["layout", "text_box_overflow"],
    ["contrast", "contrast_aa_failure"],
    ["lint", "invalid_inline_script_syntax"],
    ["motion", "motion_off_frame"],
  ] as const)("returns structured authored findings from %s", (section, code) => {
    const payload = failedCheckPayload(section, code);
    const error = checkFailure(payload);
    expect(error).toBeInstanceOf(HyperframesContentError);
    expect(error).toMatchObject({
      code: "cli_failed",
      findings: [{ code, severity: "error", message: "Authored finding detail", selector: "#cta", sourceFile: "index.html", time: 4 }],
    });
  });

  it("preserves every rejected finding, including producer diagnostics beyond the message preview", () => {
    const payload = checkPayload();
    const findings = Array.from({ length: 10 }, (_, index) => ({
      code: "content_overlap", severity: "error", message: `Overlap ${index}`,
      sourceFile: "index.html", selector: `#text-${index}`, time: index / 2,
      bbox: { x: index, y: 20, width: 100, height: 40 },
    }));
    const error = checkFailure({ ...payload, ok: false, layout: { ...payload.layout, ok: false, errorCount: 10, findings } });
    expect(error).toBeInstanceOf(HyperframesContentError);
    expect((error as HyperframesContentError).findings).toEqual(findings);
  });

  it("treats known strict-mode content warnings as rejected content", () => {
    expect(checkFailure(failedCheckPayload("layout", "container_overflow", "warning"))).toBeInstanceOf(HyperframesContentError);
  });

  it("does not reject the same content warning outside strict mode", () => {
    const payload = { ...failedCheckPayload("layout", "container_overflow", "warning"), ok: true, strict: false };
    expect(parseCheckResult(JSON.stringify(payload))).toEqual(payload);
  });

  it.each([
    ["runtime", "check_runtime_failure"],
    ["runtime", "page_error"],
    ["runtime", "console_error"],
    ["runtime", "request_failed"],
    ["runtime", "http_error"],
    ["runtime", "image_missing"],
    ["runtime", "font_missing"],
    ["runtime", "webgpu_runtime_error"],
    ["runtime", "visual_check_unreadable"],
    ["layout", "unknown_content_failure"],
    ["layout", "invalid_inline_script_syntax"],
    ["lint", "font_family_without_font_face"],
  ] as const)("keeps %s/%s non-correctable", (section, code) => {
    const error = checkFailure(failedCheckPayload(section, code));
    expect(error).toBeInstanceOf(HyperframesCliError);
    expect(error).not.toBeInstanceOf(HyperframesContentError);
  });

  it("does not retry mixed content and infrastructure failures", () => {
    const payload = failedCheckPayload("layout", "content_overlap");
    const error = checkFailure({
      ...payload,
      runtime: {
        ...payload.runtime, ok: false, errorCount: 1,
        findings: [{ code: "request_failed", severity: "error", message: "Network unavailable", sourceFile: "index.html", selector: "img", time: 1 }],
      },
    });
    expect(error).not.toBeInstanceOf(HyperframesContentError);
  });

  it.each([
    { duration: 0 },
    { samples: [] },
    { truncated: true },
  ])("checks browser completeness before classifying rejected content: %j", (incomplete) => {
    const payload = failedCheckPayload("layout", "content_overlap");
    const error = checkFailure({ ...payload, layout: { ...payload.layout, ...incomplete } });
    expect(error).toMatchObject({ code: "cli_unreadable" });
    expect(error).not.toBeInstanceOf(HyperframesContentError);
  });

  it("accepts the producer's intentional lint-only rejection without pretending the browser ran", () => {
    const payload = failedCheckPayload("lint", "invalid_inline_script_syntax");
    const lintOnly = {
      ...payload,
      layout: { ...payload.layout, duration: 0, samples: [] },
      contrast: { ...payload.contrast, samples: [], checked: 0, passed: 0 },
    };
    expect(checkFailure(lintOnly)).toBeInstanceOf(HyperframesContentError);
    expect(checkFailure({ ...lintOnly, runtime: { ...payload.runtime, findings: [{ code: "check_runtime_failure", severity: "error", message: "Chrome failed", sourceFile: "index.html", selector: "body", time: 0 }], ok: false, errorCount: 1 } })).not.toBeInstanceOf(HyperframesContentError);
  });

  it("does not interpret a lint-only envelope with unknown lint errors as authored content", () => {
    const payload = failedCheckPayload("lint", "unknown_lint_failure");
    const error = checkFailure({
      ...payload,
      layout: { ...payload.layout, duration: 0, samples: [] },
      contrast: { ...payload.contrast, samples: [], checked: 0, passed: 0 },
    });
    expect(error).not.toBeInstanceOf(HyperframesContentError);
  });

  it.each([
    { code: "content_overlap", severity: "error", message: "Detail", sourceFile: "index.html", time: 4 },
    { code: "content_overlap", severity: "error", message: "Detail", sourceFile: "index.html", selector: "#cta", time: "4" },
  ])("does not correct reports with malformed finding data", (finding) => {
    const payload = checkPayload();
    const error = checkFailure({ ...payload, ok: false, layout: { ...payload.layout, ok: false, errorCount: 1, findings: [finding] } });
    expect(error).toMatchObject({ code: "cli_unreadable" });
    expect(error).not.toBeInstanceOf(HyperframesContentError);
  });

  it.each([
    { ...checkPayload(), ok: false },
    { ...failedCheckPayload("layout", "content_overlap"), ok: true },
    { ...checkPayload(), runtime: { ...checkPayload().runtime, errorCount: 1 } },
  ])("rejects inconsistent status and finding counts without correction", (payload) => {
    const error = checkFailure(payload);
    expect(error).toMatchObject({ code: "cli_unreadable" });
    expect(error).not.toBeInstanceOf(HyperframesContentError);
  });
});

describe("CLI process failures", () => {
  it.each([
    { code: 1, killed: true, signal: "SIGTERM" },
    { code: "ETIMEDOUT", killed: false, signal: null },
    { code: "ERR_CHILD_PROCESS_STDIO_MAXBUFFER", killed: false, signal: null },
    { code: "ENOENT", killed: false, signal: null },
    { code: 2, killed: false, signal: null },
  ])("does not classify partial output from %j as authored content", async (termination) => {
    const processError = Object.assign(new Error("Process failed"), termination, {
      stdout: JSON.stringify(failedCheckPayload("layout", "content_overlap")),
    });
    vi.mocked(execFile).mockImplementationOnce((...args: unknown[]) => {
      const callback = args[args.length - 1] as (error: Error) => void;
      callback(processError);
      return {} as ChildProcess;
    });
    const error = await createHyperframesCli().check({ dir: "/tmp/proj" }).catch((error: unknown) => error);
    expect(error).toBeInstanceOf(HyperframesCliError);
    expect(error).not.toBeInstanceOf(HyperframesContentError);
  });

  it("preserves authored feedback from a normal check exit with status one", async () => {
    const processError = Object.assign(new Error("Check rejected"), {
      code: 1, killed: false, signal: null,
      stdout: JSON.stringify(failedCheckPayload("layout", "content_overlap")),
    });
    vi.mocked(execFile).mockImplementationOnce((...args: unknown[]) => {
      const callback = args[args.length - 1] as (error: Error) => void;
      callback(processError);
      return {} as ChildProcess;
    });
    await expect(createHyperframesCli().check({ dir: "/tmp/proj" })).rejects.toBeInstanceOf(HyperframesContentError);
  });

  it.each([
    "invalid JSON",
    JSON.stringify({ ok: false }),
    JSON.stringify(failedCheckPayload("runtime", "request_failed")),
    JSON.stringify(checkPayload()),
  ])("keeps normal process failures non-correctable without a proven authored report", async (stdout) => {
    const processError = Object.assign(new Error("Process failed"), { code: 1, killed: false, signal: null, stdout });
    vi.mocked(execFile).mockImplementationOnce((...args: unknown[]) => {
      const callback = args[args.length - 1] as (error: Error) => void;
      callback(processError);
      return {} as ChildProcess;
    });
    const error = await createHyperframesCli().check({ dir: "/tmp/proj" }).catch((error: unknown) => error);
    expect(error).toMatchObject({ code: "cli_failed" });
    expect(error).not.toBeInstanceOf(HyperframesContentError);
  });
});

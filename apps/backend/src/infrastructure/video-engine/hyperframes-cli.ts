import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { z } from "zod";

export const HYPERFRAMES_CLI_VERSION = "0.8.59";
export const HYPERFRAMES_CLI_PACKAGE = `hyperframes@${HYPERFRAMES_CLI_VERSION}`;

export type HyperframesCliErrorCode = "cli_failed" | "cli_unreadable";

export class HyperframesCliError extends Error {
  constructor(readonly code: HyperframesCliErrorCode, message: string) {
    super(message);
    this.name = "HyperframesCliError";
  }
}

const addResultSchema = z
  .object({
    ok: z.boolean(),
    name: z.string(),
    type: z.string(),
    written: z.array(z.string()),
    installed: z.array(z.string()),
    snippet: z.string(),
    warnings: z.array(z.string()),
  })
  .loose();

export type HyperframesAddResult = z.infer<typeof addResultSchema>;

const findingSchema = z.object({
  code: z.string(),
  severity: z.enum(["error", "warning", "info"]),
  message: z.string(),
  selector: z.string(),
  sourceFile: z.string(),
  time: z.number().finite(),
}).loose();

const sectionSchema = z.object({
  ok: z.boolean(),
  errorCount: z.number().int().nonnegative(),
  warningCount: z.number().int().nonnegative(),
  infoCount: z.number().int().nonnegative(),
  findings: z.array(findingSchema),
}).loose();

const checkResultSchema = z.object({
  ok: z.boolean(),
  strict: z.boolean(),
  lint: sectionSchema.extend({ filesScanned: z.number().int().nonnegative() }),
  runtime: sectionSchema,
  layout: sectionSchema.extend({
    duration: z.number().finite().nonnegative(),
    samples: z.array(z.number().finite().nonnegative()),
    truncated: z.boolean(),
  }),
  motion: sectionSchema.extend({ enabled: z.boolean(), samples: z.number().int().nonnegative() }),
  contrast: sectionSchema.extend({
    enabled: z.boolean(),
    samples: z.array(z.number().finite().nonnegative()),
    checked: z.number().int().nonnegative(),
    passed: z.number().int().nonnegative(),
  }),
  snapshots: z.object({ enabled: z.boolean(), files: z.array(z.string()), times: z.array(z.number()), findingFiles: z.array(z.string()) }).loose(),
}).loose();

export type HyperframesCheckResult = z.infer<typeof checkResultSchema>;

export type CommandRunner = (args: readonly string[]) => Promise<string>;

export type HyperframesCli = {
  /** With `vars`, the CLI bakes the values into the returned snippet, so a block's slots are set by the registry's own tooling. */
  add(input: { name: string; dir: string; vars?: Readonly<Record<string, string>> }): Promise<HyperframesAddResult>;
  /** Runs the browser gate (lint, runtime, layout, motion, contrast) over a composition directory. */
  check(input: { dir: string; at?: readonly number[] }): Promise<HyperframesCheckResult>;
};

/** Pinned to the producer's version and used only while compiling; the render path never shells out. */
export function createHyperframesCli(run: CommandRunner = defaultRunner): HyperframesCli {
  return {
    async add({ name, dir, vars }) {
      const args = ["add", name, "--json", "--no-clipboard", "--dir", dir];
      if (vars && Object.keys(vars).length > 0) args.push("--vars", JSON.stringify(vars));
      return parseAddResult(await run(args));
    },
    async check({ dir, at }) {
      const args = ["check", "--json", "--samples", "15", "--frame-check", "--at-transitions", dir];
      if (at?.length) args.push("--at", at.join(","));
      return parseCheckResult(await run(args));
    },
  };
}

export function parseAddResult(stdout: string): HyperframesAddResult {
  const parsed = addResultSchema.safeParse(parseJson(stdout));
  if (!parsed.success) throw unreadable("The HyperFrames CLI did not report an installed item.");
  if (!parsed.data.ok || parsed.data.snippet.trim().length === 0) {
    throw unreadable(`The HyperFrames CLI could not install ${parsed.data.name}.`);
  }
  return parsed.data;
}

export function parseCheckResult(stdout: string): HyperframesCheckResult {
  const parsed = checkResultSchema.safeParse(parseJson(stdout));
  if (!parsed.success) throw unreadable("The HyperFrames CLI did not return a complete check report.");
  const report = parsed.data;
  const sections = [report.lint, report.runtime, report.layout, report.motion, report.contrast];
  for (const section of sections) {
    const errors = section.findings.filter((finding) => finding.severity === "error").length;
    const warnings = section.findings.filter((finding) => finding.severity === "warning").length;
    const infos = section.findings.filter((finding) => finding.severity === "info").length;
    if (section.errorCount !== errors || section.warningCount !== warnings || section.infoCount !== infos || section.ok !== (errors === 0)) {
      throw unreadable("The HyperFrames CLI returned inconsistent check findings.");
    }
  }
  const failures = sections.flatMap((section) => section.findings.filter((finding) => finding.severity === "error" || (report.strict && finding.severity === "warning")));
  if (!report.ok || failures.length > 0) {
    const detail = failures.slice(0, 8).map((finding) => `${finding.code}: ${finding.message} (${finding.sourceFile} ${finding.selector} at ${finding.time}s)`).join("; ");
    throw new HyperframesCliError("cli_failed", `The HyperFrames visual check failed.${detail ? ` ${detail}` : ""}`);
  }
  if (report.lint.filesScanned === 0 || report.layout.duration <= 0 || report.layout.samples.length === 0 || !report.contrast.enabled || report.layout.truncated) {
    throw unreadable("The HyperFrames CLI did not complete the browser check.");
  }
  return report;
}

async function defaultRunner(args: readonly string[]): Promise<string> {
  try {
    const { stdout } = await promisify(execFile)("npx", ["--yes", HYPERFRAMES_CLI_PACKAGE, ...args], {
      maxBuffer: 64 * 1024 * 1024,
      timeout: 300_000,
    });
    return stdout;
  } catch (error) {
    if (args[0] === "check" && error && typeof error === "object" && "stdout" in error && typeof error.stdout === "string" && error.stdout.trim()) {
      parseCheckResult(error.stdout);
    }
    throw new HyperframesCliError("cli_failed", describeFailure(error));
  }
}

function describeFailure(error: unknown): string {
  const stderr = error && typeof error === "object" && "stderr" in error ? error.stderr : undefined;
  const detail = typeof stderr === "string" && stderr.trim().length > 0 ? ` ${stderr.trim().split("\n")[0]}` : "";
  return `The HyperFrames CLI failed.${detail}`;
}

function parseJson(stdout: string): unknown {
  try {
    return JSON.parse(stdout);
  } catch {
    throw unreadable("The HyperFrames CLI did not return JSON.");
  }
}

function unreadable(message: string): HyperframesCliError {
  return new HyperframesCliError("cli_unreadable", message);
}

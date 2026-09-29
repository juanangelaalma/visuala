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

export type CommandRunner = (args: readonly string[]) => Promise<string>;

export type HyperframesCli = {
  /** With `vars`, the CLI bakes the values into the returned snippet, so a block's slots are set by the registry's own tooling. */
  add(input: { name: string; dir: string; vars?: Readonly<Record<string, string>> }): Promise<HyperframesAddResult>;
  /** Runs the browser gate (lint, runtime, layout, motion, contrast) over a composition directory. */
  check(input: { dir: string }): Promise<unknown>;
};

/** Pinned to the producer's version and used only while compiling; the render path never shells out. */
export function createHyperframesCli(run: CommandRunner = defaultRunner): HyperframesCli {
  return {
    async add({ name, dir, vars }) {
      const args = ["add", name, "--json", "--no-clipboard", "--dir", dir];
      if (vars && Object.keys(vars).length > 0) args.push("--vars", JSON.stringify(vars));
      return parseAddResult(await run(args));
    },
    async check({ dir }) {
      return parseJson(await run(["check", "--json", dir]));
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

async function defaultRunner(args: readonly string[]): Promise<string> {
  try {
    const { stdout } = await promisify(execFile)("npx", ["--yes", HYPERFRAMES_CLI_PACKAGE, ...args], {
      maxBuffer: 64 * 1024 * 1024,
      timeout: 300_000,
    });
    return stdout;
  } catch (error) {
    throw new HyperframesCliError("cli_failed", describeFailure(error));
  }
}

function describeFailure(error: unknown): string {
  const stderr = (error as { stderr?: string }).stderr;
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

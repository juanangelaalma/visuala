import { mkdir, readFile, rm } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { sha256Hex } from "../../domain/video-engine/hash";
import { HyperframesCliError } from "./hyperframes-cli";
import type { CompiledBlock } from "../../domain/video-engine/compiler";
import type { HyperframesCli } from "./hyperframes-cli";

export type CatalogInstallRequest = {
  name: string;
  /** Values for the block's declared variables; the registry CLI bakes them into the snippet. */
  vars?: Readonly<Record<string, string>>;
};

export interface CatalogInstaller {
  install(requests: readonly CatalogInstallRequest[], scratchDir: string): Promise<Map<string, CompiledBlock>>;
}

/** The only step that touches the network. It runs while a plan compiles, never during a render. */
export function createCatalogInstaller(dependencies: { cli: HyperframesCli }): CatalogInstaller {
  return {
    async install(requests, scratchDir) {
      const blocks = new Map<string, CompiledBlock>();
      for (const request of requests) {
        if (blocks.has(request.name)) continue;
        blocks.set(request.name, await installOne(dependencies, request, scratchDir));
      }
      return blocks;
    },
  };
}

async function installOne(dependencies: { cli: HyperframesCli }, request: CatalogInstallRequest, scratchDir: string): Promise<CompiledBlock> {
  const dir = resolve(scratchDir, `block-${sanitize(request.name)}`);
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });

  const result = await dependencies.cli.add({ name: request.name, dir, vars: request.vars });
  const entry = result.written.find((path) => path.endsWith(".html"));
  if (!entry) throw new HyperframesCliError("cli_unreadable", `${request.name} installed no HTML entry file.`);

  const relativeEntry = normalize(relative(dir, entry));
  const files = await Promise.all(
    result.written.map(async (path) => {
      const key = normalize(relative(dir, path));
      return { key, sourcePath: resolve(dir, key), bytes: await readFile(path) };
    }),
  );

  const html = files.find((file) => file.key === relativeEntry);
  if (!html) throw new HyperframesCliError("cli_unreadable", `${request.name} installed no readable entry file.`);

  // Only the entry is rewritten; every other file is copied byte-for-byte, because a dropped asset is a silently broken frame.
  return {
    name: request.name,
    entryPath: relativeEntry,
    entryContents: toSubComposition(html.bytes.toString("utf8")),
    files: files
      .filter((file) => file.key !== relativeEntry)
      .map((file) => ({ path: file.key, sha256: sha256Hex(file.bytes), sourcePath: file.sourcePath })),
  };
}

/** A registry page is a full document, but the assembler reads a templated sub-composition's root from the template and drops its own `<head>` styles and scripts.
 * So they move inside the template, and the page-level variables move onto the root. */
export function toSubComposition(document: string): string {
  const head = /<head[^>]*>([\s\S]*?)<\/head>/i.exec(document)?.[1] ?? "";
  const body = /<body[^>]*>([\s\S]*?)<\/body>/i.exec(document)?.[1] ?? document;
  const htmlAttributes = /<html([^>]*)>/i.exec(document)?.[1] ?? "";

  const styles = [...head.matchAll(/<style[^>]*>[\s\S]*?<\/style>/gi)].map((match) => match[0]);
  const scripts = [...head.matchAll(/<script[^>]*>[\s\S]*?<\/script>/gi)].map((match) => match[0]);
  const variables = /data-composition-variables\s*=\s*(?:"[\s\S]*?"|'[\s\S]*?')/i.exec(htmlAttributes)?.[0];

  const root = body.trim();
  const withVariables = variables ? addVariables(root, variables) : root;

  return ["<template>", ...styles, ...scripts, withVariables, "</template>"].join("\n");
}

/** Merges the page-level composition variables onto the composition root element. */
function addVariables(root: string, variables: string): string {
  const openTag = /<([a-z][a-z0-9-]*)([^>]*)>/i.exec(root);
  if (!openTag) return root;
  const [tag, name, attributes] = openTag;
  if (attributes.includes("data-composition-variables")) return root;
  return root.replace(tag, `<${name}${attributes} ${variables}>`);
}

function normalize(path: string): string {
  return path.split("\\").join("/");
}

function sanitize(name: string): string {
  return name.replace(/[^a-z0-9-]/gi, "-");
}

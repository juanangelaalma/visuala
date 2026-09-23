import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const videoDirectory = fileURLToPath(new URL(".", import.meta.url));
const boundaryTestPath = fileURLToPath(import.meta.url);

const forbiddenSpecifiers = ["server-only", "@/lib/api/client", "@/infrastructure/supabase/server-client"];
const serverDirective = /^\s*["']use server["']/m;

/** The browser migration's rule: the video feature may reach the backend only through the browser client. */
function boundaryViolations(source: string): string[] {
  const violations: string[] = [];

  for (const specifier of forbiddenSpecifiers) {
    if (source.includes(`"${specifier}"`) || source.includes(`'${specifier}'`)) violations.push(`imports ${specifier}`);
  }
  if (serverDirective.test(source)) violations.push("declares a Server Action");

  return violations;
}

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

describe("video feature source boundary", () => {
  it("flags a server-only import, the server API client, the server Supabase client, and a Server Action", () => {
    expect(boundaryViolations('import "server-only";')).toEqual(["imports server-only"]);
    expect(boundaryViolations('import { apiFetch } from "@/lib/api/client";')).toEqual(["imports @/lib/api/client"]);
    expect(boundaryViolations('import { createSupabaseServerClient } from "@/infrastructure/supabase/server-client";')).toEqual(["imports @/infrastructure/supabase/server-client"]);
    expect(boundaryViolations('"use server";\n')).toEqual(["declares a Server Action"]);
    expect(boundaryViolations('import { videoApi } from "../api/video-api";')).toEqual([]);
  });

  it("has no video source that depends on the server layer", () => {
    const offenders = sourceFiles(videoDirectory)
      .filter((path) => path !== boundaryTestPath)
      .flatMap((path) => boundaryViolations(readFileSync(path, "utf8")).map((violation) => `${path} ${violation}`));

    expect(offenders).toEqual([]);
  });
});

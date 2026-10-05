import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { buildComposition, type CompileAsset, type CompiledBlock, type CompiledComposition } from "../../domain/video-engine/compiler";
import { catalogInstances, type CompositionSpec } from "../../domain/video-engine/composition";
import { compositionArtifactPrefix } from "../../domain/video-engine/artifact-manifest";
import type { ArtDirection } from "../../domain/video-engine/art-direction";
import type { ValidationBrief } from "../../domain/video-engine/validators/types";
import type { AIResultMetadata } from "../../domain/ai-service/types";
import type { LoadedDesignPack } from "../../infrastructure/video-engine/fs-design-pack-source";
import type { ArtifactFile, CompositionArtifactStore } from "../../infrastructure/video-engine/composition-artifact-store";
import type { CatalogInstaller } from "../../infrastructure/video-engine/catalog-installer";
import { CompositionVisualCheckError, type CompositionVisualGate } from "../../infrastructure/video-engine/composition-visual-check";
import { HyperframesContentError } from "../../infrastructure/video-engine/hyperframes-cli";
import { CompositionGenerationError, type CompositionGenerationErrorCode } from "../../domain/video-engine/errors";
import { frameSizeFor } from "../../domain/video-engine/format";
import { assertCompositionHtml, CompositionAuthorError, type CompositionAuthorResult, type CompositionCorrection, type CompositionCorrectionIssue } from "./composition-author";
import { processTrace } from "./process-trace";

export type CompileDependencies = {
  installer: CatalogInstaller;
  artifactStore: CompositionArtifactStore;
  gate: CompositionVisualGate;
  author: (command: CompileCommand, blocks: ReadonlyMap<string, CompiledBlock>, correction?: CompositionCorrection) => Promise<CompositionAuthorResult>;
  write: (compiled: CompiledComposition, targetDir: string) => Promise<void>;
  /** A throwaway directory per compile: the artifact's only durable copy is what was uploaded. */
  createScratchDir?: () => Promise<string>;
};

export type CompileCommand = {
  userId: string;
  brief: ValidationBrief;
  artDirection: ArtDirection;
  projectId: string;
  spec: CompositionSpec;
  designPack: LoadedDesignPack;
  assets: readonly CompileAsset[];
  resolution: "720p" | "1080p";
  language: string;
};

export type FrozenArtifact = {
  compositionHash: string;
  /** Where the artifact lives in object storage. */
  prefix: string;
  moduleVersions: Record<string, string>;
  assetHashes: Record<string, string>;
  catalogComponents: string[];
  author: AIResultMetadata;
};

/** Author HTML after installing catalog blocks; freeze the exact bytes checked before preview or export. */
export async function compileComposition(command: CompileCommand, dependencies: CompileDependencies): Promise<FrozenArtifact> {
  const trace = processTrace({ projectId: command.projectId, sourceFile: "apps/backend/src/application/video-engine/compile.ts" });
  return trace.run("compile", async () => {
    const scratchDir = await trace.run("compile.scratch.allocate", () => (dependencies.createScratchDir ?? defaultScratchDir)());
    try {
      const blocks = await trace.run("compile.catalog.install", () => dependencies.installer.install(catalogInstances(command.spec), join(scratchDir, "install")));
      const artifactDir = join(scratchDir, "artifact");
      let correction: CompositionCorrection | undefined;
      let compiled: CompiledComposition;
      let ai: AIResultMetadata;
      for (let attempt = 1; ; attempt++) {
        trace.event("compile.html.attempt", "started", { attempt });
        let authored: CompositionAuthorResult | undefined;
        let rejection: { code: CompositionGenerationErrorCode; html: string; issues: readonly CompositionCorrectionIssue[] } | undefined;
        let requestId: string | undefined;
        try {
          authored = await trace.run("compile.html.author", () => dependencies.author(command, blocks, correction));
          requestId = authored.ai.requestId;
        } catch (error) {
          if (!(error instanceof CompositionAuthorError) || error.html === undefined || HTML_ISSUE_CODES[error.issueCode] !== true) throw error;
          requestId = error.requestId;
          rejection = { code: error.code, html: error.html, issues: [{ code: error.issueCode, message: error.message }] };
        }
        const attemptTrace = processTrace({
          projectId: command.projectId,
          requestId,
          sourceFile: "apps/backend/src/application/video-engine/compile.ts",
        });
        attemptTrace.event("compile.html.attempt", authored ? "completed" : "rejected", { attempt });
        if (authored) {
          try {
            assertCompositionHtml(authored.html, command.spec, frameSizeFor(command.spec.format.aspectRatio, command.resolution));
          } catch (error) {
            if (!(error instanceof CompositionAuthorError) || HTML_ISSUE_CODES[error.issueCode] !== true) throw error;
            rejection = { code: error.code, html: authored.html, issues: [{ code: error.issueCode, message: error.message }] };
          }
          if (!rejection) {
            const candidate = buildComposition({
              html: authored.html,
              spec: command.spec,
              designPack: command.designPack.manifest,
              assets: command.assets,
              blocks,
              resolution: command.resolution,
              language: command.language,
            });
            await attemptTrace.run("compile.artifact.clean", () => rm(artifactDir, { recursive: true, force: true }));
            await attemptTrace.run("compile.artifact.write", () => dependencies.write(candidate, artifactDir));
            try {
              await attemptTrace.run("compile.visual.check", () => dependencies.gate.check({ dir: artifactDir, spec: command.spec, resolution: command.resolution }));
            } catch (error) {
              const issues = authoredVisualIssues(error);
              if (!issues) throw error;
              rejection = { code: "composition_visual_check_failed", html: authored.html, issues };
            }
            if (!rejection) {
              compiled = candidate;
              ai = authored.ai;
              break;
            }
          }
        }
        if (!rejection) throw new Error("Composition author did not produce a document or a validation result.");
        const issueCodes = rejection.issues.map((issue) => issue.code);
        attemptTrace.event("compile.html.validation", "rejected", { attempt, issueCodes });
        if (attempt >= 3) {
          throw new CompositionGenerationError(rejection.code, "The generated composition did not pass validation.", issueCodes, attempt);
        }
        correction = { previousHtml: rejection.html, issues: rejection.issues };
        attemptTrace.event("compile.html.correction", "scheduled", { attempt: attempt + 1, issueCodes });
      }

      const files = await trace.run("compile.artifact.package", () => readArtifactDirectory(artifactDir));
      const prefix = compositionArtifactPrefix(command.projectId, compiled.compositionHash);
      await trace.run("compile.artifact.upload", () => dependencies.artifactStore.write(prefix, { compositionHash: compiled.compositionHash, files }));

      return {
        compositionHash: compiled.compositionHash,
        prefix,
        moduleVersions: compiled.moduleVersions,
        assetHashes: Object.fromEntries(compiled.assets.map((asset) => [asset.path, asset.sha256])),
        catalogComponents: [...blocks.keys()],
        author: ai,
      };
    } finally {
      await trace.run("compile.scratch.cleanup", () => rm(scratchDir, { recursive: true, force: true }));
    }
  });
}

const HTML_ISSUE_CODES: Record<string, true> = {
  composition_html_invalid: true,
  html_document_invalid: true,
  html_root_invalid: true,
  html_scenes_invalid: true,
  html_resource_external: true,
};

const AUTHORED_VISUAL_ISSUE_CODES: Record<string, true> = {
  content_zone_missing: true,
  module_out_of_zone: true,
  important_text_missing: true,
  text_out_of_frame: true,
  text_overflow: true,
  text_clipped: true,
  important_image_missing: true,
  text_overlap: true,
  image_text_overlap: true,
  blank_boundary: true,
  scene_missing: true,
};

function authoredVisualIssues(error: unknown): readonly CompositionCorrectionIssue[] | undefined {
  if (error instanceof HyperframesContentError) return error.findings.length ? error.findings : undefined;
  if (error instanceof CompositionVisualCheckError && error.issues.length &&
      error.issues.every((issue) => AUTHORED_VISUAL_ISSUE_CODES[issue.code] === true)) return error.issues;
  return undefined;
}

/** Every file the writer placed, keyed by its path inside the artifact, sorted for a stable manifest. */
export async function readArtifactDirectory(artifactDir: string): Promise<ArtifactFile[]> {
  const files: ArtifactFile[] = [];

  async function walk(directory: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await walk(path);
      else files.push({ path: relative(artifactDir, path).split("\\").join("/"), bytes: await readFile(path) });
    }
  }

  await walk(artifactDir);
  return files.sort((left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0));
}

async function defaultScratchDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), "visuala-compose-"));
}

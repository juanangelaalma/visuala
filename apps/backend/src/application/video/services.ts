import { mkdtemp, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { createAIService } from "../ai-service/services";
import { createSupabaseServiceRoleClient } from "../../infrastructure/supabase/clients";
import { SupabaseAssetObjectStore, readAssetBucket } from "../../infrastructure/ai-service/supabase-asset-object-store";
import { SupabaseVideoProjectRepository } from "../../infrastructure/video/supabase-video-project-repository";
import { SupabaseProjectAssetRepository } from "../../infrastructure/video/supabase-project-asset-repository";
import { SupabaseVideoMessageRepository } from "../../infrastructure/video/supabase-video-message-repository";
import { SupabaseVideoBriefRevisionRepository } from "../../infrastructure/video/supabase-video-revision-repositories";
import { createSupabaseSignedUrlFactory } from "../../infrastructure/video/supabase-signed-urls";
import { SupabaseArtDirectionRevisionRepository, SupabaseCompositionArtifactRepository, SupabaseCompositionEventRepository, SupabaseCompositionRevisionRepository } from "../../infrastructure/video-engine/supabase-composition-repositories";
import { SupabaseRenderJobRepository, SupabaseVideoVersionRepository } from "../../infrastructure/video-engine/supabase-render-repositories";
import { SupabaseCompositionArtifactStore } from "../../infrastructure/video-engine/composition-artifact-store";
import { createCatalogInstaller } from "../../infrastructure/video-engine/catalog-installer";
import { createHyperframesCli } from "../../infrastructure/video-engine/hyperframes-cli";
import { createCompositionVisualGate } from "../../infrastructure/video-engine/composition-visual-check";
import { createFsCatalogSource } from "../../infrastructure/video-engine/fs-catalog-source";
import { createFsDesignPackSource } from "../../infrastructure/video-engine/fs-design-pack-source";
import { gsapScriptPath, resolveFontFile } from "../../infrastructure/video-engine/font-file";
import { HyperFramesRenderEngine } from "../../infrastructure/video-engine/hyperframes-render-engine";
import { writeComposition } from "../../infrastructure/video-engine/composition-writer";
import { readAssetLimits } from "../../domain/video/limits";
import { COMPOSITION_FPS } from "../../domain/video-engine/composition";
import { readRenderWorkerConfig } from "../../infrastructure/video-engine/render-worker-config";
import { VIDEO_AI_SCHEMAS } from "./ai-schemas";
import { VIDEO_ENGINE_AI_SCHEMAS } from "../video-engine/ai-schemas";
import { compileComposition } from "../video-engine/compile";
import { runComposition } from "../video-engine/compose";
import { runRenderJob } from "../video-engine/render-job";
import type { ComposeDependencies } from "../video-engine/compose";
import type { RenderJobDependencies } from "../video-engine/render-job";
import type { VideoConversationDependencies } from "./conversation";
import type { ProjectDependencies } from "./projects";
import type { ProjectAssetRepository, VideoBriefRevisionRepository, VideoMessageRepository } from "../../domain/video/contracts";

/** This module is the single place the video application layer is allowed to construct infrastructure. */

const OUTPUT_QUALITY = { preview: "draft", final: "high" } as const;

function videoVersionObjectKey(projectId: string, versionId: string): string {
  return `video-versions/${projectId}/${versionId}.mp4`;
}

/**
 * The chat turn's dependencies: the video repositories plus the AI service, with the interview's
 * structured-output schema registered so the adapter can hand it to the provider.
 */
export function createVideoConversationServices(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): VideoConversationDependencies {
  const supabase = createSupabaseServiceRoleClient(environment);

  return {
    projects: new SupabaseVideoProjectRepository(supabase),
    assets: new SupabaseProjectAssetRepository(supabase),
    messages: new SupabaseVideoMessageRepository(supabase),
    briefRevisions: new SupabaseVideoBriefRevisionRepository(supabase),
    ai: createAIService({ environment, schemas: VIDEO_AI_SCHEMAS }),
    createId: () => crypto.randomUUID(),
  };
}

/** Everything a request-scoped use case needs: the repositories, the object store, and short-lived URLs. */
export function createVideoProjectServices(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): ProjectDependencies & {
  assets: ProjectAssetRepository;
  limits: ReturnType<typeof readAssetLimits>;
  signedUrl: (objectKey: string) => Promise<string | null>;
  messages: VideoMessageRepository;
  briefRevisions: VideoBriefRevisionRepository;
  versions: SupabaseVideoVersionRepository;
  jobs: SupabaseRenderJobRepository;
  artDirectionRevisions: SupabaseArtDirectionRevisionRepository;
  compositionRevisions: SupabaseCompositionRevisionRepository;
  artifacts: SupabaseCompositionArtifactRepository;
  events: SupabaseCompositionEventRepository;
  objectStore: SupabaseAssetObjectStore;
  /** The frame rate intake freezes into a job, so a queued job renders at the rate it was planned at. */
  fps: number;
} {
  const supabase = createSupabaseServiceRoleClient(environment);
  const bucket = readAssetBucket(environment);

  return {
    projects: new SupabaseVideoProjectRepository(supabase),
    assets: new SupabaseProjectAssetRepository(supabase),
    messages: new SupabaseVideoMessageRepository(supabase),
    briefRevisions: new SupabaseVideoBriefRevisionRepository(supabase),
    versions: new SupabaseVideoVersionRepository(supabase),
    jobs: new SupabaseRenderJobRepository(supabase),
    artDirectionRevisions: new SupabaseArtDirectionRevisionRepository(supabase),
    compositionRevisions: new SupabaseCompositionRevisionRepository(supabase),
    artifacts: new SupabaseCompositionArtifactRepository(supabase),
    events: new SupabaseCompositionEventRepository(supabase),
    objectStore: new SupabaseAssetObjectStore(supabase, bucket),
    limits: readAssetLimits(environment),
    createId: () => crypto.randomUUID(),
    signedUrl: createSupabaseSignedUrlFactory(supabase, bucket),
    fps: COMPOSITION_FPS,
  };
}

/** The compose endpoint: the request repositories plus the planner, the catalog, and the compiler. */
export function createComposeServices(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): ComposeDependencies {
  const supabase = createSupabaseServiceRoleClient(environment);
  const bucket = readAssetBucket(environment);
  const objectStore = new SupabaseAssetObjectStore(supabase, bucket);
  const artifactStore = new SupabaseCompositionArtifactStore(supabase, bucket);
  const cli = createHyperframesCli();
  const gate = createCompositionVisualGate({
    cli,
    ...(environment.HYPERFRAMES_BROWSER_PATH ? { browserPath: environment.HYPERFRAMES_BROWSER_PATH } : {}),
    disableGpu: environment.PRODUCER_DISABLE_GPU !== "false",
  });

  return {
    projects: new SupabaseVideoProjectRepository(supabase),
    assets: new SupabaseProjectAssetRepository(supabase),
    briefRevisions: new SupabaseVideoBriefRevisionRepository(supabase),
    artDirectionRevisions: new SupabaseArtDirectionRevisionRepository(supabase),
    compositionRevisions: new SupabaseCompositionRevisionRepository(supabase),
    artifacts: new SupabaseCompositionArtifactRepository(supabase),
    events: new SupabaseCompositionEventRepository(supabase),
    ai: createAIService({ environment, schemas: VIDEO_ENGINE_AI_SCHEMAS }),
    designPack: createFsDesignPackSource(),
    loadCatalog: () => createFsCatalogSource().load(),
    createId: () => crypto.randomUUID(),
    compile: (command) =>
      compileComposition(command, {
        installer: createCatalogInstaller({ cli }),
        gate,
        artifactStore,
        write: (compiled, targetDir) =>
          writeComposition(compiled, targetDir, {
            objectStore,
            gsapScriptPath: gsapScriptPath(),
            resolveFontFile,
          }),
      }),
  };
}

/** The render worker: the engine, the artifact reader, and the upload path. */
export function createRenderWorkerServices(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): RenderJobDependencies {
  const supabase = createSupabaseServiceRoleClient(environment);
  const bucket = readAssetBucket(environment);
  const objectStore = new SupabaseAssetObjectStore(supabase, bucket);

  return {
    jobs: new SupabaseRenderJobRepository(supabase),
    versions: new SupabaseVideoVersionRepository(supabase),
    artifacts: new SupabaseCompositionArtifactRepository(supabase),
    events: new SupabaseCompositionEventRepository(supabase),
    artifactStore: new SupabaseCompositionArtifactStore(supabase, bucket),
    materialize: materializeArtifactFiles,
    engine: new HyperFramesRenderEngine(readRenderWorkerConfig(environment).engine),
    upload: (objectKey, bytes, mimeType) => objectStore.write(objectKey, bytes, mimeType),
    readOutput: (path) => readFile(path),
    createScratchDir: () => mkdtemp(join(readRenderWorkerConfig(environment).workRoot ?? tmpdir(), "visuala-render-")),
    removeScratchDir: (dir) => rm(dir, { recursive: true, force: true }),
    outputKey: videoVersionObjectKey,
    createId: () => crypto.randomUUID(),
    qualityFor: (kind) => OUTPUT_QUALITY[kind],
    maxArtifactFileBytes: 64 * 1024 * 1024,
  };
}

export { runComposition, runRenderJob };

/** Writes a downloaded artifact back to disk in the layout the renderer reads. */
async function materializeArtifactFiles(files: readonly { path: string; bytes: Uint8Array }[], targetDir: string): Promise<void> {
  for (const file of files) {
    const destination = join(targetDir, file.path);
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, file.bytes);
  }
}

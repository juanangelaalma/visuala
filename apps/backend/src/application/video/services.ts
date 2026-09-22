import { createAIService } from "../ai-service/services";
import { createSupabaseServiceRoleClient } from "../../infrastructure/supabase/clients";
import { SupabaseAssetObjectStore, readAssetBucket } from "../../infrastructure/ai-service/supabase-asset-object-store";
import { SupabaseVideoProjectRepository } from "../../infrastructure/video/supabase-video-project-repository";
import { SupabaseProjectAssetRepository } from "../../infrastructure/video/supabase-project-asset-repository";
import { SupabaseVideoMessageRepository } from "../../infrastructure/video/supabase-video-message-repository";
import { SupabaseVideoBriefRevisionRepository, SupabaseVideoStoryboardRevisionRepository } from "../../infrastructure/video/supabase-video-revision-repositories";
import { SupabaseVideoVersionRepository } from "../../infrastructure/video/supabase-version-repository";
import { SupabaseRenderJobRepository } from "../../infrastructure/video/supabase-render-job-repository";
import { createSupabaseSignedUrlFactory } from "../../infrastructure/video/supabase-signed-urls";
import { readAssetLimits } from "../../domain/video/limits";
import type { ProjectAssetRepository, VideoBriefRevisionRepository, VideoMessageRepository, VideoRenderJobRepository, VideoStoryboardRevisionRepository, VideoVersionRepository } from "../../domain/video/contracts";
import { VIDEO_AI_SCHEMAS } from "./ai-schemas";
import type { VideoConversationDependencies } from "./conversation";
import type { ProjectDependencies } from "./projects";

/** This module is the single place the video application layer is allowed to construct infrastructure. */

/**
 * Approval reads the project it is moving, the latest brief revision, and the latest storyboard
 * revision, and it stamps the snapshot from the server clock — never from client input.
 */
export function createVideoApprovalServices(
  environment: Readonly<Record<string, string | undefined>> = process.env,
) {
  const supabase = createSupabaseServiceRoleClient(environment);

  return {
    projects: new SupabaseVideoProjectRepository(supabase),
    briefRevisions: new SupabaseVideoBriefRevisionRepository(supabase),
    storyboardRevisions: new SupabaseVideoStoryboardRevisionRepository(supabase),
    now: () => new Date().toISOString(),
  };
}

/**
 * The chat turn's dependencies: the video repositories plus the AI service, with the video
 * orchestrator's structured-output schemas registered so the adapter can hand them to the provider.
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
    storyboardRevisions: new SupabaseVideoStoryboardRevisionRepository(supabase),
    ai: createAIService({ environment, schemas: VIDEO_AI_SCHEMAS }),
    createId: () => crypto.randomUUID(),
  };
}

/** The project, asset, message, revision, render job, and version repositories the video routes share. */
export function createVideoProjectServices(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): ProjectDependencies & {
  assets: ProjectAssetRepository;
  limits: ReturnType<typeof readAssetLimits>;
  signedUrl: (objectKey: string) => Promise<string | null>;
  messages: VideoMessageRepository;
  briefRevisions: VideoBriefRevisionRepository;
  storyboardRevisions: VideoStoryboardRevisionRepository;
  versions: VideoVersionRepository;
  /** The render job repository, named `jobs` because that is the key the render use cases depend on. */
  jobs: VideoRenderJobRepository;
} {
  const supabase = createSupabaseServiceRoleClient(environment);
  const bucket = readAssetBucket(environment);

  return {
    projects: new SupabaseVideoProjectRepository(supabase),
    assets: new SupabaseProjectAssetRepository(supabase),
    messages: new SupabaseVideoMessageRepository(supabase),
    briefRevisions: new SupabaseVideoBriefRevisionRepository(supabase),
    storyboardRevisions: new SupabaseVideoStoryboardRevisionRepository(supabase),
    versions: new SupabaseVideoVersionRepository(supabase),
    jobs: new SupabaseRenderJobRepository(supabase),
    objectStore: new SupabaseAssetObjectStore(supabase, bucket),
    limits: readAssetLimits(environment),
    createId: () => crypto.randomUUID(),
    signedUrl: createSupabaseSignedUrlFactory(supabase, bucket),
  };
}

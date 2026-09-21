import { createSupabaseServiceRoleClient } from "../../infrastructure/supabase/clients";
import { SupabaseAssetObjectStore, readAssetBucket } from "../../infrastructure/ai-service/supabase-asset-object-store";
import { SupabaseVideoProjectRepository } from "../../infrastructure/video/supabase-video-project-repository";
import { SupabaseProjectAssetRepository } from "../../infrastructure/video/supabase-project-asset-repository";
import { SupabaseVideoMessageRepository } from "../../infrastructure/video/supabase-video-message-repository";
import { SupabaseVideoBriefRevisionRepository, SupabaseVideoStoryboardRevisionRepository } from "../../infrastructure/video/supabase-video-revision-repositories";
import { SupabaseVideoVersionRepository } from "../../infrastructure/video/supabase-version-repository";
import { createSupabaseSignedUrlFactory } from "../../infrastructure/video/supabase-signed-urls";
import { readAssetLimits } from "../../domain/video/limits";
import type { ProjectAssetRepository, VideoBriefRevisionRepository, VideoMessageRepository, VideoStoryboardRevisionRepository } from "../../domain/video/contracts";
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

/** The project, asset, message, and revision repositories the project routes share. */
export function createVideoProjectServices(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): ProjectDependencies & {
  assets: ProjectAssetRepository;
  limits: ReturnType<typeof readAssetLimits>;
  signedUrl: (objectKey: string) => Promise<string>;
  messages: VideoMessageRepository;
  briefRevisions: VideoBriefRevisionRepository;
  storyboardRevisions: VideoStoryboardRevisionRepository;
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
    objectStore: new SupabaseAssetObjectStore(supabase, bucket),
    limits: readAssetLimits(environment),
    createId: () => crypto.randomUUID(),
    signedUrl: createSupabaseSignedUrlFactory(supabase, bucket),
  };
}

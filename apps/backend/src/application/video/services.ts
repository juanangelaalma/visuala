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

/** The single place the video application layer is allowed to construct infrastructure. */
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

import { createSupabaseServiceRoleClient } from "../../infrastructure/supabase/clients";
import { SupabaseAssetObjectStore, readAssetBucket } from "../../infrastructure/ai-service/supabase-asset-object-store";
import { SupabaseVideoProjectRepository } from "../../infrastructure/video/supabase-video-project-repository";
import { SupabaseProjectAssetRepository } from "../../infrastructure/video/supabase-project-asset-repository";
import { SupabaseVideoVersionRepository } from "../../infrastructure/video/supabase-version-repository";
import { createSupabaseSignedUrlFactory } from "../../infrastructure/video/supabase-signed-urls";
import { readAssetLimits } from "../../domain/video/limits";
import type { ProjectAssetRepository } from "../../domain/video/contracts";
import type { ProjectDependencies } from "./projects";

/** The single place the video application layer is allowed to construct infrastructure. */
export function createVideoProjectServices(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): ProjectDependencies & { assets: ProjectAssetRepository; limits: ReturnType<typeof readAssetLimits>; signedUrl: (objectKey: string) => Promise<string> } {
  const supabase = createSupabaseServiceRoleClient(environment);
  const bucket = readAssetBucket(environment);

  return {
    projects: new SupabaseVideoProjectRepository(supabase),
    assets: new SupabaseProjectAssetRepository(supabase),
    versions: new SupabaseVideoVersionRepository(supabase),
    objectStore: new SupabaseAssetObjectStore(supabase, bucket),
    limits: readAssetLimits(environment),
    createId: () => crypto.randomUUID(),
    signedUrl: createSupabaseSignedUrlFactory(supabase, bucket),
  };
}

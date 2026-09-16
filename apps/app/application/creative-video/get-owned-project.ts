import type { CreativeVideoRepository } from "@/domain/creative-video/contracts";

export function getOwnedCreativeProject(
  projects: CreativeVideoRepository,
  projectId: string,
  userId: string,
) {
  return projects.getOwnedProject(projectId, userId);
}

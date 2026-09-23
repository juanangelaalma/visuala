import { VideoWorkspace } from "@/features/video/components/VideoWorkspace";

type VideoWorkspacePageProps = {
  params: Promise<{ projectId: string }>;
};

export default async function VideoWorkspacePage({ params }: VideoWorkspacePageProps) {
  const { projectId } = await params;
  return <VideoWorkspace projectId={projectId} />;
}

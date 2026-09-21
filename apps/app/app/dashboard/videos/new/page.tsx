import { VideoSetupForm } from "@/features/video/components/VideoSetupForm";
import { requireUser } from "@/lib/auth/session";

export const metadata = { title: "Video baru" };

export default async function NewVideoProjectPage() {
  await requireUser();

  return <VideoSetupForm />;
}

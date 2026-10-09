import { CreateCampaign } from "@/features/fnb/CreateCampaign";
import { requireUser } from "@/lib/auth/session";

export default async function NewVideoPage() {
  const user = await requireUser();
  return <CreateCampaign userId={user.id} />;
}

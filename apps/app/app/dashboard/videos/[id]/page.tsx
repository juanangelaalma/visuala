import { notFound } from "next/navigation";
import { CampaignEditor } from "@/features/fnb/CampaignEditor";

export default async function CampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(id)) notFound();
  return <CampaignEditor campaignId={id} />;
}

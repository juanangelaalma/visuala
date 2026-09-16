import { getOwnedCreativeProject } from "@/application/creative-video/get-owned-project";
import { createCreativeVideoServices } from "@/application/creative-video/services";

type StatusContext = { params: Promise<{ projectId: string }> };

export async function GET(request: Request, { params }: StatusContext) {
  try {
    return await getStatusResponse(request, await params);
  } catch (error) {
    console.error("Failed to load creative project status", { name: error instanceof Error ? error.name : "UnknownError" });
    return Response.json({ error: "Could not load creative project status." }, { status: 500 });
  }
}

async function getStatusResponse(request: Request, { projectId }: { projectId: string }) {
  const services = await createCreativeVideoServices();
  const user = await services.authProvider.getCurrentUser();
  if (!user) return Response.json({ error: "Sign in to continue." }, { status: 401 });
  const revisionValue = new URL(request.url).searchParams.get("revision");
  const clientRevision = parseRevision(revisionValue);
  if (revisionValue !== null && clientRevision === null) return Response.json({ error: "Invalid project revision." }, { status: 400 });
  const aggregate = await getOwnedCreativeProject(services.projects, projectId, user.id);
  if (!aggregate) return Response.json({ error: "Creative project not found." }, { status: 404 });
  const { revision, state, updatedAt } = aggregate.project;
  const status = { projectId, revision, state, updatedAt };
  return Response.json(clientRevision === revision ? status : { ...status, aggregate }, { headers: { "Cache-Control": "private, no-store" } });
}

function parseRevision(value: string | null) {
  if (value === null || !/^\d+$/.test(value)) return null;
  return Number(value);
}

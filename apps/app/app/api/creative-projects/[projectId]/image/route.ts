import { getOwnedCreativeProjectImage } from "@/application/creative-video/get-owned-project-image";
import { createCreativeVideoServices } from "@/application/creative-video/services";

type ImageContext = { params: Promise<{ projectId: string }> };

export async function GET(_: Request, { params }: ImageContext) {
  try {
    return await getImageResponse(await params);
  } catch (error) {
    console.error("Failed to load creative project image", { name: error instanceof Error ? error.name : "UnknownError" });
    return Response.json({ error: "Could not load project image." }, { status: 500 });
  }
}

async function getImageResponse({ projectId }: { projectId: string }) {
  const services = await createCreativeVideoServices();
  const user = await services.authProvider.getCurrentUser();
  if (!user) return Response.json({ error: "Sign in to continue." }, { status: 401 });
  const image = await getOwnedCreativeProjectImage({ projects: services.projects, assets: services.projectAssets }, { projectId, userId: user.id });
  if (!image) return Response.json({ error: "Creative project not found." }, { status: 404 });
  const body = image.bytes.buffer.slice(image.bytes.byteOffset, image.bytes.byteOffset + image.bytes.byteLength) as ArrayBuffer;
  return new Response(body, { headers: { "Content-Type": image.mimeType, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
}

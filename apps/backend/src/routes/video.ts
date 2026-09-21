import { Elysia, t } from "elysia";
import { z } from "zod";
import { deleteProjectAsset, listProjectAssets, registerProjectAsset } from "@/application/video/assets";
import { appendVideoMessage, listVideoMessages, toMessageResponse } from "@/application/video/messages";
import { createVideoProject, deleteVideoProject, getVideoProject, listVideoProjects, toProjectResponse } from "@/application/video/projects";
import { createVideoProjectServices } from "@/application/video/services";
import { MAX_ASSET_BYTES } from "@/domain/ai-service/assets";
import { VideoError } from "@/domain/video/errors";
import { authPlugin } from "@/plugins/supabase";
import { VIDEO_ASSET_MIME_TYPES, createVideoProjectBodySchema } from "@/schemas/video";

const invalidRequest = { error: "Invalid request." } as const;
const jsonBody = { body: t.Unknown() } as const;
const INVALID_ASSET_MESSAGE = "Upload a valid JPEG, PNG, or WebP image up to 10 MB.";
const DECLARED_MIME_TYPES = new Set<string>(VIDEO_ASSET_MIME_TYPES);

/** `role`, `user_id`, and `created_at` are server-owned, so a strict body refuses them outright. */
const appendMessageBodySchema = z.object({
  content: z.string(),
  assetIds: z.array(z.string().uuid()).optional(),
}).strict();

function invalidAsset(): VideoError {
  return new VideoError("video_asset_invalid", INVALID_ASSET_MESSAGE);
}

export const videoProjectRoutes = new Elysia({ name: "video-project-routes" })
  .use(authPlugin)
  .post(
    "/video-projects",
    async ({ body, status, user, set }) => {
      const parsed = createVideoProjectBodySchema.safeParse(body);
      if (!parsed.success) return status(422, invalidRequest);

      const project = await createVideoProject({ userId: user.id, ...parsed.data }, createVideoProjectServices());
      set.status = 201;
      return { project: toProjectResponse(project) };
    },
    { auth: true, ...jsonBody, detail: { tags: ["video"] } },
  )
  .get(
    "/video-projects",
    async ({ user }) => {
      const projects = await listVideoProjects(user.id, createVideoProjectServices());
      return { projects: projects.map(toProjectResponse) };
    },
    { auth: true, detail: { tags: ["video"] } },
  )
  .get(
    "/video-projects/:projectId",
    async ({ params, user }) => {
      const project = await getVideoProject(params.projectId, user.id, createVideoProjectServices());
      return { project: toProjectResponse(project) };
    },
    { auth: true, detail: { tags: ["video"] } },
  )
  .delete(
    "/video-projects/:projectId",
    async ({ params, user }) => deleteVideoProject(params.projectId, user.id, createVideoProjectServices()),
    { auth: true, detail: { tags: ["video"] } },
  )
  .post(
    "/video-projects/:projectId/messages",
    async ({ body, params, set, status, user }) => {
      const parsed = appendMessageBodySchema.safeParse(body);
      if (!parsed.success) return status(422, invalidRequest);

      const { message, project } = await appendVideoMessage(
        { userId: user.id, projectId: params.projectId, ...parsed.data },
        createVideoProjectServices(),
      );

      set.status = 201;
      return { message: toMessageResponse(message), project: toProjectResponse(project) };
    },
    { auth: true, ...jsonBody, detail: { tags: ["video"] } },
  )
  .get(
    "/video-projects/:projectId/messages",
    async ({ params, user }) => ({
      messages: await listVideoMessages({ userId: user.id, projectId: params.projectId }, createVideoProjectServices()),
    }),
    { auth: true, detail: { tags: ["video"] } },
  )
  .post(
    "/video-projects/:projectId/assets",
    async ({ params, request, set, user }) => {
      const declaredMimeType = request.headers.get("content-type")?.split(";")[0]?.trim() ?? "";
      if (!DECLARED_MIME_TYPES.has(declaredMimeType)) throw invalidAsset();

      const declaredLength = Number(request.headers.get("content-length") ?? Number.NaN);
      if (Number.isFinite(declaredLength) && declaredLength > MAX_ASSET_BYTES) throw invalidAsset();

      const rightsConfirmed = request.headers.get("x-asset-rights-confirmed") === "true";
      const bytes = new Uint8Array(await request.arrayBuffer());
      const asset = await registerProjectAsset(
        { userId: user.id, projectId: params.projectId, bytes, declaredMimeType, rightsConfirmed },
        createVideoProjectServices(),
      );

      set.status = 201;
      return { asset: { id: asset.id, mimeType: asset.mimeType, byteSize: asset.byteSize, width: asset.width, height: asset.height, moderationStatus: asset.moderationStatus } };
    },
    { auth: true, detail: { tags: ["video"] } },
  )
  .get(
    "/video-projects/:projectId/assets",
    async ({ params, user }) => ({ assets: await listProjectAssets({ userId: user.id, projectId: params.projectId }, createVideoProjectServices()) }),
    { auth: true, detail: { tags: ["video"] } },
  )
  .delete(
    "/video-projects/:projectId/assets/:assetId",
    async ({ params, user }) => {
      await deleteProjectAsset({ userId: user.id, projectId: params.projectId, assetId: params.assetId }, createVideoProjectServices());
      return { deleted: true };
    },
    { auth: true, detail: { tags: ["video"] } },
  );

import { Elysia, t } from "elysia";
import { z } from "zod";
import { approveVideoProject } from "@/application/video/approval";
import { deleteProjectAsset, listProjectAssets, registerProjectAsset } from "@/application/video/assets";
import { runVideoInterviewTurn } from "@/application/video/conversation";
import { listVideoMessages, toMessageResponse } from "@/application/video/messages";
import { createVideoProject, deleteVideoProject, getVideoProject, listVideoProjects, toProjectResponse } from "@/application/video/projects";
import { getLatestBriefRevision, getLatestStoryboardRevision } from "@/application/video/revisions";
import { cancelRenderJob, createRenderJob, getRenderJob, toRenderJobResponse } from "@/application/video/render-jobs";
import { createVideoApprovalServices, createVideoConversationServices, createVideoProjectServices } from "@/application/video/services";
import { createVersionDownloadUrl, listVideoVersions } from "@/application/video/versions";
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

/** `userId`, `status`, and the snapshot are server-owned, so a strict body refuses them outright. */
const createRenderJobBodySchema = z.object({
  idempotencyKey: z.string(),
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

      // One turn: the user's message, the interviewer's next question, and, when the brief is
      // finished, the brief and storyboard revisions that open the project for approval.
      const { message, reply, project } = await runVideoInterviewTurn(
        { userId: user.id, projectId: params.projectId, ...parsed.data },
        createVideoConversationServices(),
      );

      set.status = 201;
      return { message: toMessageResponse(message), reply: toMessageResponse(reply), project: toProjectResponse(project) };
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
  .get(
    "/video-projects/:projectId/brief",
    async ({ params, user }) => ({
      brief: await getLatestBriefRevision({ userId: user.id, projectId: params.projectId }, createVideoProjectServices()),
    }),
    { auth: true, detail: { tags: ["video"] } },
  )
  .get(
    "/video-projects/:projectId/storyboard",
    async ({ params, user }) => ({
      storyboard: await getLatestStoryboardRevision({ userId: user.id, projectId: params.projectId }, createVideoProjectServices()),
    }),
    { auth: true, detail: { tags: ["video"] } },
  )
  .post(
    "/video-projects/:projectId/approve",
    async ({ params, user }) => {
      const { project, approval } = await approveVideoProject(
        { userId: user.id, projectId: params.projectId },
        createVideoApprovalServices(),
      );
      return { project: toProjectResponse(project), approval };
    },
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
  )
  .post(
    "/video-projects/:projectId/render-jobs",
    async ({ body, params, set, status, user }) => {
      const parsed = createRenderJobBodySchema.safeParse(body);
      if (!parsed.success) return status(422, invalidRequest);

      const { job, created } = await createRenderJob(
        { userId: user.id, projectId: params.projectId, idempotencyKey: parsed.data.idempotencyKey },
        createVideoProjectServices(),
      );

      // A repeated idempotency key answers with the job the first request created; the status is
      // what tells the client whether this request is the one that queued it.
      set.status = created ? 201 : 200;
      return { job: toRenderJobResponse(job) };
    },
    { auth: true, ...jsonBody, detail: { tags: ["video"] } },
  )
  .get(
    "/video-projects/:projectId/render-jobs/:jobId",
    async ({ params, user }) => {
      const job = await getRenderJob({ userId: user.id, projectId: params.projectId, jobId: params.jobId }, createVideoProjectServices());
      return { job: toRenderJobResponse(job) };
    },
    { auth: true, detail: { tags: ["video"] } },
  )
  .post(
    "/video-projects/:projectId/render-jobs/:jobId/cancel",
    async ({ params, user }) => {
      const job = await cancelRenderJob({ userId: user.id, projectId: params.projectId, jobId: params.jobId }, createVideoProjectServices());
      return { job: toRenderJobResponse(job) };
    },
    { auth: true, detail: { tags: ["video"] } },
  )
  .get(
    "/video-projects/:projectId/versions",
    async ({ params, user }) => ({
      versions: await listVideoVersions({ userId: user.id, projectId: params.projectId }, createVideoProjectServices()),
    }),
    { auth: true, detail: { tags: ["video"] } },
  )
  .get(
    "/video-projects/:projectId/versions/:versionId/download",
    async ({ params, user }) => createVersionDownloadUrl(
      { userId: user.id, projectId: params.projectId, versionId: params.versionId },
      createVideoProjectServices(),
    ),
    { auth: true, detail: { tags: ["video"] } },
  );

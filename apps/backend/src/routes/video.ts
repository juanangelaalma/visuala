import { Elysia, t } from "elysia";
import { createVideoProject, deleteVideoProject, getVideoProject, listVideoProjects, toProjectResponse } from "@/application/video/projects";
import { createVideoProjectServices } from "@/application/video/services";
import { authPlugin } from "@/plugins/supabase";
import { createVideoProjectBodySchema } from "@/schemas/video";

const invalidRequest = { error: "Invalid request." } as const;
const jsonBody = { body: t.Unknown() } as const;

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
  );

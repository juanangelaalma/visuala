import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ api: vi.fn(), requireUser: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/infrastructure/supabase/server-client", () => ({ createSupabaseServerClient: vi.fn() }));
vi.mock("@/shared/config/env", () => ({ getAppEnv: () => ({ NEXT_PUBLIC_API_URL: "http://localhost:4000" }) }));
vi.mock("@/lib/auth/session", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/client")>();

  return { ...actual, apiFetch: mocks.api };
});

import { ApiError } from "@/lib/api/client";
import { getVideoRenderStatusAction } from "./get-video-render-status-action";

const PROJECT_ID = "33333333-3333-4333-8333-333333333333";
const PATH = `/video-projects/${PROJECT_ID}`;

const queuedJob = { id: "job-1", status: "queued", isRevision: false, attempts: 0, queuedAt: "2026-09-22T00:00:00.000Z", createdAt: "2026-09-22T00:00:00.000Z" };
const version = { id: "v-1", versionNumber: 1, durationSeconds: 6, aspectRatio: "9:16", resolution: "720p", createdAt: "2026-09-22T00:00:00.000Z", playbackUrl: "https://example.test/object" };

describe("getVideoRenderStatusAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUser.mockResolvedValue({ id: "user-1" });
    mocks.api.mockImplementation(async (path: string) => (path.endsWith("/render-jobs") ? { jobs: [queuedJob] } : { versions: [version] }));
  });

  it("authenticates before reading anything", async () => {
    await getVideoRenderStatusAction({ projectId: PROJECT_ID });
    expect(mocks.requireUser).toHaveBeenCalledOnce();
  });

  it("refreshes the whole panel in one round trip", async () => {
    const result = await getVideoRenderStatusAction({ projectId: PROJECT_ID });

    expect(mocks.api).toHaveBeenCalledWith(`${PATH}/render-jobs`);
    expect(mocks.api).toHaveBeenCalledWith(`${PATH}/versions`);
    expect(result.error).toBeUndefined();
    expect(result.status?.jobs).toEqual([queuedJob]);
    expect(result.status?.versions).toEqual([version]);
  });

  it("reports a payload the panel cannot render instead of rendering blanks", async () => {
    mocks.api.mockImplementation(async (path: string) => (path.endsWith("/render-jobs") ? { jobs: [{ id: "job-1", status: "almost" }] } : { versions: [] }));

    const result = await getVideoRenderStatusAction({ projectId: PROJECT_ID });

    expect(result).toEqual({ error: "Tidak dapat memuat status render." });
  });

  it("maps an unauthenticated backend answer to the sign-in message", async () => {
    mocks.api.mockRejectedValue(new ApiError(401, {}));

    await expect(getVideoRenderStatusAction({ projectId: PROJECT_ID })).resolves.toEqual({ error: "Masuk untuk melanjutkan." });
  });

  it("falls back to a safe message for an unexpected failure", async () => {
    mocks.api.mockRejectedValue(new Error("backend detail"));

    await expect(getVideoRenderStatusAction({ projectId: PROJECT_ID })).resolves.toEqual({ error: "Tidak dapat memuat status render." });
  });
});

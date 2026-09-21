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
import { createVideoProjectAction } from "./create-video-project-action";

function validForm() {
  const form = new FormData();
  const values = {
    title: "Es Kopi Gula Aren",
    videoType: "product_promo",
    styleId: "bold_pop",
    durationSeconds: "10",
    aspectRatio: "9:16",
    resolution: "1080p",
    language: "id",
    voiceOverEnabled: "true",
    musicEnabled: "false",
  };
  for (const [key, value] of Object.entries(values)) form.set(key, value);
  return form;
}

describe("createVideoProjectAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUser.mockResolvedValue({ id: "user-1" });
  });

  it("authenticates before rejecting an invalid form", async () => {
    expect(await createVideoProjectAction(new FormData())).toHaveProperty("error");
    expect(mocks.requireUser).toHaveBeenCalledOnce();
    expect(mocks.api).not.toHaveBeenCalled();
  });

  it("creates the project with the parsed settings and returns its id", async () => {
    mocks.api.mockResolvedValue({ project: { id: "project-1" } });

    expect(await createVideoProjectAction(validForm())).toEqual({ projectId: "project-1" });
    expect(mocks.api).toHaveBeenCalledWith("/video-projects", {
      method: "POST",
      body: {
        title: "Es Kopi Gula Aren",
        videoType: "product_promo",
        styleId: "bold_pop",
        settings: { durationSeconds: 10, aspectRatio: "9:16", resolution: "1080p", language: "id", voiceOverEnabled: true, musicEnabled: false },
      },
    });
  });

  it("surfaces the backend message", async () => {
    mocks.api.mockRejectedValue(new ApiError(422, { error: "The video settings are not supported." }));

    expect(await createVideoProjectAction(validForm())).toEqual({ error: "The video settings are not supported." });
  });

  it("asks the user to sign in when the session is missing", async () => {
    mocks.api.mockRejectedValue(new ApiError(401, { error: "Unauthorized." }));

    expect(await createVideoProjectAction(validForm())).toEqual({ error: "Masuk untuk melanjutkan." });
  });

  it("falls back to a safe message for unexpected failures", async () => {
    mocks.api.mockRejectedValue(new Error("backend detail"));

    expect(await createVideoProjectAction(validForm())).toEqual({ error: "Tidak dapat membuat proyek video." });
  });
});

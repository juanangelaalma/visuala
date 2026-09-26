import { describe, expect, it, vi } from "vitest";
import type { VideoMessage, VideoProject } from "../../domain/video/types";
import type { AIService } from "../../domain/ai-service/contracts";
import { openVideoInterview } from "./open-interview";

const userId = "11111111-1111-4111-8111-111111111111";
const projectId = "33333333-3333-4333-8333-333333333333";
const project = {
  id: projectId, userId, title: "Kopi", videoType: "product_promo", styleId: "bold_pop", status: "draft",
  settings: { durationSeconds: 10, aspectRatio: "9:16", resolution: "1080p", language: "id", voiceOverEnabled: true, musicEnabled: false },
  revisionRenderCount: 0, createdAt: "created", updatedAt: "updated",
} as VideoProject;
const turn = { question: "Siapa pembeli utama?", control: "single_select", options: [{ id: "one", label: "Mahasiswa", detail: null }, { id: "two", label: "Pekerja", detail: null }], recommendedOptionId: null, recommendationReason: null, targetFields: ["audience"], briefComplete: false };
const reply: VideoMessage = { id: projectId, projectId, userId, role: "assistant", content: turn.question, controls: turn, assetIds: [], createdAt: "created" };

function dependencies() {
  let stored: VideoMessage[] = [];
  const generateStructured = vi.fn(async (_request: unknown) => ({ data: { draft: {}, turn }, profileId: "primary", provider: "openai", model: "gpt", requestId: "req" }));
  return {
    projects: { getOwned: vi.fn(async (): Promise<VideoProject | null> => project) },
    messages: {
      listOwned: vi.fn(async () => stored),
      append: vi.fn(async () => { stored = [reply]; return reply; }),
    },
    assets: { listOwned: vi.fn(async () => []) },
    ai: { generateText: vi.fn(), generateStructured } as unknown as AIService,
    generateStructured,
    createId: () => "request-id",
  };
}

describe("openVideoInterview", () => {
  it("persists the AI question before the first user message and reuses it on retry", async () => {
    const deps = dependencies();
    const first = await openVideoInterview({ userId, projectId }, deps);
    const second = await openVideoInterview({ userId, projectId }, deps);
    expect(first[0]).toMatchObject({ role: "assistant", content: turn.question, controls: turn });
    expect(second).toEqual(first);
    expect(deps.messages.append).toHaveBeenCalledTimes(1);
    expect(deps.generateStructured.mock.calls[0]?.[0]).toMatchObject({ messages: [{ role: "user", content: expect.stringContaining("Begin the interview") }] });
  });

  it("does not append when a conversation already exists", async () => {
    const deps = dependencies();
    deps.messages.listOwned.mockResolvedValue([reply]);
    expect(await openVideoInterview({ userId, projectId }, deps)).toEqual([reply]);
    expect(deps.generateStructured).not.toHaveBeenCalled();
  });

  it("hides another user's project before calling AI", async () => {
    const deps = dependencies();
    deps.projects.getOwned.mockResolvedValue(null);
    await expect(openVideoInterview({ userId, projectId }, deps)).rejects.toMatchObject({ code: "video_project_not_found" });
    expect(deps.generateStructured).not.toHaveBeenCalled();
  });

  it("does not save a partial opening if AI fails", async () => {
    const deps = dependencies();
    deps.generateStructured.mockRejectedValue(new Error("offline"));
    await expect(openVideoInterview({ userId, projectId }, deps)).rejects.toThrow("offline");
    expect(deps.messages.append).not.toHaveBeenCalled();
  });

  it("returns the winner when two openings compete to insert", async () => {
    const deps = dependencies();
    deps.messages.listOwned.mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce([reply]);
    deps.messages.append.mockRejectedValue({ code: "23505" });
    expect(await openVideoInterview({ userId, projectId }, deps)).toEqual([reply]);
  });
});

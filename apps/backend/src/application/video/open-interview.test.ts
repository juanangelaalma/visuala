import { describe, expect, it, vi } from "vitest";
import type { VideoMessage, VideoProject } from "../../domain/video/types";
import type { AIService } from "../../domain/ai-service/contracts";
import type { GenerateStructuredRequest } from "../../domain/ai-service/types";
import type { InterviewTurn } from "../../domain/video/interview";
import { openVideoInterview } from "./open-interview";

const userId = "11111111-1111-4111-8111-111111111111";
const projectId = "33333333-3333-4333-8333-333333333333";
const project = {
  id: projectId, userId, title: "Kopi", videoType: "product_promo", styleId: "creative-mode", status: "draft",
  settings: { durationSeconds: 10, aspectRatio: "9:16", resolution: "1080p", language: "id", voiceOverEnabled: true, musicEnabled: false },
  revisionRenderCount: 0, createdAt: "created", updatedAt: "updated",
} as VideoProject;
const turn: InterviewTurn = { question: "Siapa pembeli utama?", control: "single_select", options: [{ id: "one", label: "Mahasiswa", detail: null }, { id: "two", label: "Pekerja", detail: null }], recommendedOptionId: null, recommendationReason: null, targetFields: ["audience"], briefComplete: false };
const reply: VideoMessage = { id: projectId, projectId, userId, role: "assistant", content: turn.question, controls: turn, assetIds: [], createdAt: "created" };

function structuredResult(turn: InterviewTurn | null) {
  return { data: { draft: {}, turn }, profileId: "primary", provider: "openai", model: "gpt", requestId: "req" };
}

function dependencies() {
  let stored: VideoMessage[] = [];
  const generateStructured = vi.fn(async (_request: Pick<GenerateStructuredRequest<unknown>, "onTextDelta" | "abortSignal">) => structuredResult(turn));
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

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

describe("openVideoInterview", () => {
  it("persists the AI question before the first user message and reuses it on retry", async () => {
    const deps = dependencies();
    const first = await openVideoInterview({ userId, projectId }, deps);
    const second = await openVideoInterview({ userId, projectId }, deps);
    expect(first[0]).toMatchObject({ role: "assistant", content: turn.question, controls: turn });
    expect(second).toEqual(first);
    expect(deps.messages.append).toHaveBeenCalledTimes(1);
  });

  it("replays an existing conversation without provisional text or generation", async () => {
    const deps = dependencies();
    const onQuestionDelta = vi.fn();
    deps.messages.listOwned.mockResolvedValue([reply]);

    expect(await openVideoInterview({ userId, projectId }, deps, { onQuestionDelta })).toEqual([reply]);
    expect(onQuestionDelta).not.toHaveBeenCalled();
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

  it("streams the opening while generation is pending and resolves only after saving", async () => {
    const deps = dependencies();
    const preview = deferred<void>();
    const releaseGeneration = deferred<void>();
    const saving = deferred<void>();
    const releaseSave = deferred<void>();
    const deltas: string[] = [];
    const generate = deps.generateStructured.getMockImplementation()!;
    deps.generateStructured.mockImplementation(async (request) => {
      request.onTextDelta?.('{"turn":{"question":"Siapa pembeli ');
      await releaseGeneration.promise;
      return generate(request);
    });
    deps.messages.append.mockImplementation(async () => {
      saving.resolve();
      await releaseSave.promise;
      return reply;
    });
    let settled = false;

    const pending = openVideoInterview(
      { userId, projectId },
      deps,
      { onQuestionDelta: (delta) => { deltas.push(delta); preview.resolve(); } },
    ).then((messages) => { settled = true; return messages; });

    await preview.promise;
    expect(deltas.join("")).toBe("Siapa pembeli ");
    expect(deps.messages.append).not.toHaveBeenCalled();
    expect(settled).toBe(false);
    releaseGeneration.resolve();
    await saving.promise;
    expect(settled).toBe(false);
    releaseSave.resolve();
    expect(await pending).toEqual([reply]);
  });

  it.each(["transcript recheck", "duplicate insertion"])("returns the saved winner after a streamed preview loses at %s", async (race) => {
    const deps = dependencies();
    const winner = { ...reply, content: "Apa tujuan videonya?", controls: { ...turn, question: "Apa tujuan videonya?", targetFields: ["objective"] } };
    const deltas: string[] = [];
    const generate = deps.generateStructured.getMockImplementation()!;
    deps.generateStructured.mockImplementation(async (request) => {
      request.onTextDelta?.(JSON.stringify({ turn: { question: turn.question } }));
      return generate(request);
    });
    if (race === "transcript recheck") {
      deps.messages.listOwned.mockResolvedValueOnce([]).mockResolvedValueOnce([winner]);
    } else {
      deps.messages.listOwned.mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce([winner]);
      deps.messages.append.mockRejectedValue({ code: "23505" });
    }

    const messages = await openVideoInterview(
      { userId, projectId },
      deps,
      { onQuestionDelta: (delta) => deltas.push(delta) },
    );

    expect(deltas.join("")).toBe(turn.question);
    expect(messages).toEqual([winner]);
    expect(messages[0]?.content).not.toBe(deltas.join(""));
  });

  it("does not begin an opening after cancellation", async () => {
    const deps = dependencies();
    const controller = new AbortController();
    controller.abort();

    await expect(openVideoInterview({ userId, projectId }, deps, { abortSignal: controller.signal }))
      .rejects.toMatchObject({ code: "AI_CANCELLED" });
    expect(deps.projects.getOwned).not.toHaveBeenCalled();
    expect(deps.messages.append).not.toHaveBeenCalled();
  });

  it("does not save an opening cancelled while checking for a competing transcript", async () => {
    const deps = dependencies();
    const controller = new AbortController();
    deps.messages.listOwned.mockResolvedValueOnce([]).mockImplementationOnce(async () => {
      controller.abort();
      return [];
    });

    await expect(openVideoInterview({ userId, projectId }, deps, { abortSignal: controller.signal }))
      .rejects.toMatchObject({ code: "AI_CANCELLED" });
    expect(deps.messages.append).not.toHaveBeenCalled();
  });

  it("discards a cancelled preview even if generation later returns valid output", async () => {
    const deps = dependencies();
    const controller = new AbortController();
    const preview = deferred<void>();
    const release = deferred<void>();
    const generate = deps.generateStructured.getMockImplementation()!;
    deps.generateStructured.mockImplementation(async (request) => {
      request.onTextDelta?.('{"turn":{"question":"Siapa pembeli ');
      await release.promise;
      return generate(request);
    });

    const pending = openVideoInterview(
      { userId, projectId },
      deps,
      { abortSignal: controller.signal, onQuestionDelta: () => preview.resolve() },
    );
    await preview.promise;
    controller.abort();
    release.resolve();

    await expect(pending).rejects.toMatchObject({ code: "AI_CANCELLED" });
    expect(deps.messages.append).not.toHaveBeenCalled();
  });

  it("rejects a valid preview if opening persistence fails", async () => {
    const deps = dependencies();
    const deltas: string[] = [];
    const generate = deps.generateStructured.getMockImplementation()!;
    deps.generateStructured.mockImplementation(async (request) => {
      request.onTextDelta?.(JSON.stringify({ turn: { question: turn.question } }));
      return generate(request);
    });
    deps.messages.append.mockRejectedValue(new Error("write failed"));

    await expect(openVideoInterview(
      { userId, projectId },
      deps,
      { onQuestionDelta: (delta) => deltas.push(delta) },
    )).rejects.toThrow("write failed");
    expect(deltas.join("")).toBe(turn.question);
  });

  it.each([false, true])("rejects an opening without a usable initial turn (completed: %s)", async (complete) => {
    const deps = dependencies();
    const deltas: string[] = [];
    deps.generateStructured.mockImplementation(async (request) => {
      request.onTextDelta?.(JSON.stringify({ turn: { question: turn.question } }));
      return structuredResult(complete ? { ...turn, briefComplete: true } : null);
    });

    await expect(openVideoInterview(
      { userId, projectId },
      deps,
      { onQuestionDelta: (delta) => deltas.push(delta) },
    )).rejects.toMatchObject({ code: "AI_INVALID_OUTPUT" });
    expect(deltas.join("")).toBe(turn.question);
    expect(deps.messages.append).not.toHaveBeenCalled();
  });
});

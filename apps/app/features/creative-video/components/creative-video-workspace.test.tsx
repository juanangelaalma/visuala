import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { CreativeProjectAggregate } from "@/domain/creative-video/types";
import { vi } from "vitest";
vi.mock("../actions/project-actions", () => ({ createCreativeProjectAction: vi.fn(), answerCreativeVideoAction: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), replace: vi.fn() }) }));
import CreativeVideoWorkspace from "./CreativeVideoWorkspace";

describe("CreativeVideoWorkspace", () => {
  it("renders analysis immediately after submit state", () => {
    const html = renderToStaticMarkup(<CreativeVideoWorkspace aggregate={aggregate("analyzing")} />);

    expect(html).toContain("Memahami produkmu");
    expect(html).toContain("Buat konten jualan");
  });

  it("renders one grouped clarification card", () => {
    const html = renderToStaticMarkup(<CreativeVideoWorkspace aggregate={aggregate("needs_input")} />);

    expect(html.match(/Jawab singkat/g)).toHaveLength(1);
  });

  it("renders three concepts and one recommendation", () => {
    const html = renderToStaticMarkup(<CreativeVideoWorkspace aggregate={aggregate("concepts_ready")} />);

    expect(html.match(/Pemilihan ide tersedia pada tahap preview berikutnya/g)).toHaveLength(3);
    expect(html.match(/Rekomendasi/g)).toHaveLength(1);
  });

  it("links mobile tabs to their tabpanels", () => {
    const html = renderToStaticMarkup(<CreativeVideoWorkspace aggregate={aggregate("analyzing")} />);

    expect(html).toContain('aria-controls="creative-chat-panel"');
    expect(html).toContain('aria-labelledby="creative-chat-tab"');
  });

  it("renders an authenticated image route for recovered projects", () => {
    const html = renderToStaticMarkup(<CreativeVideoWorkspace aggregate={aggregate("needs_input")} />);

    expect(html).toContain("/api/creative-projects/project-1/image");
    expect(html).not.toContain("objectKey");
  });

  it("renders the image for the initial analyzing aggregate", () => {
    const html = renderToStaticMarkup(<CreativeVideoWorkspace aggregate={aggregate("analyzing")} />);

    expect(html).toContain("/api/creative-projects/project-1/image");
  });
});

function aggregate(state: CreativeProjectAggregate["project"]["state"]): CreativeProjectAggregate {
  const concepts = state === "concepts_ready" ? [0, 1, 2].map((order) => ({
    id: `concept-${order}`, projectId: "project-1", briefSnapshotId: "brief-1", title: `Ide ${order + 1}`,
    hook: `Hook ${order + 1}`, angle: `Angle ${order + 1}`, sceneOutline: ["Satu", "Dua", "Tiga", "Empat"] as const,
    fitReason: "Cocok untuk promosi", recommendationReason: "Pesan paling jelas", recommended: order === 0,
    order, generation: { requestId: "request-1", promptVersion: "1", model: "fixture" }, createdAt: "2026-09-15T00:00:00.000Z",
  })) : [];
  return {
    project: { id: "project-1", userId: "user-1", createIdempotencyKey: "create-1", category: { id: "fnb", version: "1" }, state, revision: 2, assetId: "asset-1", activeConceptId: null, activeCompositionVersionId: null, failedStage: null, errorCode: null, previewGenerationCount: 0, previewQuota: 3, createdAt: "2026-09-15T00:00:00.000Z", updatedAt: "2026-09-15T00:01:00.000Z" },
    messages: [{ id: "message-1", projectId: "project-1", role: "user", kind: "brief", text: "Buat konten jualan", assetId: "asset-1", projectRevision: 0, idempotencyKey: "create-1", createdAt: "2026-09-15T00:00:00.000Z" }],
    brief: state === "needs_input" ? { id: "brief-1", projectId: "project-1", goal: "jual", product: "minuman", facts: [], assumptions: [], missingRequiredQuestions: ["Berapa diskonnya?", "Sampai kapan promonya?"], optionalQuestions: [], assetIds: ["asset-1"], pluginSchemaVersion: "1", sourceProjectRevision: 1, createdAt: "2026-09-15T00:01:00.000Z" } : null,
    concepts,
  };
}

import { Elysia, t } from "elysia";
import { registerAsset } from "@/application/ai-service/register-asset";
import { resolveOwnedAsset } from "@/application/ai-service/resolve-asset";
import { checkConfiguredAIService, createAIAssetServices, createAIService } from "@/application/ai-service/services";
import { MAX_ASSET_BYTES } from "@/domain/ai-service/assets";
import { AIError } from "@/domain/ai-service/errors";
import type { GenerateTextRequest } from "@/domain/ai-service/types";
import { authPlugin } from "@/plugins/supabase";
import { generateTextBodySchema } from "@/schemas/ai";

const invalidRequest = { error: "Invalid request." } as const;
const jsonBody = { body: t.Unknown() } as const;
const INVALID_ASSET_MESSAGE = "Upload a valid JPEG, PNG, or WebP image up to 10 MB.";
const DECLARED_MIME_TYPES = new Set<string>(["image/jpeg", "image/png", "image/webp"]);

function invalidAsset(): AIError {
  return new AIError({ code: "AI_INPUT_INVALID", safeMessage: INVALID_ASSET_MESSAGE, requestId: "asset", retryable: false });
}

export const aiRoutes = new Elysia({ name: "ai-routes" })
  .use(authPlugin)
  .post(
    "/ai/generate/text",
    async ({ body, status, user }) => {
      const parsed = generateTextBodySchema.safeParse(body);
      if (!parsed.success) return status(422, invalidRequest);

      const request: GenerateTextRequest = {
        requestId: crypto.randomUUID(),
        task: parsed.data.task,
        context: { userId: user.id, ...(parsed.data.projectId ? { projectId: parsed.data.projectId } : {}) },
        instructions: parsed.data.instructions,
        messages: parsed.data.messages,
        promptVersion: parsed.data.promptVersion,
      };

      return createAIService().generateText(request);
    },
    { auth: true, ...jsonBody, detail: { tags: ["ai"] } },
  )
  .post(
    "/ai/assets",
    async ({ request, set, user }) => {
      const declaredMimeType = request.headers.get("content-type")?.split(";")[0]?.trim() ?? "";
      if (!DECLARED_MIME_TYPES.has(declaredMimeType)) throw invalidAsset();

      const declaredLength = Number(request.headers.get("content-length") ?? Number.NaN);
      if (Number.isFinite(declaredLength) && declaredLength > MAX_ASSET_BYTES) throw invalidAsset();

      const bytes = new Uint8Array(await request.arrayBuffer());
      const { assetRepository, objectStore } = createAIAssetServices();
      const asset = await registerAsset(
        { userId: user.id, bytes, declaredMimeType },
        { repository: assetRepository, objectStore, createAssetId: () => crypto.randomUUID() },
      );

      set.status = 201;
      return {
        asset: {
          id: asset.id,
          mimeType: asset.mimeType,
          byteSize: asset.byteSize,
          width: asset.width,
          height: asset.height,
          sha256: asset.sha256,
          createdAt: asset.createdAt,
        },
      };
    },
    { auth: true, detail: { tags: ["ai"] } },
  )
  .get(
    "/ai/assets/:assetId",
    async ({ params, set, user }) => {
      const { assetRepository, objectStore } = createAIAssetServices();
      const resolved = await resolveOwnedAsset({ assetId: params.assetId, userId: user.id }, { repository: assetRepository, objectStore });

      set.headers["content-type"] = resolved.mimeType;
      set.headers["cache-control"] = "private, max-age=300";
      return resolved.bytes;
    },
    { auth: true, detail: { tags: ["ai"] } },
  )
  .get("/ai/config", () => checkConfiguredAIService(), { admin: true, detail: { tags: ["ai"] } });

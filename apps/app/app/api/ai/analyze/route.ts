import { randomUUID } from "node:crypto";
import { z } from "zod";
import { productSchema } from "@/domain/ai/types";
import { createAIService } from "@/infrastructure/ai-service/create-ai-service";
import { authenticated, failure } from "../_shared";

const requestSchema = z.object({ assetId: z.string().uuid() }).strict();
const instructions = "Analyze these product and marketplace images for an Indonesian affiliate video. Return JSON with exactly: name, description, category, audience, sellingPoint, offer, cta, keyMessage, concept. Do not invent unverifiable claims.";

export async function POST(request: Request) {
  try {
    const user = await authenticated();
    const { assetId } = requestSchema.parse(await request.json());
    const service = createAIService({ schemas: { "product@1": productSchema } });
    const result = await service.generateStructured({
      requestId: randomUUID(), task: "product_analysis", context: { userId: user.id }, instructions,
      messages: [{ role: "user", content: "Analyze the product shown in this asset.", assetId }],
      promptVersion: "product-analysis-v1", schema: { name: "product", version: "1", schema: productSchema },
    });
    return Response.json({ product: result.data });
  } catch (error) {
    return failure(error);
  }
}

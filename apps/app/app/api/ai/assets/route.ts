import { randomUUID } from "node:crypto";
import { registerAsset } from "@/application/ai-service/register-asset";
import { R2ObjectStore } from "@/infrastructure/ai-service/r2-object-store";
import { SupabaseAssetRepository } from "@/infrastructure/ai-service/supabase-asset-repository";
import { createSupabaseServiceRoleClient } from "@/infrastructure/supabase/service-role-client";
import { ApiError, authenticated, failure } from "../_shared";

export async function POST(request: Request) {
  try {
    const user = await authenticated();
    const form = await request.formData();
    const files = form.getAll("image").filter((value): value is File => value instanceof File);
    if (files.length !== 1) throw new ApiError(400, "INVALID_ASSET", "Upload one image.");
    const asset = await registerAsset(
      { userId: user.id, bytes: new Uint8Array(await files[0]!.arrayBuffer()), declaredMimeType: files[0]!.type },
      { repository: new SupabaseAssetRepository(createSupabaseServiceRoleClient()), objectStore: new R2ObjectStore(), createAssetId: randomUUID },
    );
    return Response.json({ asset: { id: asset.id, mimeType: asset.mimeType, byteSize: asset.byteSize, width: asset.width, height: asset.height } }, { status: 201 });
  } catch (error) {
    return failure(error);
  }
}

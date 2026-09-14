import { randomUUID } from "node:crypto";
import { storyboardRequestSchema } from "@/application/ai/schemas";
import { providerModelId } from "@/domain/ai/model-registry";
import { normalizeSceneDurations, storyboardSchema } from "@/domain/ai/types";
import { createAIService } from "@/infrastructure/ai-service/create-ai-service";
import { createSupabaseServiceRoleClient } from "@/infrastructure/supabase/service-role-client";
import { ApiError, authenticated, failure, sceneDto } from "../../_shared";

const sceneColumns = "id,position,title,scene_type,motion_complexity,image_prompt,video_prompt,negative_prompt,dialogue,duration_seconds";

export async function POST(request: Request) {
  try {
    const user = await authenticated();
    const key = request.headers.get("idempotency-key");
    if (!key || key.length < 8) {
      throw new ApiError(400, "IDEMPOTENCY_KEY_REQUIRED", "A valid Idempotency-Key is required");
    }

    const input = storyboardRequestSchema.parse(await request.json());
    const db = createSupabaseServiceRoleClient();
    const existing = await db
      .from("ai_projects")
      .select("id,status,duration_seconds,quality,created_at")
      .eq("user_id", user.id)
      .eq("idempotency_key", key)
      .maybeSingle();

    if (existing.data) {
      const scenes = await db.from("ai_scenes").select(sceneColumns).eq("project_id", existing.data.id).order("position");
      return Response.json({
        project: {
          id: existing.data.id,
          status: existing.data.status,
          durationSeconds: existing.data.duration_seconds,
          quality: existing.data.quality,
          createdAt: existing.data.created_at,
        },
        scenes: (scenes.data ?? []).map(sceneDto),
      });
    }

    const project = await db
      .from("ai_projects")
      .insert({
        user_id: user.id,
        product: input.product,
        creator: input.creator,
        duration_seconds: input.duration,
        quality: input.quality,
        reference_assets: input.referenceAssets,
        idempotency_key: key,
        status: "storyboard_processing",
      })
      .select()
      .single();

    if (project.error) {
      const raced = await db.from("ai_projects").select("id,status").eq("user_id", user.id).eq("idempotency_key", key).single();
      if (raced.error) throw project.error;
      return Response.json({ project: raced.data, scenes: [] }, { status: 202 });
    }

    const textGeneration = await db.from("ai_generations").insert({
      project_id: project.data.id,
      type: "text",
      logical_model_key: "text_brain_default",
      provider: "gemini",
      provider_model_id: providerModelId("text_brain_default"),
      status: "processing",
      credits_charged: 0,
      idempotency_key: `${key}:text`,
      attempt_number: 1,
      started_at: new Date().toISOString(),
    });
    if (textGeneration.error) throw textGeneration.error;

    try {
      const prompt = `Create a ${input.duration}s vertical 9:16 Indonesian UGC affiliate storyboard. Product: ${JSON.stringify(input.product)}. Creator: ${input.creator}. Return valid scenes with a shared visual style, imagePrompt, videoPrompt, negativePrompt, dialogue, and durations totaling ${input.duration}. Do not render promotional copy inside images.`;
      const generated = await createAIService({ schemas: { "storyboard@1": storyboardSchema } }).generateStructured({
        requestId: randomUUID(), task: "planner", context: { userId: user.id, projectId: project.data.id },
        instructions: prompt, messages: [{ role: "user", content: "Create the storyboard." }], promptVersion: "storyboard-v1",
        schema: { name: "storyboard", version: "1", schema: storyboardSchema },
      });
      const scenes = normalizeSceneDurations(generated.data.scenes, input.duration);
      const inserted = await db
        .from("ai_scenes")
        .insert(scenes.map((scene, position) => ({
          project_id: project.data.id,
          position,
          title: scene.title,
          scene_type: scene.sceneType,
          motion_complexity: scene.motionComplexity,
          image_prompt: scene.imagePrompt,
          video_prompt: scene.videoPrompt,
          negative_prompt: scene.negativePrompt,
          dialogue: scene.dialogue,
          duration_seconds: scene.duration,
        })))
        .select(sceneColumns);
      if (inserted.error) throw inserted.error;

      await db.from("ai_generations").update({ status: "succeeded", provider_response: null, completed_at: new Date().toISOString() }).eq("project_id", project.data.id).eq("type", "text");
      await db.from("ai_projects").update({ status: "storyboard_ready" }).eq("id", project.data.id);

      return Response.json({
        project: {
          id: project.data.id,
          status: "storyboard_ready",
          durationSeconds: project.data.duration_seconds,
          quality: project.data.quality,
          createdAt: project.data.created_at,
        },
        scenes: (inserted.data ?? []).map(sceneDto),
      }, { status: 201 });
    } catch (error) {
      await db.from("ai_generations").update({ status: "failed", error_code: "STORYBOARD_FAILED", error_message: "Storyboard generation failed", completed_at: new Date().toISOString() }).eq("project_id", project.data.id).eq("type", "text");
      await db.from("ai_projects").update({ status: "storyboard_failed" }).eq("id", project.data.id);
      throw error;
    }
  } catch (error) {
    return failure(error);
  }
}

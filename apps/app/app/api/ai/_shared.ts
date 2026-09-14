import { createAuthServices } from "@/application/auth/services";
import { AIError, type AIErrorCode } from "@/domain/ai-service/errors";
import { timingSafeEqual } from "node:crypto";
import { ZodError } from "zod";

export async function authenticated() {
  const { authProvider } = await createAuthServices();
  const user = await authProvider.getCurrentUser();
  if (!user) throw new ApiError(401, "AUTH_REQUIRED", "Authentication required");
  return user;
}

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

export function failure(error: unknown) {
  if (error instanceof ApiError) {
    return Response.json({ error: { code: error.code, message: error.message } }, { status: error.status });
  }
  if (error instanceof ZodError) {
    return Response.json({ error: { code: "INVALID_REQUEST", message: "Request validation failed" } }, { status: 400 });
  }
  if (error instanceof AIError) {
    const mapped = AI_ERROR_RESPONSES[error.code];
    return Response.json({ error: { code: error.code, message: mapped.message } }, { status: mapped.status });
  }
  if (error instanceof Error && error.message.includes("INSUFFICIENT_CREDITS")) {
    return Response.json({ error: { code: "INSUFFICIENT_CREDITS", message: "Insufficient credits" } }, { status: 402 });
  }
  return Response.json({ error: { code: "INTERNAL_ERROR", message: "The request could not be completed" } }, { status: 500 });
}

const AI_ERROR_RESPONSES: Record<AIErrorCode, { status: number; message: string }> = {
  AI_CONFIG_ERROR: { status: 503, message: "The AI service is not configured." },
  AI_CAPABILITY_UNSUPPORTED: { status: 422, message: "The requested AI operation is not supported." },
  AI_AUTH_ERROR: { status: 503, message: "The AI service is unavailable." },
  AI_RATE_LIMITED: { status: 429, message: "The AI service is busy. Try again later." },
  AI_TIMEOUT: { status: 504, message: "The AI request timed out." },
  AI_UNAVAILABLE: { status: 503, message: "The AI service is unavailable." },
  AI_INPUT_INVALID: { status: 400, message: "The AI input is invalid." },
  AI_INVALID_OUTPUT: { status: 502, message: "The AI service returned an invalid response." },
  AI_REFUSED: { status: 422, message: "The AI service could not complete this request." },
  AI_CANCELLED: { status: 499, message: "The AI request was cancelled." },
};

export function workerAuthorized(value: string | null, secret = process.env.AI_WORKER_SECRET) {
  if (!value || !secret) return false;
  const supplied = Buffer.from(value.replace(/^Bearer\s+/i, ""));
  const expected = Buffer.from(secret);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

export const generationDto = (row: {
  id: string;
  scene_id: string | null;
  type: string;
  status: string;
  output_assets: string[];
  error_code: string | null;
  created_at: string;
  completed_at: string | null;
}) => ({
  id: row.id,
  sceneId: row.scene_id,
  type: row.type,
  status: row.status,
  assets: row.output_assets,
  errorCode: row.error_code,
  createdAt: row.created_at,
  completedAt: row.completed_at,
});

export const sceneDto = (row: {
  id: string;
  position: number;
  title: string;
  scene_type: string;
  motion_complexity: string;
  image_prompt: string;
  video_prompt: string;
  negative_prompt: string;
  dialogue: string;
  duration_seconds: number;
  approved_image_generation_id?: string | null;
}) => ({
  id: row.id,
  position: row.position,
  title: row.title,
  sceneType: row.scene_type,
  motionComplexity: row.motion_complexity,
  imagePrompt: row.image_prompt,
  videoPrompt: row.video_prompt,
  negativePrompt: row.negative_prompt,
  dialogue: row.dialogue,
  durationSeconds: row.duration_seconds,
  approvedImageGenerationId: row.approved_image_generation_id ?? null,
});

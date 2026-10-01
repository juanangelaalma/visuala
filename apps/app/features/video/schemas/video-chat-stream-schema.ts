import { z } from "zod";
import { VIDEO_STYLE_IDS, VIDEO_TYPES } from "@/domain/video/settings";
import type { InterviewTurn, VideoMessage, VideoProject } from "@/domain/video/types";
import { outputSettingsSchema } from "./video-project-schema";

const interviewTurnSchema = z.object({
  question: z.string(),
  control: z.enum(["single_select", "multi_select", "free_text"]),
  options: z.array(z.object({
    id: z.string(),
    label: z.string(),
    detail: z.string().nullable(),
  })),
  recommendedOptionId: z.string().nullable(),
  recommendationReason: z.string().nullable(),
  targetFields: z.array(z.string()),
  briefComplete: z.boolean(),
}) satisfies z.ZodType<InterviewTurn>;

const videoChatMessageSchema = z.object({
  id: z.string(),
  role: z.enum(["user", "assistant"]),
  content: z.string(),
  assetIds: z.array(z.string()),
  controls: interviewTurnSchema.nullable(),
  createdAt: z.string(),
}) satisfies z.ZodType<VideoMessage>;

const userMessageSchema = videoChatMessageSchema.extend({
  role: z.literal("user"),
  controls: z.null(),
});
const assistantMessageSchema = videoChatMessageSchema.extend({ role: z.literal("assistant") });

const videoChatProjectSchema = z.object({
  id: z.string(),
  title: z.string(),
  videoType: z.enum(VIDEO_TYPES),
  styleId: z.enum(VIDEO_STYLE_IDS),
  status: z.enum(["draft", "interviewing", "awaiting_approval", "approved", "rendering", "ready", "revision_draft", "moderation_blocked", "failed", "deleted"]),
  settings: outputSettingsSchema,
  revisionRenderCount: z.number().int().nonnegative(),
  createdAt: z.string(),
  updatedAt: z.string(),
}) satisfies z.ZodType<VideoProject>;

export const videoMessagePersistedSchema = z.object({
  message: userMessageSchema,
  project: videoChatProjectSchema,
});
export const videoTextDeltaSchema = z.object({ delta: z.string() });
export const videoSendResultSchema = videoMessagePersistedSchema.extend({ reply: assistantMessageSchema });
export const videoOpeningResultSchema = z.object({
  messages: z.array(z.discriminatedUnion("role", [userMessageSchema, assistantMessageSchema])),
});

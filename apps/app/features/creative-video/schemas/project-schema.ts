import { z } from "zod";
import { MAX_ASSET_BYTES } from "@/domain/ai-service/assets";

const supportedImageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

export const createProjectSchema = z.object({
  prompt: z.string({ error: "Describe the video you want to create." }).trim().min(1, "Describe the video you want to create.").max(2_000, "Keep the prompt under 2,000 characters."),
  image: z.custom<File>((value) => value instanceof File, "Upload one product image.")
    .refine((file) => supportedImageTypes.has(file.type), "Upload a JPEG, PNG, or WebP image.")
    .refine((file) => file.size > 0 && file.size <= MAX_ASSET_BYTES, "Upload an image up to 10 MB."),
  idempotencyKey: z.string().uuid("Invalid project request."),
  categoryId: z.string().trim().min(1, "Select a Category."),
  categoryVersion: z.string().trim().min(1, "Select a Category version."),
}).strict();

export const answerClarificationSchema = z.object({
  answer: z.string({ error: "Answer the clarification question." }).trim().min(1, "Answer the clarification question.").max(2_000, "Keep the answer under 2,000 characters."),
  projectId: z.string().uuid("Invalid project request."),
  expectedRevision: z.coerce.number().int().nonnegative("Invalid project request."),
  idempotencyKey: z.string().uuid("Invalid project request."),
}).strict();

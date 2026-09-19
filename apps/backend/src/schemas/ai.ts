import { z } from "zod";

export const generateTextBodySchema = z.object({
  task: z.enum(["connection_test", "interviewer", "planner", "product_analysis"]),
  instructions: z.string().trim().min(1),
  promptVersion: z.string().trim().min(1),
  projectId: z.string().trim().min(1).optional(),
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().trim().min(1),
        assetId: z.string().uuid().optional(),
      }),
    )
    .min(1),
});

export type GenerateTextBody = z.infer<typeof generateTextBodySchema>;

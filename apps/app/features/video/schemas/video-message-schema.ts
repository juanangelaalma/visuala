import { z } from "zod";

/** Mirrors the backend's `char_length(content) between 1 and 4000` check on `video_messages.content`. */
export const videoMessageSchema = z
  .object({
    projectId: z.string().uuid("Proyek tidak valid."),
    content: z.string().trim().min(1, "Tulis pesan dulu.").max(4000, "Pesan maksimal 4000 karakter."),
  })
  .strict();

export type VideoMessageInput = z.infer<typeof videoMessageSchema>;

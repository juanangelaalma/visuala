import { z } from "zod";

export const emailSchema = z.object({
  email: z.string().trim().min(1, "Email is required.").email("Enter a valid email address."),
});

export const loginSchema = emailSchema.extend({
  password: z.string().min(1, "Password is required.").min(8, "Password must be at least 8 characters."),
});

export const registerSchema = loginSchema.extend({
  fullName: z.string().trim().max(80, "Full name must be 80 characters or less.").optional(),
});

export type EmailInput = z.infer<typeof emailSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;

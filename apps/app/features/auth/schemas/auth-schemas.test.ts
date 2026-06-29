import { describe, expect, it } from "vitest";
import { emailSchema, loginSchema, registerSchema } from "./auth-schemas";

describe("auth schemas", () => {
  it("accepts valid email input", () => {
    expect(emailSchema.safeParse({ email: "user@example.com" }).success).toBe(true);
  });

  it("accepts valid login input", () => {
    expect(loginSchema.safeParse({ email: "user@example.com", password: "password123" }).success).toBe(true);
  });

  it("rejects invalid login email", () => {
    const result = loginSchema.safeParse({ email: "invalid", password: "password123" });

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0]?.message).toBe("Enter a valid email address.");
  });

  it("rejects short login password", () => {
    const result = loginSchema.safeParse({ email: "user@example.com", password: "short" });

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0]?.message).toBe("Password must be at least 8 characters.");
  });

  it("accepts valid register input", () => {
    expect(registerSchema.safeParse({ email: "user@example.com", password: "password123", fullName: "Jane Creator" }).success).toBe(true);
  });

  it("rejects too long full name", () => {
    const result = registerSchema.safeParse({ email: "user@example.com", password: "password123", fullName: "a".repeat(81) });

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0]?.message).toBe("Full name must be 80 characters or less.");
  });
});

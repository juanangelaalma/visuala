import { afterEach, describe, expect, it, vi } from "vitest";

const required = {
  SUPABASE_URL: "https://project.supabase.co",
  SUPABASE_ANON_KEY: "anon",
  SUPABASE_SERVICE_ROLE_KEY: "secret",
};

async function loadIsAdminEmail(adminEmails: string) {
  vi.resetModules();
  vi.stubEnv("SUPABASE_URL", required.SUPABASE_URL);
  vi.stubEnv("SUPABASE_ANON_KEY", required.SUPABASE_ANON_KEY);
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", required.SUPABASE_SERVICE_ROLE_KEY);
  vi.stubEnv("ADMIN_EMAILS", adminEmails);

  const { isAdminEmail } = await import("./is-admin-email");
  return isAdminEmail;
}

describe("isAdminEmail", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("matches configured admin emails case-insensitively", async () => {
    const isAdminEmail = await loadIsAdminEmail(" Admin@Example.com , second@example.com ");

    expect(isAdminEmail("admin@example.com")).toBe(true);
    expect(isAdminEmail("  SECOND@EXAMPLE.COM  ")).toBe(true);
    expect(isAdminEmail("user@example.com")).toBe(false);
  });

  it("treats an empty configuration as having no admins", async () => {
    const isAdminEmail = await loadIsAdminEmail("");

    expect(isAdminEmail("admin@example.com")).toBe(false);
  });
});

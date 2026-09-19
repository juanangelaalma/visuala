import { afterEach, describe, expect, it, vi } from "vitest";
import { getEnv, readEnv } from "./env";

const required = {
  SUPABASE_URL: "https://project.supabase.co",
  SUPABASE_ANON_KEY: "anon",
  SUPABASE_SERVICE_ROLE_KEY: "secret",
};

describe("readEnv", () => {
  it("applies defaults for optional values", () => {
    expect(readEnv(required)).toEqual({
      PORT: 4000,
      APP_URL: "http://localhost:3000",
      CORS_ORIGIN: "http://localhost:3000",
      ADMIN_EMAILS: "",
      ...required,
    });
  });

  it("coerces and parses overrides", () => {
    const env = readEnv({ ...required, PORT: "5000", CORS_ORIGIN: "https://app.example.com", ADMIN_EMAILS: "admin@example.com" });

    expect(env).toMatchObject({ PORT: 5000, CORS_ORIGIN: "https://app.example.com", ADMIN_EMAILS: "admin@example.com" });
  });

  it("rejects a missing supabase url", () => {
    expect(() => readEnv({ ...required, SUPABASE_URL: undefined })).toThrow();
  });

  it("rejects a missing anon key", () => {
    expect(() => readEnv({ ...required, SUPABASE_ANON_KEY: "" })).toThrow();
  });
});

describe("getEnv", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("reads process env once and caches the parsed result", () => {
    vi.stubEnv("SUPABASE_URL", required.SUPABASE_URL);
    vi.stubEnv("SUPABASE_ANON_KEY", required.SUPABASE_ANON_KEY);
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", required.SUPABASE_SERVICE_ROLE_KEY);

    const env = getEnv();

    expect(env.SUPABASE_URL).toBe(required.SUPABASE_URL);
    expect(getEnv()).toBe(env);
  });
});

import { Elysia } from "elysia";
import { afterEach, describe, expect, it } from "vitest";
import { corsPlugin, isAllowedOrigin } from "./cors";

const originalOrigin = process.env.CORS_ORIGIN;

describe("cors plugin", () => {
  afterEach(() => {
    if (originalOrigin === undefined) delete process.env.CORS_ORIGIN;
    else process.env.CORS_ORIGIN = originalOrigin;
  });

  it("allows only the configured origin", () => {
    process.env.CORS_ORIGIN = "https://app.example.com";

    expect(isAllowedOrigin("https://app.example.com")).toBe(true);
    expect(isAllowedOrigin("https://evil.example.com")).toBe(false);
    expect(isAllowedOrigin(null)).toBe(false);
  });

  it("supports a comma separated allow list", () => {
    process.env.CORS_ORIGIN = "https://a.example.com, https://b.example.com";

    expect(isAllowedOrigin("https://b.example.com")).toBe(true);
    expect(isAllowedOrigin("https://a.example.com")).toBe(true);
  });

  it("falls back to the local origin by default", () => {
    delete process.env.CORS_ORIGIN;

    expect(isAllowedOrigin("http://localhost:3000")).toBe(true);
  });

  it("answers a preflight request for an allowed origin", async () => {
    process.env.CORS_ORIGIN = "https://app.example.com";
    const app = new Elysia().use(corsPlugin).get("/ping", () => "pong");

    const response = await app.handle(
      new Request("http://localhost/ping", {
        method: "OPTIONS",
        headers: { origin: "https://app.example.com", "access-control-request-method": "GET" },
      }),
    );

    expect(response.headers.get("access-control-allow-origin")).toBe("https://app.example.com");
  });
});

import { Elysia } from "elysia";
import { afterEach, describe, expect, it, vi } from "vitest";
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

  it("allows the browser upload preflight headers", async () => {
    delete process.env.CORS_ORIGIN;
    const app = new Elysia().use(corsPlugin).post("/video-projects/:id/assets", () => "uploaded");

    const response = await app.handle(
      new Request("http://localhost/video-projects/project-1/assets", {
        method: "OPTIONS",
        headers: {
          origin: "http://localhost:3000",
          "access-control-request-method": "POST",
          "access-control-request-headers": "authorization,content-type,x-asset-rights-confirmed",
        },
      }),
    );

    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe("http://localhost:3000");
    expect(response.headers.get("access-control-allow-headers")?.toLowerCase().split(",").map((header) => header.trim())).toEqual(
      expect.arrayContaining(["authorization", "content-type", "x-asset-rights-confirmed"]),
    );
  });

  it("does not allow a browser upload preflight from a rejected origin", async () => {
    delete process.env.CORS_ORIGIN;
    const handler = vi.fn(() => "uploaded");
    const app = new Elysia().use(corsPlugin).post("/video-projects/:id/assets", handler);

    const response = await app.handle(
      new Request("http://localhost/video-projects/project-1/assets", {
        method: "OPTIONS",
        headers: {
          origin: "https://evil.example.com",
          "access-control-request-method": "POST",
          "access-control-request-headers": "authorization,content-type,x-asset-rights-confirmed",
        },
      }),
    );

    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
    expect(handler).not.toHaveBeenCalled();
  });

  it("does not allow an unsupported browser upload header", async () => {
    delete process.env.CORS_ORIGIN;
    const handler = vi.fn(() => "uploaded");
    const app = new Elysia().use(corsPlugin).post("/video-projects/:id/assets", handler);

    const response = await app.handle(
      new Request("http://localhost/video-projects/project-1/assets", {
        method: "OPTIONS",
        headers: {
          origin: "http://localhost:3000",
          "access-control-request-method": "POST",
          "access-control-request-headers": "authorization,x-unsupported-header",
        },
      }),
    );

    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-headers")?.toLowerCase()).not.toContain("x-unsupported-header");
    expect(handler).not.toHaveBeenCalled();
  });
});

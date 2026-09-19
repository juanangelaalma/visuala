import { describe, expect, it } from "vitest";
import { createApp } from "@/app";

describe("GET /health", () => {
  it("reports the service as healthy", async () => {
    const response = await createApp().handle(new Request("http://localhost/health"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "ok" });
  });
});

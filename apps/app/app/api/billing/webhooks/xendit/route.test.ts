import { z } from "zod";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/application/billing/services", () => ({ createBillingWorkerServices: vi.fn() }));
vi.mock("@/application/billing/receive-billing-webhook", () => ({ receiveBillingWebhook: vi.fn() }));

import { receiveBillingWebhook } from "@/application/billing/receive-billing-webhook";
import { createBillingWorkerServices } from "@/application/billing/services";
import { XenditWebhookVerificationError } from "@/infrastructure/billing/xendit-checkout-provider";
import { POST } from "./route";

const verifyWebhookToken = vi.fn();
const verifyAndNormalizeWebhook = vi.fn();
const services = {
  config: { checkoutEnabled: true },
  webhooks: {},
  xendit: { verifyWebhookToken, verifyAndNormalizeWebhook },
};

describe("Xendit billing webhook route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createBillingWorkerServices).mockReturnValue(services as never);
    verifyAndNormalizeWebhook.mockReturnValue({ deduplicationKey: "event-1" });
    vi.mocked(receiveBillingWebhook).mockResolvedValue({ eventId: "event-1", duplicate: false, outcome: "fulfilled", fulfilled: true });
  });

  it("returns 200 only after synchronous fulfillment", async () => {
    const response = await POST(new Request("http://localhost/api/billing/webhooks/xendit", { method: "POST", headers: { "content-type": "application/json", "x-callback-token": "token" }, body: JSON.stringify({ event: "payment.succeeded" }) }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ received: true, duplicate: false, outcome: "fulfilled" });
    expect(receiveBillingWebhook).toHaveBeenCalledWith(services.webhooks, { deduplicationKey: "event-1" });
  });

  it("returns 200 for terminal duplicate events", async () => {
    vi.mocked(receiveBillingWebhook).mockResolvedValue({ eventId: "event-1", duplicate: true, outcome: "already_paid", fulfilled: true });

    const response = await POST(new Request("http://localhost/api/billing/webhooks/xendit", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ received: true, duplicate: true, outcome: "already_paid" });
  });

  it("logs fulfillment context for retryable unfulfilled events", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.mocked(receiveBillingWebhook).mockResolvedValue({ eventId: "event-1", duplicate: true, outcome: "retryable", fulfilled: false });

    try {
      const response = await POST(new Request("http://localhost/api/billing/webhooks/xendit", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }));

      expect(response.status).toBe(503);
      expect(consoleError).toHaveBeenCalledWith("Xendit webhook processing failed", { stage: "fulfillment", outcome: "retryable" });
    } finally {
      consoleError.mockRestore();
    }
  });

  it("logs checkout disabled context without secrets", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.mocked(createBillingWorkerServices).mockReturnValueOnce({ ...services, config: { checkoutEnabled: false } } as never);

    try {
      const response = await POST(new Request("http://localhost/api/billing/webhooks/xendit", { method: "POST", headers: { "x-callback-token": "secret-token" }, body: "secret-payload" }));

      expect(response.status).toBe(503);
      expect(consoleError).toHaveBeenCalledWith("Xendit webhook processing failed", { stage: "checkout_disabled", checkoutEnabled: false });
    } finally {
      consoleError.mockRestore();
    }
  });

  it("logs safe configuration diagnostics for Zod errors", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const previousApiKey = process.env.XENDIT_API_KEY;
    const previousWebhookToken = process.env.XENDIT_WEBHOOK_TOKEN;
    process.env.XENDIT_API_KEY = "secret-api-key";
    delete process.env.XENDIT_WEBHOOK_TOKEN;
    vi.mocked(createBillingWorkerServices).mockImplementationOnce(() => {
      throw new z.ZodError([]);
    });

    try {
      const response = await POST(new Request("http://localhost/api/billing/webhooks/xendit", { method: "POST" }));

      expect(response.status).toBe(503);
      expect(consoleError).toHaveBeenCalledWith("Xendit webhook processing failed", {
        stage: "configuration",
        apiKeyPresent: true,
        webhookTokenPresent: false,
      });
    } finally {
      if (previousApiKey === undefined) delete process.env.XENDIT_API_KEY;
      else process.env.XENDIT_API_KEY = previousApiKey;
      if (previousWebhookToken === undefined) delete process.env.XENDIT_WEBHOOK_TOKEN;
      else process.env.XENDIT_WEBHOOK_TOKEN = previousWebhookToken;
      consoleError.mockRestore();
    }
  });

  it.each([null, "wrong"])("returns 401 without parsing the body for token %s", async (token) => {
    const json = vi.fn();
    verifyWebhookToken.mockImplementationOnce(() => { throw new XenditWebhookVerificationError(); });
    const request = { headers: new Headers(token === null ? {} : { "x-callback-token": token }), json } as unknown as Request;

    const response = await POST(request);

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized." });
    expect(json).not.toHaveBeenCalled();
    expect(verifyAndNormalizeWebhook).not.toHaveBeenCalled();
  });

  it("returns safe 400, 401, and 503 responses and logs only unexpected errors", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const invalid = await POST(new Request("http://localhost/api/billing/webhooks/xendit", { method: "POST", headers: { "x-callback-token": "token" }, body: "{" }));
      expect(invalid.status).toBe(400);
      await expect(invalid.json()).resolves.toEqual({ error: "Invalid request." });

      verifyAndNormalizeWebhook.mockImplementationOnce(() => { throw new XenditWebhookVerificationError(); });
      const unauthorized = await POST(new Request("http://localhost/api/billing/webhooks/xendit", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }));
      expect(unauthorized.status).toBe(401);
      await expect(unauthorized.json()).resolves.toEqual({ error: "Unauthorized." });
      expect(consoleError).not.toHaveBeenCalled();

      const error = new Error("database detail");
      vi.mocked(receiveBillingWebhook).mockRejectedValueOnce(error);
      const unavailable = await POST(new Request("http://localhost/api/billing/webhooks/xendit", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }));
      expect(unavailable.status).toBe(503);
      await expect(unavailable.json()).resolves.toEqual({ error: "Webhook unavailable." });
      expect(consoleError).toHaveBeenCalledOnce();
      expect(consoleError).toHaveBeenCalledWith("Xendit webhook processing failed", { stage: "unexpected", errorName: "Error" });
    } finally {
      consoleError.mockRestore();
    }
  });
});

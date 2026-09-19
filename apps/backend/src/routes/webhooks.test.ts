import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ services: vi.fn(), receive: vi.fn(), config: vi.fn(), verifyWebhookToken: vi.fn(), verifyAndNormalizeWebhook: vi.fn() }));

vi.mock("@/application/billing/services", () => ({ createBillingWorkerServices: mocks.services }));
vi.mock("@/application/billing/receive-billing-webhook", () => ({ receiveBillingWebhook: mocks.receive }));
vi.mock("@/infrastructure/config/billing", () => ({ getBillingConfig: mocks.config }));

import { XenditWebhookVerificationError } from "@/infrastructure/billing/xendit-checkout-provider";
import { createApp } from "@/app";

const workerServices = {
  webhooks: { webhooks: true },
  xendit: { verifyWebhookToken: mocks.verifyWebhookToken, verifyAndNormalizeWebhook: mocks.verifyAndNormalizeWebhook },
};

function post(options: { token?: string; body?: string } = {}) {
  return createApp().handle(
    new Request("http://localhost/billing/webhooks/xendit", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(options.token === undefined ? {} : { "x-callback-token": options.token }),
      },
      body: options.body ?? "{}",
    }),
  );
}

describe("Xendit billing webhook route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.config.mockReturnValue({ checkoutEnabled: true });
    mocks.services.mockImplementation(() => ({ ...workerServices, config: mocks.config() }));
    mocks.verifyAndNormalizeWebhook.mockReturnValue({ deduplicationKey: "event-1" });
    mocks.receive.mockResolvedValue({ eventId: "event-1", duplicate: false, outcome: "fulfilled", fulfilled: true });
  });

  it("returns 200 only after synchronous fulfillment", async () => {
    const response = await post({ token: "token" });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ received: true, duplicate: false, outcome: "fulfilled" });
    expect(mocks.receive).toHaveBeenCalledWith(workerServices.webhooks, { deduplicationKey: "event-1" });
  });

  it("returns 200 for terminal duplicate events", async () => {
    mocks.receive.mockResolvedValue({ eventId: "event-1", duplicate: true, outcome: "already_paid", fulfilled: true });

    const response = await post({ token: "token" });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ received: true, duplicate: true, outcome: "already_paid" });
  });

  it("returns 503 for retryable unfulfilled events", async () => {
    mocks.receive.mockResolvedValue({ eventId: "event-1", duplicate: true, outcome: "retryable", fulfilled: false });

    const response = await post({ token: "token" });

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: "Webhook unavailable." });
  });

  it.each([undefined, "wrong"])("returns 401 without parsing the body for token %s", async (token) => {
    mocks.verifyWebhookToken.mockImplementationOnce(() => {
      throw new XenditWebhookVerificationError();
    });

    const response = await post({ token, body: "{" });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized." });
    expect(mocks.verifyAndNormalizeWebhook).not.toHaveBeenCalled();
    expect(mocks.receive).not.toHaveBeenCalled();
  });

  it("returns a safe 400 for an unparseable body with a valid token", async () => {
    const response = await post({ token: "token", body: "{" });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Invalid request." });
  });

  it("returns 401 when the payload fails webhook verification", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      mocks.verifyAndNormalizeWebhook.mockImplementationOnce(() => {
        throw new XenditWebhookVerificationError();
      });

      const response = await post({ token: "token" });

      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toEqual({ error: "Unauthorized." });
      expect(consoleError).not.toHaveBeenCalled();
    } finally {
      consoleError.mockRestore();
    }
  });

  it("returns a safe 503 and logs only unexpected failures", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const error = new Error("database detail");
      mocks.receive.mockRejectedValueOnce(error);

      const response = await post({ token: "token" });

      expect(response.status).toBe(503);
      await expect(response.json()).resolves.toEqual({ error: "Webhook unavailable." });
      expect(consoleError).toHaveBeenCalledOnce();
      expect(consoleError).toHaveBeenCalledWith("Failed to process Xendit billing webhook", error);
    } finally {
      consoleError.mockRestore();
    }
  });

  it("returns 503 when checkout is disabled", async () => {
    mocks.config.mockReturnValue({ checkoutEnabled: false });

    const response = await post({ token: "token" });

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: "Webhook unavailable." });
    expect(mocks.verifyWebhookToken).not.toHaveBeenCalled();
  });
});

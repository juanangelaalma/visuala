import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  publicClient: vi.fn(),
  userClient: vi.fn(),
  services: vi.fn(),
  config: vi.fn(),
  checkout: vi.fn(),
  prepare: vi.fn(),
  getOwned: vi.fn(),
  refresh: vi.fn(),
  simulate: vi.fn(),
  findActiveById: vi.fn(),
}));

vi.mock("@/infrastructure/supabase/clients", () => ({
  createSupabasePublicClient: mocks.publicClient,
  createSupabaseUserClient: mocks.userClient,
}));
vi.mock("@/infrastructure/config/billing", () => ({ getBillingConfig: mocks.config }));
vi.mock("@/application/billing/services", () => ({ createBillingServices: mocks.services }));
vi.mock("@/application/billing/create-billing-checkout", () => ({ createBillingCheckout: mocks.checkout }));
vi.mock("@/application/billing/prepare-billing-checkout", () => ({ prepareBillingCheckout: mocks.prepare }));
vi.mock("@/application/billing/get-owned-billing-payment", () => ({ getOwnedBillingPayment: mocks.getOwned }));
vi.mock("@/application/billing/refresh-owned-billing-payment", () => ({ refreshOwnedBillingPayment: mocks.refresh }));
vi.mock("@/application/billing/simulate-owned-billing-payment", () => ({ simulateOwnedBillingPayment: mocks.simulate }));

import { BillingPaymentNotFoundError, BillingPaymentSimulationNotReadyError } from "@/domain/billing/errors";
import { createApp } from "@/app";

const CHECKOUT_CONFIG = { checkoutEnabled: true, qrisEnabled: true, virtualAccountEnabled: false, environment: "test" as const, apiKey: "key", webhookToken: "token", requestTimeoutMs: 1000 };
const planId = "123e4567-e89b-12d3-a456-426614174000";

function send(method: string, path: string, body?: unknown) {
  return createApp().handle(
    new Request(`http://localhost${path}`, {
      method,
      headers: { "content-type": "application/json", authorization: "Bearer token" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
  );
}

describe("billing routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user: { id: "user-1", email: "user@example.com", user_metadata: {} } }, error: null });
    mocks.publicClient.mockReturnValue({ auth: { getUser: mocks.getUser } });
    mocks.userClient.mockReturnValue({ scoped: true });
    mocks.config.mockReturnValue(CHECKOUT_CONFIG);
    mocks.services.mockImplementation(() => ({
      config: mocks.config(),
      checkout: { pricingPlans: { findActiveById: mocks.findActiveById } },
      simulation: {},
      payments: {},
      xendit: {},
    }));
  });

  it("requires authentication", async () => {
    const response = await createApp().handle(new Request("http://localhost/billing/checkout", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }));

    expect(response.status).toBe(401);
    expect(mocks.checkout).not.toHaveBeenCalled();
  });

  describe("GET /billing/plans/:planId/checkout", () => {
    it("returns 404 for an unavailable plan", async () => {
      mocks.findActiveById.mockResolvedValue(null);

      const response = await send("GET", `/billing/plans/${planId}/checkout`);

      expect(response.status).toBe(404);
      await expect(response.json()).resolves.toEqual({ error: "Not found." });
    });

    it("returns the plan with prepared checkout options", async () => {
      mocks.findActiveById.mockResolvedValue({ id: planId });
      mocks.prepare.mockResolvedValue({ checkoutAvailable: true, methods: [{ id: "method-1" }], unavailableMessage: undefined });

      const response = await send("GET", `/billing/plans/${planId}/checkout`);

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ plan: { id: planId }, checkoutAvailable: true, methods: [{ id: "method-1" }] });
      expect(mocks.prepare).toHaveBeenCalledWith(expect.anything(), { plan: { id: planId }, checkoutEnabled: true });
    });

    it("degrades gracefully when payment methods cannot be loaded", async () => {
      const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
      try {
        mocks.findActiveById.mockResolvedValue({ id: planId });
        mocks.prepare.mockRejectedValue(new Error("method catalog unavailable"));

        const response = await send("GET", `/billing/plans/${planId}/checkout`);

        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toEqual({
          plan: { id: planId },
          checkoutAvailable: false,
          methods: [],
          unavailableMessage: "Payment methods are temporarily unavailable. Try again later.",
        });
      } finally {
        consoleError.mockRestore();
      }
    });
  });

  describe("POST /billing/checkout", () => {
    it("rejects an invalid body before creating a payment", async () => {
      const response = await send("POST", "/billing/checkout", { pricingPlanId: "not-a-uuid" });

      expect(response.status).toBe(422);
      await expect(response.json()).resolves.toEqual({ error: "Invalid request." });
      expect(mocks.checkout).not.toHaveBeenCalled();
    });

    it("rejects when checkout is disabled", async () => {
      mocks.config.mockReturnValue({ ...CHECKOUT_CONFIG, checkoutEnabled: false });

      const response = await send("POST", "/billing/checkout", { pricingPlanId: planId, paymentMethodCatalogId: planId, idempotencyKey: planId });

      expect(response.status).toBe(409);
      await expect(response.json()).resolves.toEqual({ error: "Checkout is unavailable." });
      expect(mocks.checkout).not.toHaveBeenCalled();
    });

    it("creates a checkout for the authenticated user", async () => {
      mocks.checkout.mockResolvedValue({ id: "payment-1" });

      const response = await send("POST", "/billing/checkout", { pricingPlanId: planId, paymentMethodCatalogId: planId, idempotencyKey: planId });

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ payment: { id: "payment-1" } });
      expect(mocks.checkout).toHaveBeenCalledWith(expect.anything(), { pricingPlanId: planId, paymentMethodCatalogId: planId, idempotencyKey: planId, userId: "user-1" });
    });

    it("returns a safe 500 when the checkout projection is missing", async () => {
      mocks.checkout.mockResolvedValue(null);

      const response = await send("POST", "/billing/checkout", { pricingPlanId: planId, paymentMethodCatalogId: planId, idempotencyKey: planId });

      expect(response.status).toBe(500);
      await expect(response.json()).resolves.toEqual({ error: "Could not create checkout." });
    });
  });

  describe("GET /billing/payments/:id", () => {
    it("returns the owned payment with its simulation eligibility", async () => {
      mocks.getOwned.mockResolvedValue({ id: "payment-1" });

      const response = await send("GET", "/billing/payments/payment-1");

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ payment: { id: "payment-1" }, canSimulate: false });
      expect(mocks.getOwned).toHaveBeenCalledWith({}, { paymentId: "payment-1", userId: "user-1" });
    });

    it("reports a sandbox payment as simulatable", async () => {
      mocks.getOwned.mockResolvedValue({
        id: "payment-1",
        status: "pending",
        priceAmount: 10000,
        currency: "IDR",
        expiresAt: null,
        paymentMethod: { id: "method-1" },
        latestAttempt: { id: "attempt-1", provider: "xendit", environment: "test", providerPaymentId: "provider-payment", expiresAt: null, actions: [] },
      });

      const response = await send("GET", "/billing/payments/payment-1");

      await expect(response.json()).resolves.toMatchObject({ canSimulate: true });
    });

    it("maps a missing payment to 404", async () => {
      mocks.getOwned.mockRejectedValue(new BillingPaymentNotFoundError());

      const response = await send("GET", "/billing/payments/payment-1");

      expect(response.status).toBe(404);
      await expect(response.json()).resolves.toEqual({ error: "Not found." });
    });
  });

  describe("GET /billing/payments/:id/refresh", () => {
    it("returns the refresh projection", async () => {
      mocks.refresh.mockResolvedValue({ id: "payment-1", status: "pending", actions: [], expiresAt: null });

      const response = await send("GET", "/billing/payments/payment-1/refresh");

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ payment: { id: "payment-1", status: "pending", actions: [], expiresAt: null } });
      expect(mocks.refresh).toHaveBeenCalledWith({ payments: {} }, { paymentId: "payment-1", userId: "user-1" });
    });
  });

  describe("POST /billing/payments/:id/simulate", () => {
    it("simulates the owned payment for the authenticated user", async () => {
      mocks.simulate.mockResolvedValue(undefined);

      const response = await send("POST", "/billing/payments/payment-1/simulate");

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ message: "Simulation sent. Wait for the webhook, then refresh payment status." });
      expect(mocks.simulate).toHaveBeenCalledWith({}, { paymentId: "payment-1", userId: "user-1" });
    });

    it("maps simulation readiness failures to a safe 409", async () => {
      mocks.simulate.mockRejectedValue(new BillingPaymentSimulationNotReadyError());

      const response = await send("POST", "/billing/payments/payment-1/simulate");

      expect(response.status).toBe(409);
      await expect(response.json()).resolves.toEqual({ error: "Payment is not ready for simulation." });
    });
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ api: vi.fn(), redirect: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/infrastructure/supabase/server-client", () => ({ createSupabaseServerClient: vi.fn() }));
vi.mock("@/shared/config/env", () => ({ getAppEnv: () => ({ NEXT_PUBLIC_API_URL: "http://localhost:4000" }) }));
vi.mock("@/lib/api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/client")>();

  return { ...actual, apiFetch: mocks.api };
});

import { ApiError } from "@/lib/api/client";
import { createBillingCheckoutAction, refreshBillingPaymentAction, simulateBillingPaymentAction } from "./billing-actions";

const id = "123e4567-e89b-12d3-a456-426614174000";

function checkoutForm() {
  const form = new FormData();
  form.set("pricingPlanId", id);
  form.set("paymentMethodCatalogId", id);
  form.set("idempotencyKey", id);
  return form;
}

function paymentForm() {
  const form = new FormData();
  form.set("paymentId", id);
  return form;
}

describe("billing actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.api.mockResolvedValue(undefined);
  });

  describe("createBillingCheckoutAction", () => {
    it("rejects an invalid checkout form", async () => {
      expect(await createBillingCheckoutAction({}, new FormData())).toHaveProperty("error");
      expect(mocks.api).not.toHaveBeenCalled();
    });

    it("creates the checkout on the backend then redirects to the payment", async () => {
      mocks.api.mockResolvedValue({ payment: { id: "payment/1" } });

      await createBillingCheckoutAction({}, checkoutForm());

      expect(mocks.api).toHaveBeenCalledWith("/billing/checkout", {
        method: "POST",
        body: { pricingPlanId: id, paymentMethodCatalogId: id, idempotencyKey: id },
      });
      expect(mocks.redirect).toHaveBeenCalledWith("/billing/checkout/payment%2F1");
    });

    it("surfaces the backend message when checkout fails", async () => {
      mocks.api.mockRejectedValue(new ApiError(409, { error: "Checkout is unavailable." }));

      expect(await createBillingCheckoutAction({}, checkoutForm())).toEqual({ error: "Checkout is unavailable." });
    });

    it("asks the user to sign in when the session is missing", async () => {
      mocks.api.mockRejectedValue(new ApiError(401, { error: "Unauthorized." }));

      expect(await createBillingCheckoutAction({}, checkoutForm())).toEqual({ error: "Sign in to continue." });
    });

    it("falls back to a safe message for unexpected failures", async () => {
      const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
      try {
        mocks.api.mockRejectedValue(new Error("socket hang up"));

        expect(await createBillingCheckoutAction({}, checkoutForm())).toEqual({ error: "Checkout is unavailable." });
      } finally {
        consoleError.mockRestore();
      }
    });
  });

  describe("refreshBillingPaymentAction", () => {
    it("rejects an invalid refresh form", async () => {
      expect(await refreshBillingPaymentAction({}, new FormData())).toHaveProperty("error");
      expect(mocks.api).not.toHaveBeenCalled();
    });

    it("returns the refreshed payment projection", async () => {
      const payment = { id: "payment-1", status: "pending", actions: [], expiresAt: null };
      mocks.api.mockResolvedValue({ payment });

      expect(await refreshBillingPaymentAction({}, paymentForm())).toEqual({ payment });
      expect(mocks.api).toHaveBeenCalledWith(`/billing/payments/${id}/refresh`);
    });

    it("returns a safe failure message", async () => {
      const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
      try {
        mocks.api.mockRejectedValue(new ApiError(500, { error: "Internal server error." }));

        expect(await refreshBillingPaymentAction({}, paymentForm())).toEqual({ error: "Internal server error." });
      } finally {
        consoleError.mockRestore();
      }
    });
  });

  describe("simulateBillingPaymentAction", () => {
    it("rejects an invalid simulation form", async () => {
      expect(await simulateBillingPaymentAction({}, new FormData())).toEqual({ error: "Invalid payment." });
      expect(mocks.api).not.toHaveBeenCalled();
    });

    it("simulates the payment and reports the backend message", async () => {
      mocks.api.mockResolvedValue({ message: "Simulation sent. Wait for the webhook, then refresh payment status." });

      await expect(simulateBillingPaymentAction({}, paymentForm())).resolves.toEqual({ message: "Simulation sent. Wait for the webhook, then refresh payment status." });
      expect(mocks.api).toHaveBeenCalledWith(`/billing/payments/${id}/simulate`, { method: "POST" });
    });

    it.each([
      [409, "Payment is not ready for simulation."],
      [409, "Simulation is unavailable for this payment."],
      [502, "Simulation could not be started."],
      [502, "Simulation status is unknown. Refresh payment status before retrying."],
    ])("maps a %i simulation failure to safe feedback", async (status, message) => {
      const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
      try {
        mocks.api.mockRejectedValue(new ApiError(status, { error: message }));

        await expect(simulateBillingPaymentAction({}, paymentForm())).resolves.toEqual({ error: message });
      } finally {
        consoleError.mockRestore();
      }
    });
  });
});

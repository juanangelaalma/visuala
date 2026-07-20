import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ services: vi.fn(), checkout: vi.fn(), refresh: vi.fn(), simulate: vi.fn(), redirect: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/application/billing/services", () => ({ createBillingServices: mocks.services }));
vi.mock("@/application/billing/create-billing-checkout", () => ({ createBillingCheckout: mocks.checkout }));
vi.mock("@/application/billing/refresh-owned-billing-payment", () => ({ refreshOwnedBillingPayment: mocks.refresh }));
vi.mock("@/application/billing/simulate-owned-billing-payment", () => ({ simulateOwnedBillingPayment: mocks.simulate }));

import { BillingPaymentSimulationNotReadyError, BillingPaymentSimulationRejectedError, BillingPaymentSimulationUnavailableError, BillingPaymentSimulationUnknownError } from "@/domain/billing/errors";
import { createBillingCheckoutAction, refreshBillingPaymentAction, simulateBillingPaymentAction } from "./billing-actions";

const id = "123e4567-e89b-12d3-a456-426614174000";
function checkoutForm() { const form = new FormData(); form.set("pricingPlanId", id); form.set("paymentMethodCatalogId", id); form.set("idempotencyKey", id); return form; }
function services(user: unknown = { id: "user-1" }) {
  return { config: { checkoutEnabled: true, qrisEnabled: true, virtualAccountEnabled: false }, authProvider: { getCurrentUser: vi.fn().mockResolvedValue(user) }, checkout: {}, simulation: {}, payments: {} };
}

describe("billing actions", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects invalid checkout form", async () => {
    expect(await createBillingCheckoutAction({}, new FormData())).toHaveProperty("error");
  });

  it("rejects disabled checkout", async () => {
    mocks.services.mockResolvedValue({ ...services(), config: { checkoutEnabled: false, qrisEnabled: true, virtualAccountEnabled: true } });
    expect(await createBillingCheckoutAction({}, checkoutForm())).toEqual({ error: "Checkout is unavailable." });
  });

  it("requires authenticated checkout user", async () => {
    mocks.services.mockResolvedValue(services(null));
    expect(await createBillingCheckoutAction({}, checkoutForm())).toEqual({ error: "Sign in to continue." });
  });

  it("authenticates before creating checkout with exact input", async () => {
    const billingServices = services();
    mocks.services.mockResolvedValue(billingServices);
    mocks.checkout.mockResolvedValue({ id: "payment/1" });
    await createBillingCheckoutAction({}, checkoutForm());
    expect(billingServices.authProvider.getCurrentUser).toHaveBeenCalledOnce();
    expect(mocks.checkout).toHaveBeenCalledWith(billingServices.checkout, { pricingPlanId: id, paymentMethodCatalogId: id, idempotencyKey: id, userId: "user-1" });
    expect(billingServices.authProvider.getCurrentUser.mock.invocationCallOrder[0]).toBeLessThan(mocks.checkout.mock.invocationCallOrder[0]);
    expect(mocks.redirect).toHaveBeenCalledWith("/billing/checkout/payment%2F1");
  });

  it("handles missing checkout result", async () => {
    mocks.services.mockResolvedValue(services());
    mocks.checkout.mockResolvedValue(null);
    expect(await createBillingCheckoutAction({}, checkoutForm())).toEqual({ error: "Could not create checkout." });
  });

  it("rejects invalid refresh form", async () => {
    expect(await refreshBillingPaymentAction({}, new FormData())).toHaveProperty("error");
  });

  it("authenticates before refreshing owned payment with exact input", async () => {
    const billingServices = services();
    mocks.services.mockResolvedValue(billingServices);
    mocks.refresh.mockResolvedValue({ id: "payment-1" });
    const form = new FormData(); form.set("paymentId", id);
    expect(await refreshBillingPaymentAction({}, form)).toEqual({ payment: { id: "payment-1" } });
    expect(billingServices.authProvider.getCurrentUser).toHaveBeenCalledOnce();
    expect(mocks.refresh).toHaveBeenCalledWith({ payments: billingServices.payments }, { paymentId: id, userId: "user-1" });
    expect(billingServices.authProvider.getCurrentUser.mock.invocationCallOrder[0]).toBeLessThan(mocks.refresh.mock.invocationCallOrder[0]);
  });

  it("requires authenticated refresh user", async () => {
    mocks.services.mockResolvedValue(services(null));
    const form = new FormData(); form.set("paymentId", id);
    expect(await refreshBillingPaymentAction({}, form)).toEqual({ error: "Sign in to continue." });
  });

  it("rejects invalid simulation input", async () => {
    expect(await simulateBillingPaymentAction({}, new FormData())).toEqual({ error: "Invalid payment." });
  });

  it("requires authenticated simulation user", async () => {
    mocks.services.mockResolvedValue(services(null));
    const form = new FormData(); form.set("paymentId", id);

    expect(await simulateBillingPaymentAction({}, form)).toEqual({ error: "Sign in to continue." });
    expect(mocks.simulate).not.toHaveBeenCalled();
  });

  it("simulates owned payment with exact input", async () => {
    const billingServices = services();
    mocks.services.mockResolvedValue(billingServices);
    const form = new FormData(); form.set("paymentId", id);

    await expect(simulateBillingPaymentAction({}, form)).resolves.toEqual({ message: "Simulation sent. Wait for the webhook, then refresh payment status." });
    expect(mocks.simulate).toHaveBeenCalledWith(billingServices.simulation, { paymentId: id, userId: "user-1" });
  });

  it.each([
    [new BillingPaymentSimulationNotReadyError(), "Payment is not ready for simulation."],
    [new BillingPaymentSimulationRejectedError(), "Simulation could not be started."],
    [new BillingPaymentSimulationUnknownError(), "Simulation status is unknown. Refresh payment status before retrying."],
    [new BillingPaymentSimulationUnavailableError(), "Simulation is unavailable for this payment."],
  ])("maps simulation errors to safe feedback", async (error, message) => {
    mocks.services.mockResolvedValue(services());
    mocks.simulate.mockRejectedValue(error);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const form = new FormData(); form.set("paymentId", id);

    await expect(simulateBillingPaymentAction({}, form)).resolves.toEqual({ error: message });
  });
});

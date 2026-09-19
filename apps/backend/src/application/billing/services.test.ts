import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ serviceRoleClient: vi.fn(), xenditProvider: vi.fn() }));

vi.mock("@/infrastructure/supabase/clients", () => ({ createSupabaseServiceRoleClient: mocks.serviceRoleClient }));
vi.mock("@/infrastructure/billing/xendit-checkout-provider", () => ({ XenditCheckoutProvider: mocks.xenditProvider }));

import { UnsupportedBillingGatewayError } from "@/domain/billing/errors";
import type { BillingConfig } from "@/infrastructure/config/billing";
import { createBillingServices, createBillingWorkerServices } from "./services";

const config: BillingConfig = {
  checkoutEnabled: true,
  qrisEnabled: true,
  virtualAccountEnabled: true,
  environment: "test",
  apiKey: "xnd_development_key",
  webhookToken: "callback-token",
  requestTimeoutMs: 1000,
};

describe("billing services", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.serviceRoleClient.mockReturnValue({ serviceRole: true });
    mocks.xenditProvider.mockReturnValue({ gateway: true });
  });

  it("wires the checkout services against the supplied client", () => {
    const services = createBillingServices({ scoped: true } as never, config);

    expect(services.config).toBe(config);
    expect(services.checkout.payments).toBe(services.payments);
    expect(services.checkout.gateways.resolve("xendit", "test")).toBe(services.xendit);
    expect(mocks.serviceRoleClient).toHaveBeenCalledOnce();
  });

  it("rejects gateways that are not the configured xendit environment", () => {
    const services = createBillingServices({} as never, config);

    expect(() => services.checkout.gateways.resolve("other", "test")).toThrow(UnsupportedBillingGatewayError);
    expect(() => services.checkout.gateways.resolve("xendit", "production")).toThrow(UnsupportedBillingGatewayError);
  });

  it("allocates a trusted provider allocation", async () => {
    const services = createBillingServices({} as never, config);

    await expect(
      services.checkout.providerAllocation.allocate({ billingPaymentId: "payment-1", paymentMethod: { id: "method-1" } as never, clientIdempotencyKey: "key-1" }),
    ).resolves.toEqual({
      paymentMethodId: "method-1",
      provider: "xendit",
      environment: "test",
      providerReference: "visuala-payment-1",
      providerIdempotencyKey: "key-1",
    });
  });

  it("applies the payment method feature policy", () => {
    const services = createBillingServices({} as never, config);

    expect(services.checkout.isPaymentMethodEnabled({ kind: "qris" } as never)).toBe(true);
    expect(services.checkout.isPaymentMethodEnabled({ kind: "virtual_account" } as never)).toBe(true);
    expect(services.checkout.isPaymentMethodEnabled({ kind: "ewallet" } as never)).toBe(false);
  });

  it("wires the worker services with the service role client", () => {
    const services = createBillingWorkerServices(config);

    expect(services.config).toBe(config);
    expect(services.xendit).toBeTruthy();
    expect(mocks.serviceRoleClient).toHaveBeenCalledOnce();
  });
});

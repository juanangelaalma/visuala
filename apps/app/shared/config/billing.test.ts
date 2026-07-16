import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { parseBillingConfig } from "./billing";

const required = { XENDIT_ENVIRONMENT: "sandbox", XENDIT_API_KEY: "api-key", XENDIT_WEBHOOK_TOKEN: "webhook-token" };

describe("billing config", () => {
  it("defaults checkout and QRIS off and maps sandbox explicitly", () => {
    expect(parseBillingConfig(required)).toMatchObject({ checkoutEnabled: false, qrisEnabled: false, environment: "test" });
  });

  it("fails closed when required server secrets are absent", () => {
    expect(() => parseBillingConfig({ XENDIT_ENVIRONMENT: "sandbox" })).toThrow();
  });

  it("accepts explicit enablement", () => {
    expect(parseBillingConfig({ ...required, BILLING_CHECKOUT_ENABLED: "true", BILLING_QRIS_ENABLED: "true" })).toMatchObject({ checkoutEnabled: true, qrisEnabled: true });
  });
});

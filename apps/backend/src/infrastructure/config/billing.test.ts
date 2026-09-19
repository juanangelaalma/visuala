import { afterEach, describe, expect, it, vi } from "vitest";
import { getBillingConfig, parseBillingConfig } from "./billing";

const required = {
  XENDIT_ENVIRONMENT: "sandbox",
  XENDIT_API_KEY: "xnd_development_key",
  XENDIT_WEBHOOK_TOKEN: "callback-token",
};

describe("parseBillingConfig", () => {
  it("defaults flags to disabled and maps sandbox to test", () => {
    expect(parseBillingConfig(required)).toEqual({
      checkoutEnabled: false,
      qrisEnabled: false,
      virtualAccountEnabled: false,
      environment: "test",
      apiKey: "xnd_development_key",
      webhookToken: "callback-token",
      requestTimeoutMs: 10000,
    });
  });

  it("parses enabled flags, production environment and timeout", () => {
    const config = parseBillingConfig({
      ...required,
      BILLING_CHECKOUT_ENABLED: "true",
      BILLING_QRIS_ENABLED: "true",
      BILLING_VIRTUAL_ACCOUNT_ENABLED: "true",
      XENDIT_ENVIRONMENT: "production",
      XENDIT_REQUEST_TIMEOUT_MS: "5000",
    });

    expect(config).toMatchObject({
      checkoutEnabled: true,
      qrisEnabled: true,
      virtualAccountEnabled: true,
      environment: "production",
      requestTimeoutMs: 5000,
    });
  });

  it("rejects a missing api key", () => {
    expect(() => parseBillingConfig({ ...required, XENDIT_API_KEY: "" })).toThrow();
  });

  it("rejects an unknown environment", () => {
    expect(() => parseBillingConfig({ ...required, XENDIT_ENVIRONMENT: "staging" })).toThrow();
  });
});

describe("getBillingConfig", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("reads process env once and caches the parsed result", () => {
    vi.stubEnv("XENDIT_ENVIRONMENT", "sandbox");
    vi.stubEnv("XENDIT_API_KEY", "xnd_development_key");
    vi.stubEnv("XENDIT_WEBHOOK_TOKEN", "callback-token");

    const config = getBillingConfig();

    expect(config.apiKey).toBe("xnd_development_key");
    expect(getBillingConfig()).toBe(config);
  });
});

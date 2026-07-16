import "server-only";

import { z } from "zod";

const booleanFlag = z.enum(["true", "false"]).default("false").transform((value) => value === "true");

const billingConfigSchema = z.object({
  BILLING_CHECKOUT_ENABLED: booleanFlag,
  BILLING_QRIS_ENABLED: booleanFlag,
  XENDIT_ENVIRONMENT: z.enum(["sandbox", "production"]),
  XENDIT_API_KEY: z.string().min(1),
  XENDIT_WEBHOOK_TOKEN: z.string().min(1),
  XENDIT_REQUEST_TIMEOUT_MS: z.coerce.number().int().min(1000).max(30000).default(10000),
});

export type BillingConfig = {
  checkoutEnabled: boolean;
  qrisEnabled: boolean;
  environment: "test" | "production";
  apiKey: string;
  webhookToken: string;
  requestTimeoutMs: number;
};

export function parseBillingConfig(environment: Record<string, string | undefined> = process.env): BillingConfig {
  const parsed = billingConfigSchema.parse(environment);
  return {
    checkoutEnabled: parsed.BILLING_CHECKOUT_ENABLED,
    qrisEnabled: parsed.BILLING_QRIS_ENABLED,
    environment: parsed.XENDIT_ENVIRONMENT === "sandbox" ? "test" : "production",
    apiKey: parsed.XENDIT_API_KEY,
    webhookToken: parsed.XENDIT_WEBHOOK_TOKEN,
    requestTimeoutMs: parsed.XENDIT_REQUEST_TIMEOUT_MS,
  };
}

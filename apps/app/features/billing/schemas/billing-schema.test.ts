import { describe, expect, it } from "vitest";
import { createBillingCheckoutSchema, refreshBillingPaymentSchema } from "./billing-schema";

const id = "123e4567-e89b-12d3-a456-426614174000";

describe("billing schemas", () => {
  it("accepts valid checkout identifiers", () => {
    expect(createBillingCheckoutSchema.safeParse({ pricingPlanId: id, paymentMethodCatalogId: id, idempotencyKey: id }).success).toBe(true);
  });

  it.each(["pricingPlanId", "paymentMethodCatalogId", "idempotencyKey"])("rejects invalid %s", (field) => {
    expect(createBillingCheckoutSchema.safeParse({ pricingPlanId: id, paymentMethodCatalogId: id, idempotencyKey: id, [field]: "bad" }).success).toBe(false);
  });

  it("rejects extra checkout fields", () => {
    expect(createBillingCheckoutSchema.safeParse({ pricingPlanId: id, paymentMethodCatalogId: id, idempotencyKey: id, extra: true }).success).toBe(false);
  });

  it.each([[id, true], ["bad", false]])("validates refresh payment id", (paymentId, success) => {
    expect(refreshBillingPaymentSchema.safeParse({ paymentId }).success).toBe(success);
  });
});

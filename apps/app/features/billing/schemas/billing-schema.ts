import { z } from "zod";

export const createBillingCheckoutSchema = z.object({
  pricingPlanId: z.string().uuid("Select a valid pricing plan."),
  paymentMethodCatalogId: z.string().uuid("Select a valid payment method."),
  idempotencyKey: z.string().uuid("Invalid checkout request."),
}).strict();

export const refreshBillingPaymentSchema = z.object({
  paymentId: z.string().uuid("Invalid payment."),
}).strict();

import { z } from "zod";

export const createBillingCheckoutSchema = z.object({
  pricingPlanId: z.string().uuid("Select a valid pricing plan."),
  paymentMethodCatalogId: z.string().uuid("Select a valid payment method."),
  idempotencyKey: z.string().uuid("Invalid checkout request."),
}).strict();

export const refreshBillingPaymentSchema = z.object({
  paymentId: z.string().uuid("Invalid payment."),
}).strict();

export const simulateBillingPaymentSchema = z.object({
  paymentId: z.string({ error: "Invalid payment." }).uuid("Invalid payment."),
}).strict();

export const listBillingPaymentsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(10),
}).strict();

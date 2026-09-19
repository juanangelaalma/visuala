import { z } from "zod";

export const createBillingCheckoutBodySchema = z.object({
  pricingPlanId: z.string().uuid(),
  paymentMethodCatalogId: z.string().uuid(),
  idempotencyKey: z.string().uuid(),
});

export type CreateBillingCheckoutBody = z.infer<typeof createBillingCheckoutBodySchema>;

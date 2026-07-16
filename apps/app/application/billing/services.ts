import "server-only";

import { createAuthServices } from "@/application/auth/services";
import { SupabaseBillingPaymentRepository, SupabasePaymentCatalogRepository, SupabaseProviderAttemptRepository } from "@/infrastructure/billing/supabase-billing-repositories";
import { SupabaseBillingWebhookRepository } from "@/infrastructure/billing/supabase-billing-webhook-repositories";
import { XenditCheckoutProvider } from "@/infrastructure/billing/xendit-checkout-provider";
import { SupabasePricingPlanRepository } from "@/infrastructure/pricing/supabase-pricing-plan-repository";
import { createSupabaseServerClient } from "@/infrastructure/supabase/server-client";
import { createSupabaseServiceRoleClient } from "@/infrastructure/supabase/service-role-client";
import { parseBillingConfig } from "@/shared/config/billing";

export async function createBillingServices() {
  const config = parseBillingConfig();
  const sessionSupabase = await createSupabaseServerClient();
  const serviceRoleSupabase = createSupabaseServiceRoleClient();
  const { authProvider } = await createAuthServices();
  const gateway = new XenditCheckoutProvider(config);

  return {
    authProvider,
    config,
    checkout: {
      pricingPlans: new SupabasePricingPlanRepository(sessionSupabase),
      paymentCatalog: new SupabasePaymentCatalogRepository(sessionSupabase),
      payments: new SupabaseBillingPaymentRepository(serviceRoleSupabase),
      providerAllocation: {
        allocate: async ({ billingPaymentId, paymentMethod, clientIdempotencyKey }: { billingPaymentId: string; paymentMethod: { id: string }; clientIdempotencyKey: string }) => ({ paymentMethodId: paymentMethod.id, provider: "xendit", environment: config.environment, providerReference: `visuala-${billingPaymentId}`, providerIdempotencyKey: clientIdempotencyKey }),
      },
      attempts: new SupabaseProviderAttemptRepository(serviceRoleSupabase),
      gateways: { resolve: () => gateway },
      isPaymentMethodEnabled: (method: { kind: string }) => method.kind === "qris" ? config.qrisEnabled : method.kind === "virtual_account" ? config.virtualAccountEnabled : false,
    },
    payments: new SupabaseBillingPaymentRepository(serviceRoleSupabase),
    xendit: gateway,
  };
}

export function createBillingWorkerServices() {
  const config = parseBillingConfig();
  const supabase = createSupabaseServiceRoleClient();
  return { config, webhooks: new SupabaseBillingWebhookRepository(supabase), xendit: new XenditCheckoutProvider(config) };
}

import type { SupabaseClient } from "@supabase/supabase-js";
import { createPaymentMethodFeaturePolicy } from "@/application/billing/payment-method-feature-policy";
import type { BillingGatewayResolver, TrustedProviderAllocation } from "@/domain/billing/contracts";
import { UnsupportedBillingGatewayError } from "@/domain/billing/errors";
import type { PaymentMethod } from "@/domain/billing/types";
import { SupabaseBillingPaymentRepository, SupabasePaymentCatalogRepository, SupabaseProviderAttemptRepository } from "@/infrastructure/billing/supabase-billing-repositories";
import { SupabaseBillingWebhookRepository } from "@/infrastructure/billing/supabase-billing-webhook-repositories";
import { XenditCheckoutProvider } from "@/infrastructure/billing/xendit-checkout-provider";
import type { BillingConfig } from "@/infrastructure/config/billing";
import { SupabasePricingPlanRepository } from "@/infrastructure/pricing/supabase-pricing-plan-repository";
import { createSupabaseServiceRoleClient } from "@/infrastructure/supabase/clients";
import type { Database } from "@visuala/db";

type ProviderAllocationInput = {
  billingPaymentId: string;
  paymentMethod: PaymentMethod;
  clientIdempotencyKey: string;
};

export function createBillingServices(supabase: SupabaseClient<Database>, config: BillingConfig) {
  const serviceRoleSupabase = createSupabaseServiceRoleClient();
  const gateway = new XenditCheckoutProvider(config);
  const payments = new SupabaseBillingPaymentRepository(serviceRoleSupabase);
  const gateways: BillingGatewayResolver = {
    resolve(provider, environment) {
      if (provider !== "xendit" || environment !== config.environment) throw new UnsupportedBillingGatewayError("Unsupported billing gateway");

      return gateway;
    },
  };

  return {
    config,
    checkout: {
      pricingPlans: new SupabasePricingPlanRepository(supabase),
      paymentCatalog: new SupabasePaymentCatalogRepository(supabase),
      payments,
      providerAllocation: {
        allocate: async ({ billingPaymentId, paymentMethod, clientIdempotencyKey }: ProviderAllocationInput): Promise<TrustedProviderAllocation> => ({
          paymentMethodId: paymentMethod.id,
          provider: "xendit",
          environment: config.environment,
          providerReference: `visuala-${billingPaymentId}`,
          providerIdempotencyKey: clientIdempotencyKey,
        }),
      },
      attempts: new SupabaseProviderAttemptRepository(serviceRoleSupabase),
      gateways,
      isPaymentMethodEnabled: createPaymentMethodFeaturePolicy(config),
    },
    simulation: { payments, gateways, configuredEnvironment: config.environment },
    payments,
    xendit: gateway,
  };
}

export function createBillingWorkerServices(config: BillingConfig) {
  const supabase = createSupabaseServiceRoleClient();

  return { config, webhooks: new SupabaseBillingWebhookRepository(supabase), xendit: new XenditCheckoutProvider(config) };
}

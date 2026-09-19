import { Elysia, t } from "elysia";
import { createBillingCheckout } from "@/application/billing/create-billing-checkout";
import { getOwnedBillingPayment } from "@/application/billing/get-owned-billing-payment";
import { canSimulateBillingPayment } from "@/application/billing/payment-simulation-eligibility";
import { prepareBillingCheckout } from "@/application/billing/prepare-billing-checkout";
import { refreshOwnedBillingPayment } from "@/application/billing/refresh-owned-billing-payment";
import { createBillingServices } from "@/application/billing/services";
import { simulateOwnedBillingPayment } from "@/application/billing/simulate-owned-billing-payment";
import { getBillingConfig } from "@/infrastructure/config/billing";
import { authPlugin } from "@/plugins/supabase";
import { createBillingCheckoutBodySchema } from "@/schemas/billing";

export const billingRoutes = new Elysia({ name: "billing-routes" })
  .use(authPlugin)
  .get(
    "/billing/plans/:planId/checkout",
    async ({ params, status, supabase }) => {
      const services = createBillingServices(supabase, getBillingConfig());
      const plan = await services.checkout.pricingPlans.findActiveById(params.planId);
      if (!plan) return status(404, { error: "Not found." });

      try {
        const prepared = await prepareBillingCheckout(services.checkout, { plan, checkoutEnabled: services.config.checkoutEnabled });

        return { plan, ...prepared };
      } catch (error) {
        console.error("Failed to prepare billing checkout", error);

        return { plan, checkoutAvailable: false, methods: [], unavailableMessage: "Payment methods are temporarily unavailable. Try again later." };
      }
    },
    { auth: true, detail: { tags: ["billing"] } },
  )
  .post(
    "/billing/checkout",
    async ({ body, status, supabase, user }) => {
      const parsed = createBillingCheckoutBodySchema.safeParse(body);
      if (!parsed.success) return status(422, { error: "Invalid request." });

      const services = createBillingServices(supabase, getBillingConfig());
      if (!services.config.checkoutEnabled || (!services.config.qrisEnabled && !services.config.virtualAccountEnabled)) {
        return status(409, { error: "Checkout is unavailable." });
      }

      const payment = await createBillingCheckout(services.checkout, { ...parsed.data, userId: user.id });
      if (!payment) return status(500, { error: "Could not create checkout." });

      return { payment };
    },
    { auth: true, body: t.Unknown(), detail: { tags: ["billing"] } },
  )
  .get(
    "/billing/payments/:id",
    async ({ params, supabase, user }) => {
      const config = getBillingConfig();
      const services = createBillingServices(supabase, config);
      const payment = await getOwnedBillingPayment(services.payments, { paymentId: params.id, userId: user.id });

      return { payment, canSimulate: canSimulateBillingPayment(payment, config.environment) };
    },
    { auth: true, detail: { tags: ["billing"] } },
  )
  .get(
    "/billing/payments/:id/refresh",
    async ({ params, supabase, user }) => {
      const services = createBillingServices(supabase, getBillingConfig());

      return { payment: await refreshOwnedBillingPayment({ payments: services.payments }, { paymentId: params.id, userId: user.id }) };
    },
    { auth: true, detail: { tags: ["billing"] } },
  )
  .post(
    "/billing/payments/:id/simulate",
    async ({ params, supabase, user }) => {
      const services = createBillingServices(supabase, getBillingConfig());
      await simulateOwnedBillingPayment(services.simulation, { paymentId: params.id, userId: user.id });

      return { message: "Simulation sent. Wait for the webhook, then refresh payment status." };
    },
    { auth: true, detail: { tags: ["billing"] } },
  );

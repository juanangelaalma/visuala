import { Elysia } from "elysia";
import { receiveBillingWebhook } from "@/application/billing/receive-billing-webhook";
import { createBillingWorkerServices } from "@/application/billing/services";
import { XenditWebhookVerificationError } from "@/infrastructure/billing/xendit-checkout-provider";
import { getBillingConfig } from "@/infrastructure/config/billing";

export const webhookRoutes = new Elysia({ name: "webhook-routes" }).post(
  "/billing/webhooks/xendit",
  async ({ request, set }) => {
    const respond = (status: number, body: unknown) => {
      set.status = status;
      return body;
    };

    try {
      const services = createBillingWorkerServices(getBillingConfig());
      if (!services.config.checkoutEnabled) return respond(503, { error: "Webhook unavailable." });

      const callbackToken = request.headers.get("x-callback-token");
      services.xendit.verifyWebhookToken(callbackToken);

      let payload: unknown;
      try {
        payload = await request.json();
      } catch {
        return respond(400, { error: "Invalid request." });
      }

      const webhook = services.xendit.verifyAndNormalizeWebhook(callbackToken, payload);
      const result = await receiveBillingWebhook(services.webhooks, webhook);
      if (!result.fulfilled) return respond(503, { error: "Webhook unavailable." });

      return respond(200, { received: true, duplicate: result.duplicate, outcome: result.outcome });
    } catch (error) {
      if (error instanceof XenditWebhookVerificationError) return respond(401, { error: "Unauthorized." });

      console.error("Failed to process Xendit billing webhook", error);
      return respond(503, { error: "Webhook unavailable." });
    }
  },
  { detail: { tags: ["billing"] } },
);

import { receiveBillingWebhook } from "@/application/billing/receive-billing-webhook";
import { createBillingWorkerServices } from "@/application/billing/services";
import { XenditWebhookVerificationError } from "@/infrastructure/billing/xendit-checkout-provider";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const services = createBillingWorkerServices();
    if (!services.config.checkoutEnabled) return Response.json({ error: "Webhook unavailable." }, { status: 503 });
    const callbackToken = request.headers.get("x-callback-token");
    services.xendit.verifyWebhookToken(callbackToken);
    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      return Response.json({ error: "Invalid request." }, { status: 400 });
    }
    const webhook = services.xendit.verifyAndNormalizeWebhook(callbackToken, payload);
    const result = await receiveBillingWebhook(services.webhooks, webhook);
    if (!result.fulfilled) return Response.json({ error: "Webhook unavailable." }, { status: 503 });
    return Response.json({ received: true, duplicate: result.duplicate, outcome: result.outcome });
  } catch (error) {
    if (error instanceof XenditWebhookVerificationError) return Response.json({ error: "Unauthorized." }, { status: 401 });
    console.error("Failed to process Xendit billing webhook", error);
    return Response.json({ error: "Webhook unavailable." }, { status: 503 });
  }
}

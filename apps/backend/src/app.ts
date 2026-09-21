import { Elysia } from "elysia";
import { corsPlugin } from "@/plugins/cors";
import { errorPlugin } from "@/plugins/errors";
import { authPlugin } from "@/plugins/supabase";
import { adminPricingRoutes } from "@/routes/admin-pricing";
import { aiRoutes } from "@/routes/ai";
import { authRoutes } from "@/routes/auth";
import { billingRoutes } from "@/routes/billing";
import { healthRoutes } from "@/routes/health";
import { meRoutes } from "@/routes/me";
import { pricingRoutes } from "@/routes/pricing";
import { videoProjectRoutes } from "@/routes/video";
import { webhookRoutes } from "@/routes/webhooks";

export function createApp() {
  return new Elysia()
    .use(errorPlugin)
    .use(corsPlugin)
    .use(authPlugin)
    .use(healthRoutes)
    .use(pricingRoutes)
    .use(adminPricingRoutes)
    .use(meRoutes)
    .use(billingRoutes)
    .use(webhookRoutes)
    .use(authRoutes)
    .use(aiRoutes)
    .use(videoProjectRoutes);
}

export const app = createApp();

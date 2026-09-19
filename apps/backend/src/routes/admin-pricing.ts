import { Elysia, t } from "elysia";
import { createPricingPlan } from "@/application/pricing/create-pricing-plan";
import { deletePricingPlan } from "@/application/pricing/delete-pricing-plan";
import { listPricingPlans } from "@/application/pricing/list-pricing-plans";
import { createPricingServices } from "@/application/pricing/services";
import { updatePricingPlan } from "@/application/pricing/update-pricing-plan";
import { authPlugin } from "@/plugins/supabase";
import { pricingPlanBodySchema } from "@/schemas/pricing-plan";

const invalidRequest = { error: "Invalid request." } as const;
const planBody = { body: t.Unknown() } as const;

export const adminPricingRoutes = new Elysia({ name: "admin-pricing-routes" })
  .use(authPlugin)
  .get(
    "/admin/pricing-plans",
    async ({ supabase }) => {
      const { pricingPlanRepository } = createPricingServices(supabase);

      return { plans: await listPricingPlans(pricingPlanRepository) };
    },
    { admin: true, detail: { tags: ["admin"] } },
  )
  .post(
    "/admin/pricing-plans",
    async ({ body, status, supabase }) => {
      const parsed = pricingPlanBodySchema.safeParse(body);
      if (!parsed.success) return status(422, invalidRequest);

      const { pricingPlanRepository } = createPricingServices(supabase);

      return { plan: await createPricingPlan(pricingPlanRepository, parsed.data) };
    },
    { admin: true, ...planBody, detail: { tags: ["admin"] } },
  )
  .put(
    "/admin/pricing-plans/:id",
    async ({ body, params, status, supabase }) => {
      const parsed = pricingPlanBodySchema.safeParse(body);
      if (!parsed.success) return status(422, invalidRequest);

      const { pricingPlanRepository } = createPricingServices(supabase);

      return { plan: await updatePricingPlan(pricingPlanRepository, params.id, parsed.data) };
    },
    { admin: true, ...planBody, detail: { tags: ["admin"] } },
  )
  .delete(
    "/admin/pricing-plans/:id",
    async ({ params, supabase }) => {
      const { pricingPlanRepository } = createPricingServices(supabase);
      await deletePricingPlan(pricingPlanRepository, params.id);

      return { deleted: true };
    },
    { admin: true, detail: { tags: ["admin"] } },
  );

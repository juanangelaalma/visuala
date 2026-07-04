"use server";

import { revalidatePath } from "next/cache";
import { createPricingPlan } from "@/application/pricing/create-pricing-plan";
import { deletePricingPlan } from "@/application/pricing/delete-pricing-plan";
import { createPricingServices } from "@/application/pricing/services";
import { updatePricingPlan } from "@/application/pricing/update-pricing-plan";
import { requireAdmin } from "@/application/auth/require-admin";
import { pricingPlanSchema } from "../schemas/pricing-plan-schema";

export type PricingPlanActionState = {
  error?: string;
  message?: string;
};

export async function savePricingPlanAction(_: PricingPlanActionState, formData: FormData): Promise<PricingPlanActionState> {
  await requireAdmin();

  const parsed = pricingPlanSchema.safeParse(Object.fromEntries(formData));

  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Please check pricing details." };

  try {
    const { id, ...input } = parsed.data;
    const { pricingPlanRepository } = await createPricingServices({ writable: true });

    if (id) {
      await updatePricingPlan(pricingPlanRepository, id, input);
    } else {
      await createPricingPlan(pricingPlanRepository, input);
    }
  } catch {
    return { error: "Could not save pricing plan." };
  }

  revalidatePath("/admin/pricing");
  return { message: "Pricing plan saved." };
}

export async function deletePricingPlanAction(formData: FormData): Promise<void> {
  await requireAdmin();

  const id = formData.get("id");

  if (typeof id !== "string" || !id) return;

  try {
    const { pricingPlanRepository } = await createPricingServices({ writable: true });
    await deletePricingPlan(pricingPlanRepository, id);
  } catch {
    return;
  }

  revalidatePath("/admin/pricing");
}

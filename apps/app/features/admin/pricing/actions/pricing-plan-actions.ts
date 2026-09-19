"use server";

import { revalidatePath } from "next/cache";
import { apiFetch } from "@/lib/api/client";
import { requireAdmin } from "@/lib/auth/session";
import { pricingPlanSchema } from "../schemas/pricing-plan-schema";

export type PricingPlanActionState = {
  error?: string;
  message?: string;
};

export async function savePricingPlanAction(_: PricingPlanActionState, formData: FormData): Promise<PricingPlanActionState> {
  await requireAdmin();

  const parsed = pricingPlanSchema.safeParse(Object.fromEntries(formData));

  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Please check pricing details." };

  const { id, ...input } = parsed.data;

  try {
    if (id) {
      await apiFetch(`/admin/pricing-plans/${encodeURIComponent(id)}`, { method: "PUT", body: input });
    } else {
      await apiFetch("/admin/pricing-plans", { method: "POST", body: input });
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
    await apiFetch(`/admin/pricing-plans/${encodeURIComponent(id)}`, { method: "DELETE" });
  } catch {
    return;
  }

  revalidatePath("/admin/pricing");
}

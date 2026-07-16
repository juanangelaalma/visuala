import type { CreditPricingPlan } from "@visuala/ui";
import { PricingPeriodTabs } from "@visuala/ui";

type BillingPlansSelectorProps = {
  plans: CreditPricingPlan[];
};

export function BillingPlansSelector({ plans }: BillingPlansSelectorProps) {
  return <PricingPeriodTabs plans={plans} variant="marketing" emptyMessage="No pricing plans are currently available." />;
}

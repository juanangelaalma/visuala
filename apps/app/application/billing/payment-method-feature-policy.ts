import type { PaymentMethod } from "@/domain/billing/types";
import type { BillingConfig } from "@/shared/config/billing";

export function createPaymentMethodFeaturePolicy(config: BillingConfig) {
  return function isPaymentMethodEnabled(method: PaymentMethod) {
    if (method.kind === "qris") return config.qrisEnabled;
    if (method.kind === "virtual_account") return config.virtualAccountEnabled;
    return false;
  };
}

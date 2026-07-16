import type { PaymentCatalogRepository } from "@/domain/billing/contracts";

export async function listEnabledPaymentMethods(repository: PaymentCatalogRepository) {
  return repository.listEnabled();
}

import type { BillingPaymentRepository } from "@/domain/billing/contracts";

export async function listOwnedBillingPayments(repository: BillingPaymentRepository, input: { userId: string; page: number; pageSize: number }) {
  const offset = (input.page - 1) * input.pageSize;
  return repository.listOwnedProjections({ userId: input.userId, offset, limit: input.pageSize });
}

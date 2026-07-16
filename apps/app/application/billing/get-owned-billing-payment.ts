import type { BillingPaymentRepository } from "@/domain/billing/contracts";
import { BillingPaymentNotFoundError } from "@/domain/billing/errors";

export async function getOwnedBillingPayment(repository: BillingPaymentRepository, input: { paymentId: string; userId: string }) {
  const payment = await repository.findOwnedProjection(input.paymentId, input.userId);
  if (!payment) throw new BillingPaymentNotFoundError("Billing payment not found");
  return payment;
}

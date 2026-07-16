import type { BillingWebhookRepository } from "@/domain/billing/contracts";
import type { NormalizedWebhook } from "@/domain/billing/types";

export async function receiveBillingWebhook(repository: BillingWebhookRepository, webhook: NormalizedWebhook) {
  const receipt = await repository.receive(webhook);
  const outcome = await repository.fulfill(receipt.eventId);
  return { ...receipt, outcome, fulfilled: outcome !== "retryable" };
}

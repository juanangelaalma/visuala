import type { BillingWebhookRepository } from "@/domain/billing/contracts";

export async function recordBillingWebhookFailure(repository: BillingWebhookRepository, input: { eventId: string; sanitizedError: string; maxAttempts?: number; baseDelaySeconds?: number; maxDelaySeconds?: number }) {
  return repository.recordFailure(input.eventId, input.sanitizedError, {
    maxAttempts: input.maxAttempts ?? 8,
    baseDelaySeconds: input.baseDelaySeconds ?? 30,
    maxDelaySeconds: input.maxDelaySeconds ?? 3600,
  });
}

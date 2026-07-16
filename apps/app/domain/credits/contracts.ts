import type { CreditGrant, CreditLedgerEntry, CreditWallet } from "./types";

export interface CreditRepository {
  findWalletByOwner(userId: string): Promise<CreditWallet | null>;
  listOwnedGrants(userId: string): Promise<CreditGrant[]>;
  listOwnedLedgerEntries(userId: string): Promise<CreditLedgerEntry[]>;
}

export interface AtomicCreditFulfillment {
  fulfillBillingWebhook(eventId: string): Promise<string>;
  recordBillingWebhookFailure(eventId: string, sanitizedError: string, maxAttempts: number, baseDelaySeconds: number, maxDelaySeconds: number): Promise<boolean>;
}

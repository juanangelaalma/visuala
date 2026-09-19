export type CreditWallet = { userId: string; balance: number; createdAt: string; updatedAt: string };
export type CreditGrant = { id: string; userId: string; billingPaymentId: string; pricingPlanId: string; amount: number; remainingAmount: number; grantedAt: string; expiresAt: string };
export type CreditLedgerEntryType = "purchase_grant" | "spend" | "expiration" | "adjustment" | "reversal";
export type CreditLedgerEntry = { id: string; userId: string; billingPaymentId: string | null; creditGrantId: string | null; entryType: CreditLedgerEntryType; amount: number; balanceAfter: number; idempotencyKey: string; createdAt: string };

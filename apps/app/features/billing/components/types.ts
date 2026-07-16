export type BillingPaymentMethodOption = {
  id: string;
  kind: "qris" | "virtual_account" | "ewallet";
  label: string;
  description: string | null;
  enabled: boolean;
  launchPhase: number;
};

export type CheckoutSummarySnapshot = {
  planName: string;
  priceAmount: number;
  currency: "IDR";
  baseCredits: number;
  bonusCredits: number;
  creditExpiresInDays: number;
  paymentMethodLabel?: string;
};

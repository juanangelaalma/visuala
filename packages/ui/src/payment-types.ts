export type CheckoutSummary = {
    planName: string;
    amount: number;
    currency: string;
    credits: number;
    bonusCredits: number;
    creditExpiresInDays: number;
    feesAmount?: number;
    dueTodayAmount: number;
    benefits: string[];
};

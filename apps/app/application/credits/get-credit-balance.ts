import type { CreditRepository } from "@/domain/credits/contracts";

export async function getCreditBalance(repository: CreditRepository, userId: string) {
  const wallet = await repository.findWalletByOwner(userId);
  return wallet?.balance ?? 0;
}

import { describe, expect, it, vi } from "vitest";
import { getCreditBalance } from "./get-credit-balance";

const wallet = {
  userId: "user-1",
  balance: 12500,
  createdAt: "2026-07-18T00:00:00.000Z",
  updatedAt: "2026-07-18T00:00:00.000Z",
};

describe("getCreditBalance", () => {
  it("returns wallet balance", async () => {
    const repository = { findWalletByOwner: vi.fn().mockResolvedValue(wallet) };

    await expect(getCreditBalance(repository as never, "user-1")).resolves.toBe(12500);
  });

  it("returns zero when wallet is missing", async () => {
    const repository = { findWalletByOwner: vi.fn().mockResolvedValue(null) };

    await expect(getCreditBalance(repository as never, "user-1")).resolves.toBe(0);
  });

  it("propagates repository errors", async () => {
    const error = new Error("credit wallet query failed");
    const repository = { findWalletByOwner: vi.fn().mockRejectedValue(error) };

    await expect(getCreditBalance(repository as never, "user-1")).rejects.toBe(error);
  });
});

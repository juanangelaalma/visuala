import type { ReactNode } from "react";
import DashboardShell from "../_components/DashboardShell";
import { getCurrentUser } from "@/application/auth/get-current-user";
import { createAuthServices } from "@/application/auth/services";
import { getCreditBalance } from "@/application/credits/get-credit-balance";
import { createCreditServices } from "@/application/credits/services";

type DashboardLayoutProps = {
  children: ReactNode;
};

export default async function DashboardLayout({ children }: DashboardLayoutProps) {
  const { authProvider } = await createAuthServices();
  const currentUser = await getCurrentUser(authProvider);
  const { creditRepository } = await createCreditServices();
  const creditBalance = currentUser ? await getCreditBalance(creditRepository, currentUser.id) : undefined;

  return <DashboardShell currentUser={currentUser} creditBalance={creditBalance}>{children}</DashboardShell>;
}

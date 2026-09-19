import type { ReactNode } from "react";
import DashboardShell from "../_components/DashboardShell";
import { apiFetch } from "@/lib/api/client";
import { getSessionContext } from "@/lib/auth/session";

type DashboardLayoutProps = {
  children: ReactNode;
};

export default async function DashboardLayout({ children }: DashboardLayoutProps) {
  const session = await getSessionContext();
  const creditBalance = session ? (await apiFetch<{ balance: number }>("/me/credits")).balance : undefined;

  return (
    <DashboardShell currentUser={session?.user ?? null} creditBalance={creditBalance}>
      {children}
    </DashboardShell>
  );
}

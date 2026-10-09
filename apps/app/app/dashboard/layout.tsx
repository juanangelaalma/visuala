import type { ReactNode } from "react";
import DashboardShell from "../_components/DashboardShell";
import { apiFetch } from "@/lib/api/client";
import { getSessionContext } from "@/lib/auth/session";
import "@/features/fnb/creator.css";

type DashboardLayoutProps = {
  children: ReactNode;
};

export default async function DashboardLayout({ children }: DashboardLayoutProps) {
  const session = await getSessionContext();
  const creditBalance = session
    ? await apiFetch<{ balance: number }>("/me/credits").then(({ balance }) => balance).catch(() => undefined)
    : undefined;

  return (
    <DashboardShell currentUser={session?.user ?? null} creditBalance={creditBalance}>
      {children}
    </DashboardShell>
  );
}

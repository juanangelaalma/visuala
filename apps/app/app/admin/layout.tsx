import type { ReactNode } from "react";
import { requireAdmin } from "@/application/auth/require-admin";
import DashboardShell, { adminDashboardSections } from "../_components/DashboardShell";

type AdminLayoutProps = {
  children: ReactNode;
};

export default async function AdminLayout({ children }: AdminLayoutProps) {
  const currentUser = await requireAdmin();

  return (
    <DashboardShell sections={adminDashboardSections} showCreateButton={false} currentUser={currentUser}>
      {children}
    </DashboardShell>
  );
}

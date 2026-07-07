import type { ReactNode } from "react";
import DashboardShell from "../_components/DashboardShell";
import { getCurrentUser } from "@/application/auth/get-current-user";
import { createAuthServices } from "@/application/auth/services";

type DashboardLayoutProps = {
  children: ReactNode;
};

export default async function DashboardLayout({ children }: DashboardLayoutProps) {
  const { authProvider } = await createAuthServices();
  const currentUser = await getCurrentUser(authProvider);

  return <DashboardShell currentUser={currentUser}>{children}</DashboardShell>;
}

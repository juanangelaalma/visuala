"use client";

import { DashboardSidebar, type DashboardSidebarSection } from "@visuala/ui";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useRef, type ReactNode } from "react";
import { logoutAction } from "@/features/auth/actions/auth-actions";
import type { AuthUser } from "@/domain/auth/types";

const defaultDashboardSections: DashboardSidebarSection[] = [
  {
    title: "Video",
    items: [
      { id: "campaigns", label: "Campaign saya", href: "/dashboard" },
      { id: "create", label: "Buat Video", href: "/dashboard/videos/new" },
    ],
  },
];

export const adminDashboardSections: DashboardSidebarSection[] = [
  {
    title: "Admin",
    items: [
      { id: "admin-dashboard", label: "Dashboard", href: "/admin/dashboard" },
      { id: "admin-pricing", label: "Pricing", href: "/admin/pricing" },
    ],
  },
];

type DashboardShellProps = {
  children: ReactNode;
  sections?: DashboardSidebarSection[];
  showCreateButton?: boolean;
  currentUser: AuthUser | null;
  creditBalance?: number;
};

function getActiveItemId(pathname: string, sections: DashboardSidebarSection[]) {
  const items = sections.flatMap((section) => section.items);
  const pathToItemId = Object.fromEntries(items.flatMap((item) => (item.href ? [[item.href, item.id]] : [])));
  const exactMatch = pathToItemId[pathname];

  if (exactMatch) return exactMatch;

  const matchedPath = Object.keys(pathToItemId)
    .filter((path) => path !== "/" && pathname.startsWith(`${path}/`))
    .sort((a, b) => b.length - a.length)[0];

  return matchedPath ? pathToItemId[matchedPath] : sections[0]?.items[0]?.id ?? "";
}

export default function DashboardShell({ children, sections = defaultDashboardSections, showCreateButton = false, currentUser, creditBalance }: DashboardShellProps) {
  const pathname = usePathname();
  const logoutFormRef = useRef<HTMLFormElement>(null);
  const showPricingCta = sections === defaultDashboardSections;
  const pricingIsActive = pathname === "/billing/plans" || pathname.startsWith("/billing/plans/");
  const activeItemId = useMemo(() => getActiveItemId(pathname, sections), [pathname, sections]);

  function handleLogout() {
    logoutFormRef.current?.requestSubmit();
  }

  const profile = {
    name: currentUser?.fullName || currentUser?.email || "",
    plan: "Akun Visuala",
    avatarUrl: currentUser?.avatarUrl ?? undefined,
    avatarAlt: currentUser?.fullName ?? undefined,
  };

  return (
    <div className="min-h-dvh bg-dark-bg p-3 md:h-dvh md:overflow-hidden md:p-4">
      <div className="flex h-full gap-5">
        <div className="hidden h-full shrink-0 lg:block">
          <DashboardSidebar profile={profile} items={sections} activeItemId={activeItemId} creditBalance={creditBalance} className="h-full min-h-0" onLogout={handleLogout} />
        </div>
        <form ref={logoutFormRef} action={logoutAction} className="hidden" />

        <div className="flex min-w-0 flex-1 flex-col gap-4 md:overflow-y-auto">
          <nav aria-label="Navigasi dashboard" className="flex flex-wrap items-center gap-2 rounded-2xl bg-[#161616] p-3 lg:hidden">
            {sections.flatMap((section) => section.items).map((item) => item.href ? (
              <Link key={item.id} href={item.href} className="inline-flex min-h-11 items-center rounded-xl px-3 text-sm text-white focus-visible:outline-2 focus-visible:outline-[#EFF31B]" aria-current={activeItemId === item.id ? "page" : undefined}>{item.label}</Link>
            ) : null)}
            <button type="button" onClick={handleLogout} className="min-h-11 rounded-xl px-3 text-sm text-white focus-visible:outline-2 focus-visible:outline-[#EFF31B]">Keluar</button>
          </nav>
          <header className="hidden min-h-13 items-center justify-between gap-3 lg:flex">
            <p className="text-sm font-medium text-white/75">{showPricingCta ? "Studio promo F&B" : "Administrasi Visuala"}</p>
            <div className="flex items-center gap-3">
              {showPricingCta ? (
                <Link href="/billing/plans" aria-current={pricingIsActive ? "page" : undefined} className="inline-flex min-h-11 items-center rounded-xl border border-[#EFF31B] px-4 text-sm text-white focus-visible:outline-2 focus-visible:outline-[#EFF31B]">Lihat paket video</Link>
              ) : null}
              {showCreateButton ? (
                <Link href="/dashboard/videos/new" className="inline-flex min-h-11 items-center rounded-xl bg-[#EFF31B] px-4 text-sm font-semibold text-black focus-visible:outline-2 focus-visible:outline-white">Buat Video</Link>
              ) : null}
            </div>
          </header>
          <main className="min-w-0 flex-1">{children}</main>
        </div>
      </div>
    </div>
  );
}

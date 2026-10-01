"use client";

import { DashboardFooter, DashboardNavbar, DashboardSidebar, type DashboardSidebarSection } from "@visuala/ui";
import { usePathname } from "next/navigation";
import { useMemo, useRef, useState, type ReactNode } from "react";
import { logoutAction } from "@/features/auth/actions/auth-actions";
import type { AuthUser } from "@/domain/auth/types";

function VideoIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="h-6 w-6">
      <rect x="3" y="6" width="12" height="12" rx="3" />
      <path d="m15 11 5-3v8l-5-3" />
    </svg>
  );
}

const defaultDashboardSections: DashboardSidebarSection[] = [
  {
    title: "Main",
    items: [
      { id: "videos", label: "Video", href: "/dashboard/videos", icon: <VideoIcon /> },
      { id: "home", label: "Home", href: "/dashboard/home" },
      { id: "analytics", label: "Analytics", href: "/dashboard/analytics" },
    ],
  },
  {
    title: "Organize",
    items: [
      { id: "brands", label: "Brands", href: "/dashboard/brands" },
      { id: "campaigns", label: "Campaigns", href: "/dashboard/campaigns" },
      { id: "folders", label: "Folders", href: "/dashboard/folders" },
      { id: "favorites", label: "Favorites", href: "/dashboard/favorites" },
    ],
  },
  {
    title: "More",
    items: [
      { id: "templates", label: "Templates", href: "/dashboard/templates" },
      { id: "more-tools", label: "More Tools", href: "/dashboard/tools" },
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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const isDefaultSections = sections === defaultDashboardSections;
  const showPricingCta = isDefaultSections;
  const pricingIsActive = pathname === "/billing/plans" || pathname.startsWith("/billing/plans/");
  const activeItemId = useMemo(() => getActiveItemId(pathname, sections), [pathname, sections]);

  function handleLogout() {
    logoutFormRef.current?.requestSubmit();
  }

  const profile = {
    name: currentUser?.fullName ?? "",
    plan: "Free Account",
    avatarUrl: currentUser?.avatarUrl ?? undefined,
    avatarAlt: currentUser?.fullName ?? undefined,
  };

  return (
    <div className="min-h-dvh bg-dark-bg p-3 sm:p-4 lg:h-dvh lg:overflow-hidden">
      <div className="flex min-h-0 flex-col gap-4 lg:h-full lg:flex-row lg:gap-8">
        <button
          type="button"
          aria-expanded={mobileMenuOpen}
          aria-controls="dashboard-menu"
          className="inline-flex min-h-11 items-center justify-between rounded-full border border-white/15 bg-pricing-bg px-4 text-sm font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary lg:hidden"
          onClick={() => {
            setSidebarCollapsed(false);
            setMobileMenuOpen((open) => !open);
          }}
        >
          <span>{mobileMenuOpen ? "Tutup menu" : "Menu dashboard"}</span>
          <span aria-hidden="true">{mobileMenuOpen ? "−" : "+"}</span>
        </button>
        <div
          id="dashboard-menu"
          className={`${mobileMenuOpen ? "block" : "hidden"} min-h-0 shrink-0 lg:block`}
          onClick={(event) => {
            if (event.target instanceof Element && event.target.closest("a[href]")) setMobileMenuOpen(false);
          }}
        >
          <DashboardSidebar
            profile={profile}
            items={sections}
            activeItemId={activeItemId}
            creditBalance={creditBalance}
            collapsed={sidebarCollapsed}
            onCollapsedChange={setSidebarCollapsed}
            className="shrink-0 max-lg:min-h-0 max-lg:w-full lg:h-full lg:min-h-0"
            onLogout={handleLogout}
          />
        </div>
        <form ref={logoutFormRef} action={logoutAction} className="hidden" />

        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-4 lg:overflow-y-auto">
          <DashboardNavbar
            showCreateButton={showCreateButton || isDefaultSections}
            createHref="/dashboard/videos/new"
            createLabel="Buat video"
            showPricingCta={showPricingCta}
            pricingIsActive={pricingIsActive}
          />
          <main className="min-w-0 flex-1">{children}</main>
          <DashboardFooter />
        </div>
      </div>
    </div>
  );
}

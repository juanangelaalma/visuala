"use client";

import { DashboardFooter, DashboardNavbar, DashboardSidebar, type DashboardSidebarItem, type DashboardSidebarSection } from "@visuala/ui";
import { usePathname } from "next/navigation";
import { useMemo, useRef, type ReactNode } from "react";
import { logoutAction } from "@/features/auth/actions/auth-actions";
import type { AuthUser } from "@/domain/auth/types";

const defaultDashboardSections: DashboardSidebarSection[] = [
  {
    title: "Main",
    items: [
      { id: "create-story-board", label: "Create Story Board", href: "/dashboard" },
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
      { id: "profile-settings", label: "Profile Settings", href: "/dashboard/profile" },
      { id: "logout", label: "Logout" },
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
};

function getActiveItemId(pathname: string, sections: DashboardSidebarSection[]) {
  const pathToItemId = Object.fromEntries(sections.flatMap((section) => section.items.flatMap((item) => (item.href ? [[item.href, item.id]] : []))));
  const exactMatch = pathToItemId[pathname];
  if (exactMatch) return exactMatch;

  const matchedPath = Object.keys(pathToItemId)
    .filter((path) => path !== "/" && pathname.startsWith(path))
    .sort((a, b) => b.length - a.length)[0];

  return matchedPath ? pathToItemId[matchedPath] : sections[0]?.items[0]?.id ?? "";
}

export default function DashboardShell({ children, sections = defaultDashboardSections, showCreateButton = true, currentUser }: DashboardShellProps) {
  const pathname = usePathname();
  const logoutFormRef = useRef<HTMLFormElement>(null);
  const activeItemId = useMemo(() => getActiveItemId(pathname, sections), [pathname, sections]);

  function handleItemSelect(item: DashboardSidebarItem) {
    if (item.id === "logout") logoutFormRef.current?.requestSubmit();
  }

  const profile = {
    name: currentUser?.fullName ?? "",
    plan: "Free Account",
    avatarUrl: currentUser?.avatarUrl ?? undefined,
    avatarAlt: currentUser?.fullName ?? undefined,
  };

  return (
    <div className="h-screen overflow-hidden bg-dark-bg p-4">
      <div className="flex h-full gap-8">
        <DashboardSidebar profile={profile} items={sections} activeItemId={activeItemId} className="h-full min-h-0 shrink-0" onItemSelect={handleItemSelect} />
        <form ref={logoutFormRef} action={logoutAction} className="hidden" />

        <div className="flex min-w-0 flex-1 flex-col gap-4 overflow-y-auto">
          <DashboardNavbar showCreateButton={showCreateButton} />
          <main className="min-w-0 flex-1">{children}</main>
          <DashboardFooter />
        </div>
      </div>
    </div>
  );
}

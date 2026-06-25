"use client";

import { DashboardFooter, DashboardNavbar, DashboardSidebar, type DashboardSidebarSection } from "@visuala/ui";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

const dashboardSections: DashboardSidebarSection[] = [
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
      { id: "logout", label: "Logout", href: "/logout" },
    ],
  },
];

const pathToItemId = Object.fromEntries(dashboardSections.flatMap((section) => section.items.map((item) => [item.href, item.id])));

type DashboardShellProps = {
  children: ReactNode;
};

function getActiveItemId(pathname: string) {
  const exactMatch = pathToItemId[pathname];
  if (exactMatch) return exactMatch;

  const matchedPath = Object.keys(pathToItemId)
    .filter((path) => path !== "/" && pathname.startsWith(path))
    .sort((a, b) => b.length - a.length)[0];

  return matchedPath ? pathToItemId[matchedPath] : "create-story-board";
}

export default function DashboardShell({ children }: DashboardShellProps) {
  const pathname = usePathname();

  return (
    <div className="h-screen overflow-hidden bg-dark-bg p-4">
      <div className="flex h-full gap-8">
        <DashboardSidebar items={dashboardSections} activeItemId={getActiveItemId(pathname)} className="h-full min-h-0 shrink-0" />

        <div className="flex min-w-0 flex-1 flex-col gap-4 overflow-y-auto">
          <DashboardNavbar />
          <main className="min-w-0 flex-1">{children}</main>
          <DashboardFooter />
        </div>
      </div>
    </div>
  );
}

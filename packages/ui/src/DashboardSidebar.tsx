"use client";

import Image, { type StaticImageData } from "next/image";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import Brand from "./Brand";

export type DashboardSidebarItem = {
    id: string;
    label: string;
    icon?: ReactNode;
    href?: string;
};

export type DashboardSidebarSection = {
    title: string;
    items: DashboardSidebarItem[];
};

export type DashboardSidebarProfile = {
    name: string;
    plan: string;
    avatarSrc?: string | StaticImageData;
    avatarAlt?: string;
};

export type DashboardSidebarProps = {
    items?: DashboardSidebarSection[];
    activeItemId?: string;
    profile?: DashboardSidebarProfile;
    logo?: ReactNode;
    className?: string;
    collapsed?: boolean;
    defaultCollapsed?: boolean;
    onCollapsedChange?: (collapsed: boolean) => void;
    onItemSelect?: (item: DashboardSidebarItem) => void;
    onCollapse?: () => void;
    onProfileClick?: () => void;
};

type IconName =
    | "create"
    | "home"
    | "analytics"
    | "brands"
    | "campaigns"
    | "folders"
    | "favorites"
    | "templates"
    | "tools"
    | "profile"
    | "logout";

type DefaultDashboardSidebarItem = DashboardSidebarItem & {
    iconName: IconName;
};

const defaultSections: Array<{ title: string; items: DefaultDashboardSidebarItem[] }> = [
    {
        title: "Main",
        items: [
            { id: "create-story-board", label: "Create Story Board", iconName: "create" },
            { id: "home", label: "Home", iconName: "home" },
            { id: "analytics", label: "Analytics", iconName: "analytics" },
        ],
    },
    {
        title: "Organize",
        items: [
            { id: "brands", label: "Brands", iconName: "brands" },
            { id: "campaigns", label: "Campaigns", iconName: "campaigns" },
            { id: "folders", label: "Folders", iconName: "folders" },
            { id: "favorites", label: "Favorites", iconName: "favorites" },
        ],
    },
    {
        title: "More",
        items: [
            { id: "templates", label: "Templates", iconName: "templates" },
            { id: "more-tools", label: "More Tools", iconName: "tools" },
            { id: "profile-settings", label: "Profile Settings", iconName: "profile" },
            { id: "logout", label: "Logout", iconName: "logout" },
        ],
    },
];

const defaultProfile: DashboardSidebarProfile = {
    name: "Achmad Q",
    plan: "Free Account",
};

const sidebarClassNames = {
    root: "flex min-h-screen flex-col rounded-2xl bg-pricing-bg py-6 text-white transition-all duration-300",
    rootExpanded: "w-60 px-4",
    rootCollapsed: "w-20 px-3",
    header: "relative mb-8 flex h-7 items-center",
    headerExpanded: "justify-between",
    headerCollapsed: "justify-center",
    logo: "h-7 w-32 text-white",
    iconButton: "inline-flex h-6 w-6 items-center justify-center text-neutral-450 transition-colors hover:text-white",
    collapseButton: "inline-flex h-10 w-10 items-center justify-center border-neutral-500 bg-transparent text-neutral-450 transition-colors hover:border-white hover:text-white",
    menu: "flex flex-col gap-4",
    section: "flex flex-col gap-3",
    sectionTitle: "font-sans-secondary text-xs font-medium text-neutral-450",
    itemGroup: "flex flex-col",
    item: "flex h-13 w-full items-center rounded-full font-display text-sm font-medium transition-colors",
    itemExpanded: "gap-4 px-4",
    itemCollapsed: "justify-center px-0",
    itemActive: "bg-primary text-pricing-bg",
    itemInactive: "bg-pricing-bg text-white hover:bg-surface-3",
    itemIcon: "inline-flex h-6 w-6 shrink-0 items-center justify-center",
    divider: "h-px w-full bg-surface-3",
    profile: "mt-auto flex h-10 w-full items-center mb-4",
    profileExpanded: "justify-between",
    profileCollapsed: "justify-center",
    profileMain: "flex min-w-0 items-center gap-3",
    avatar: "flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-neutral-800 font-sans text-sm font-semibold text-white",
    avatarImage: "h-10 w-10 rounded-full object-cover",
    profileText: "min-w-0 grid",
    profileName: "truncate font-sans text-sm font-semibold text-white",
    profilePlan: "truncate font-sans text-xs font-medium text-neutral-450",
} as const;

function cx(...classNames: Array<string | undefined | false>) {
    return classNames.filter(Boolean).join(" ");
}

function getInitials(name: string) {
    return name
        .split(" ")
        .filter(Boolean)
        .map((part) => part[0])
        .join("")
        .slice(0, 2)
        .toUpperCase();
}

function CollapseIcon({ isCollapsed }: { isCollapsed: boolean }) {
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="h-6 w-6">
            <circle cx="12" cy="12" r="9" />
            <path d={isCollapsed ? "m11 8 4 4-4 4" : "m13 8-4 4 4 4"} />
        </svg>
    );
}

function ChevronDownIcon() {
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="h-6 w-6">
            <circle cx="12" cy="12" r="9" />
            <path d="m8.5 10.5 3.5 3.5 3.5-3.5" />
        </svg>
    );
}

function SidebarIcon({ name }: { name: IconName }) {
    switch (name) {
        case "create":
            return (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="h-6 w-6">
                    <path d="M13.5 5.5 18 10" />
                    <path d="M4 20h4.5L19 9.5a3.2 3.2 0 0 0-4.5-4.5L4 15.5V20Z" />
                    <path d="M4 22h16" />
                </svg>
            );
        case "home":
            return (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="h-6 w-6">
                    <path d="m3 11 9-8 9 8" />
                    <path d="M5 10v10h14V10" />
                    <path d="M9 20v-6h6v6" />
                </svg>
            );
        case "analytics":
            return (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="h-6 w-6">
                    <path d="M4 19V5" />
                    <path d="M4 19h16" />
                    <path d="M8 16V9" />
                    <path d="M12 16V6" />
                    <path d="M16 16v-4" />
                </svg>
            );
        case "brands":
            return (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="h-6 w-6">
                    <path d="M12 3 5 6v6c0 4.5 3 7.5 7 9 4-1.5 7-4.5 7-9V6l-7-3Z" />
                    <path d="m9 12 2 2 4-5" />
                </svg>
            );
        case "campaigns":
            return (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="h-6 w-6">
                    <path d="M4 13h3l9 4V7l-9 4H4v2Z" />
                    <path d="M7 13v5" />
                    <path d="M19 9a4 4 0 0 1 0 6" />
                </svg>
            );
        case "folders":
            return (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="h-6 w-6">
                    <path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v2" />
                    <path d="M3 10h18l-2 9H5l-2-9Z" />
                </svg>
            );
        case "favorites":
            return (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="h-6 w-6">
                    <path d="M20.5 8.5c0 5-8.5 10.5-8.5 10.5S3.5 13.5 3.5 8.5A4.5 4.5 0 0 1 12 6a4.5 4.5 0 0 1 8.5 2.5Z" />
                </svg>
            );
        case "templates":
            return (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="h-6 w-6">
                    <path d="M4 20 16.5 7.5a2.1 2.1 0 0 1 3 3L7 23H4v-3Z" />
                    <path d="M14 10 17 13" />
                    <path d="M5 5h4" />
                    <path d="M7 3v4" />
                </svg>
            );
        case "tools":
            return (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="h-6 w-6">
                    <rect x="4" y="4" width="7" height="7" rx="2" />
                    <rect x="13" y="4" width="7" height="7" rx="2" />
                    <rect x="4" y="13" width="7" height="7" rx="2" />
                    <rect x="13" y="13" width="7" height="7" rx="2" />
                </svg>
            );
        case "profile":
            return (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="h-6 w-6">
                    <circle cx="12" cy="8" r="4" />
                    <path d="M4 21a8 8 0 0 1 16 0" />
                </svg>
            );
        case "logout":
            return (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="h-6 w-6">
                    <path d="M10 5H5v14h5" />
                    <path d="M14 8l4 4-4 4" />
                    <path d="M18 12H9" />
                </svg>
            );
    }
}

function getDefaultIcon(item: DashboardSidebarItem) {
    const match = defaultSections.flatMap((section) => section.items).find((defaultItem) => defaultItem.id === item.id);
    return match ? <SidebarIcon name={match.iconName} /> : null;
}

function SidebarItem({
    item,
    isActive,
    isCollapsed,
    onItemSelect,
}: {
    item: DashboardSidebarItem;
    isActive: boolean;
    isCollapsed: boolean;
    onItemSelect?: (item: DashboardSidebarItem) => void;
}) {
    const className = cx(
        sidebarClassNames.item,
        isCollapsed ? sidebarClassNames.itemCollapsed : sidebarClassNames.itemExpanded,
        isActive ? sidebarClassNames.itemActive : sidebarClassNames.itemInactive,
    );
    const icon = item.icon ?? getDefaultIcon(item);
    const content = (
        <>
            <span className={sidebarClassNames.itemIcon}>{icon}</span>
            {isCollapsed ? null : <span className="truncate">{item.label}</span>}
        </>
    );

    if (item.href) {
        return (
            <Link href={item.href} className={className} aria-current={isActive ? "page" : undefined} title={isCollapsed ? item.label : undefined}>
                {content}
            </Link>
        );
    }

    if (onItemSelect) {
        return (
            <button type="button" className={cx(className, "cursor-pointer text-left")} aria-current={isActive ? "page" : undefined} title={isCollapsed ? item.label : undefined} onClick={() => onItemSelect(item)}>
                {content}
            </button>
        );
    }

    return <div className={className} title={isCollapsed ? item.label : undefined}>{content}</div>;
}

function Avatar({ profile }: { profile: DashboardSidebarProfile }) {
    if (profile.avatarSrc) {
        return <Image src={profile.avatarSrc} alt={profile.avatarAlt ?? profile.name} width={40} height={40} className={sidebarClassNames.avatarImage} />;
    }

    return <span className={sidebarClassNames.avatar}>{getInitials(profile.name)}</span>;
}

export default function DashboardSidebar({
    items = defaultSections,
    activeItemId = "create-story-board",
    profile = defaultProfile,
    logo,
    className = "",
    collapsed,
    defaultCollapsed = false,
    onCollapsedChange,
    onItemSelect,
    onCollapse,
    onProfileClick,
}: DashboardSidebarProps) {
    const [internalCollapsed, setInternalCollapsed] = useState(defaultCollapsed);
    const isCollapsed = collapsed ?? internalCollapsed;

    function handleCollapse() {
        const nextCollapsed = !isCollapsed;

        if (collapsed === undefined) {
            setInternalCollapsed(nextCollapsed);
        }

        onCollapsedChange?.(nextCollapsed);
        onCollapse?.();
    }

    const profileContent = (
        <>
            <span className={sidebarClassNames.profileMain}>
                <Avatar profile={profile} />
                {isCollapsed ? null : (
                    <span className={sidebarClassNames.profileText}>
                        <span className={sidebarClassNames.profileName}>{profile.name}</span>
                        <span className={sidebarClassNames.profilePlan}>{profile.plan}</span>
                    </span>
                )}
            </span>
            {isCollapsed ? null : (
                <span className={sidebarClassNames.iconButton}>
                    <ChevronDownIcon />
                </span>
            )}
        </>
    );

    return (
        <aside className={cx(sidebarClassNames.root, isCollapsed ? sidebarClassNames.rootCollapsed : sidebarClassNames.rootExpanded, className)} aria-label="Dashboard menu">
            <div className={cx(sidebarClassNames.header, isCollapsed ? sidebarClassNames.headerCollapsed : sidebarClassNames.headerExpanded)}>
                {isCollapsed ? <Brand variant="mark" className="h-7 w-7" /> : logo ?? <Brand variant="full" className={sidebarClassNames.logo} />}
                <button
                    type="button"
                    aria-label={isCollapsed ? "Expand dashboard menu" : "Collapse dashboard menu"}
                    aria-expanded={!isCollapsed}
                    className={cx(sidebarClassNames.collapseButton, "cursor-pointer", isCollapsed ? "absolute -right-8" : undefined)}
                    onClick={handleCollapse}
                >
                    <CollapseIcon isCollapsed={isCollapsed} />
                </button>
            </div>

            <nav className={sidebarClassNames.menu} aria-label="Dashboard navigation">
                {items.map((section, sectionIndex) => (
                    <div key={section.title} className={sidebarClassNames.section}>
                        {sectionIndex > 0 ? <div className={sidebarClassNames.divider} /> : null}
                        {isCollapsed ? null : <p className={sidebarClassNames.sectionTitle}>{section.title}</p>}
                        <div className={sidebarClassNames.itemGroup}>
                            {section.items.map((item) => (
                                <SidebarItem key={item.id} item={item} isActive={item.id === activeItemId} isCollapsed={isCollapsed} onItemSelect={onItemSelect} />
                            ))}
                        </div>
                    </div>
                ))}
            </nav>

            {onProfileClick ? (
                <button type="button" className={cx(sidebarClassNames.profile, isCollapsed ? sidebarClassNames.profileCollapsed : sidebarClassNames.profileExpanded, "cursor-pointer text-left")} onClick={onProfileClick}>
                    {profileContent}
                </button>
            ) : (
                <div className={cx(sidebarClassNames.profile, isCollapsed ? sidebarClassNames.profileCollapsed : sidebarClassNames.profileExpanded)}>{profileContent}</div>
            )}
        </aside>
    );
}

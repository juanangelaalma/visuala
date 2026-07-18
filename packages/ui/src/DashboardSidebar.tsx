"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
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
    avatarUrl?: string;
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
    creditBalance?: number;
    profileSettingsHref?: string;
    onLogout?: () => void;
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
    | "logout"
    | "admin-dashboard"
    | "pricing";

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
        ],
    },
];

const allDefaultItems: DefaultDashboardSidebarItem[] = [
    ...defaultSections.flatMap((section) => section.items),
    { id: "admin-dashboard", label: "Dashboard", iconName: "admin-dashboard" },
    { id: "admin-pricing", label: "Pricing", iconName: "pricing" },
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
    itemInactive: "bg-pricing-bg text-white hover:bg-dark-bg",
    itemIcon: "inline-flex h-6 w-6 shrink-0 items-center justify-center",
    divider: "h-px w-full bg-surface-3",
    credit: "mb-4 flex py-4 min-h-13 w-full items-center font-sans transition-colors rounded-2xl focus-visible:outline-2 focus-visible:outline-primary",
    creditExpanded: "gap-3 px-3 py-2",
    creditCollapsed: "flex-col justify-center gap-0.5 px-1 py-2",
    creditIcon: "inline-flex h-6 w-6 shrink-0 items-center justify-center text-primary",
    profile: "flex h-10 w-full items-center",
    profileExpanded: "justify-between",
    profileCollapsed: "justify-center",
    profileMain: "flex min-w-0 items-center gap-3",
    avatar: "flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-neutral-800 font-sans text-sm font-semibold text-white",
    avatarImage: "h-10 w-10 rounded-full object-cover",
    profileText: "min-w-0 grid",
    profileName: "truncate font-sans text-sm font-semibold text-white",
    profilePlan: "truncate font-sans text-xs font-medium text-neutral-450",
    accountMenu: "absolute bottom-0 left-full z-20 ml-3 w-52 rounded-2xl border border-white/10 bg-dark-bg p-2 shadow-lg",
    accountMenuItem: "flex w-full items-center gap-3 rounded-xl px-3 py-2 font-sans text-sm font-medium transition-colors hover:bg-surface-3 focus-visible:outline-2 focus-visible:outline-primary",
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

function CreditIcon() {
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="h-6 w-6">
            <circle cx="12" cy="12" r="9" />
            <path d="M15 9.5c-.6-.7-1.6-1-3-1-1.7 0-3 .8-3 2s1.3 2 3 2 3 .8 3 2-1.3 2-3 2c-1.4 0-2.4-.3-3-1" />
            <path d="M12 6.5v2M12 16.5v2" />
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
        case "admin-dashboard":
            return (
                <svg viewBox="0 0 24 24" aria-hidden="true" className="h-6 w-6">
                    <path d="M0 0h24v24H0z" fill="none" />
                    <path fill="currentColor" d="M13 8V4q0-.425.288-.712T14 3h6q.425 0 .713.288T21 4v4q0 .425-.288.713T20 9h-6q-.425 0-.712-.288T13 8M3 12V4q0-.425.288-.712T4 3h6q.425 0 .713.288T11 4v8q0 .425-.288.713T10 13H4q-.425 0-.712-.288T3 12m10 8v-8q0-.425.288-.712T14 11h6q.425 0 .713.288T21 12v8q0 .425-.288.713T20 21h-6q-.425 0-.712-.288T13 20M3 20v-4q0-.425.288-.712T4 15h6q.425 0 .713.288T11 16v4q0 .425-.288.713T10 21H4q-.425 0-.712-.288T3 20m2-9h4V5H5zm10 8h4v-6h-4zm0-12h4V5h-4zM5 19h4v-2H5zm4-2" />
                </svg>
            );
        case "pricing":
            return (
                <svg viewBox="0 0 24 24" aria-hidden="true" className="h-6 w-6">
                    <path d="M0 0h24v24H0z" fill="none" />
                    <path fill="currentColor" d="M13.71 3.29A1 1 0 0 0 13 3H4c-.55 0-1 .45-1 1v9c0 .27.11.52.29.71l8 8c.2.2.45.29.71.29s.51-.1.71-.29l9-9a.996.996 0 0 0 0-1.41zM12 19.58l-7-7V4.99h7.59l7 7z" />
                    <path fill="currentColor" d="M9 7c-1.11 0-2 .9-2 2s.9 2 2 2s2-.9 2-2s-.9-2-2-2" />
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
    const match = allDefaultItems.find((defaultItem) => defaultItem.id === item.id);
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
    if (profile.avatarUrl) {
        return <img src={profile.avatarUrl} alt={profile.avatarAlt ?? profile.name} className={sidebarClassNames.avatarImage} />;
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
    creditBalance,
    profileSettingsHref = "/dashboard/profile",
    onLogout,
}: DashboardSidebarProps) {
    const [internalCollapsed, setInternalCollapsed] = useState(defaultCollapsed);
    const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false);
    const accountMenuRef = useRef<HTMLDivElement>(null);
    const accountMenuTriggerRef = useRef<HTMLButtonElement>(null);
    const isCollapsed = collapsed ?? internalCollapsed;
    const fullCreditBalance = creditBalance?.toLocaleString("id-ID");
    const compactCreditBalance = creditBalance === undefined ? undefined : new Intl.NumberFormat("id-ID", { notation: "compact" }).format(creditBalance);

    useEffect(() => {
        if (!isAccountMenuOpen) return;

        function handleKeyDown(event: KeyboardEvent) {
            if (event.key !== "Escape") return;
            setIsAccountMenuOpen(false);
            accountMenuTriggerRef.current?.focus();
        }

        function handlePointerDown(event: PointerEvent) {
            if (!accountMenuRef.current?.contains(event.target as Node)) setIsAccountMenuOpen(false);
        }

        document.addEventListener("keydown", handleKeyDown);
        document.addEventListener("pointerdown", handlePointerDown);
        return () => {
            document.removeEventListener("keydown", handleKeyDown);
            document.removeEventListener("pointerdown", handlePointerDown);
        };
    }, [isAccountMenuOpen]);

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
                <span className={cx(sidebarClassNames.iconButton, "transition-transform", isAccountMenuOpen && "rotate-180")}>
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

            <div ref={accountMenuRef} className="relative mt-auto mb-4">
                {creditBalance === undefined ? null : (
                    <Link
                        href="/billing/plans"
                        aria-label={`Credit balance ${fullCreditBalance} credits`}
                        className={cx(sidebarClassNames.credit, isCollapsed ? sidebarClassNames.creditCollapsed : sidebarClassNames.creditExpanded)}
                    >
                        <span className={sidebarClassNames.creditIcon}><CreditIcon /></span>
                        {isCollapsed ? (
                            <span className="text-xs font-semibold text-white">{compactCreditBalance}</span>
                        ) : (
                            <span className="min-w-0">
                                <span className="block text-xs font-medium text-neutral-450">Credit balance</span>
                                <span className="block truncate text-sm font-semibold text-white">{fullCreditBalance} credits</span>
                            </span>
                        )}
                    </Link>
                )}

                {isAccountMenuOpen ? (
                    <div data-testid="account-actions" className={sidebarClassNames.accountMenu}>
                        <Link href={profileSettingsHref} className={cx(sidebarClassNames.accountMenuItem, "text-white")} onClick={() => setIsAccountMenuOpen(false)}>
                            <SidebarIcon name="profile" />
                            <span>Profile Settings</span>
                        </Link>
                        {onLogout ? (
                            <button
                                type="button"
                                className={cx(sidebarClassNames.accountMenuItem, "cursor-pointer text-tertiary")}
                                onClick={() => {
                                    setIsAccountMenuOpen(false);
                                    onLogout();
                                }}
                            >
                                <SidebarIcon name="logout" />
                                <span>Logout</span>
                            </button>
                        ) : null}
                    </div>
                ) : null}
                <button
                    ref={accountMenuTriggerRef}
                    type="button"
                    aria-label="Open account menu"
                    aria-expanded={isAccountMenuOpen}
                    className={cx(sidebarClassNames.profile, isCollapsed ? sidebarClassNames.profileCollapsed : sidebarClassNames.profileExpanded, "mb-0 cursor-pointer text-left")}
                    onClick={() => setIsAccountMenuOpen((isOpen) => !isOpen)}
                >
                    {profileContent}
                </button>
            </div>
        </aside>
    );
}

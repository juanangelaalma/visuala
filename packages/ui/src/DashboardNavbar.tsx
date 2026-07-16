import type { ChangeEvent, ReactNode } from "react";
import Button from "./Button";

export type DashboardNavbarProps = {
    searchPlaceholder?: string;
    searchValue?: string;
    onSearchChange?: (value: string) => void;
    onSettingsClick?: () => void;
    onNotificationsClick?: () => void;
    pricingLabel?: string;
    pricingHref?: string;
    pricingIsActive?: boolean;
    showPricingCta?: boolean;
    createLabel?: string;
    createHref?: string;
    onCreateClick?: () => void;
    showCreateButton?: boolean;
    className?: string;
};

const navbarClassNames = {
    root: "flex h-21 w-full items-center justify-between rounded-2xl bg-dark-bg",
    search: "flex h-13 w-125 items-center gap-4 rounded-full bg-pricing-bg px-3.5 text-white",
    searchText: "min-w-0 flex-1 bg-transparent font-sans-secondary text-base font-medium text-white outline-none placeholder:text-neutral-450",
    searchStaticText: "min-w-0 flex-1 truncate font-sans-secondary text-base font-medium text-neutral-450",
    icon: "inline-flex h-6 w-6 shrink-0 items-center justify-center",
    actions: "flex h-13 items-center gap-3",
    iconButton: "inline-flex h-13 w-13 items-center justify-center rounded-full bg-pricing-bg text-white transition-colors hover:bg-surface-3",
    iconDisplay: "inline-flex h-13 w-13 items-center justify-center rounded-full bg-pricing-bg text-white",
    pricingButton: "h-13 gap-2 border border-primary/40 bg-primary/10 px-5 font-sans-secondary text-sm font-semibold text-white hover:border-primary hover:bg-primary/20",
    pricingButtonActive: "border-primary bg-primary text-black hover:bg-primary-dark",
    createButton: "h-13 px-7 font-sans-secondary text-sm font-semibold",
} as const;

function cx(...classNames: Array<string | undefined | false>) {
    return classNames.filter(Boolean).join(" ");
}

function SearchIcon() {
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="h-6 w-6">
            <circle cx="11" cy="11" r="7" />
            <path d="m16 16 4 4" />
        </svg>
    );
}

function SettingsIcon() {
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="h-6 w-6">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.8 1.8 0 0 0 .4 2l.1.1a2 2 0 0 1-2.8 2.8l-.1-.1a1.8 1.8 0 0 0-2-.4 1.8 1.8 0 0 0-1 1.6V21a2 2 0 0 1-4 0v-.1a1.8 1.8 0 0 0-1-1.6 1.8 1.8 0 0 0-2 .4l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.8 1.8 0 0 0 .4-2 1.8 1.8 0 0 0-1.6-1H3a2 2 0 0 1 0-4h.1a1.8 1.8 0 0 0 1.6-1 1.8 1.8 0 0 0-.4-2l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.8 1.8 0 0 0 2 .4 1.8 1.8 0 0 0 1-1.6V3a2 2 0 0 1 4 0v.1a1.8 1.8 0 0 0 1 1.6 1.8 1.8 0 0 0 2-.4l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.8 1.8 0 0 0-.4 2 1.8 1.8 0 0 0 1.6 1h.1a2 2 0 0 1 0 4h-.1a1.8 1.8 0 0 0-1.7 1Z" />
        </svg>
    );
}

function NotificationIcon() {
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="h-6 w-6">
            <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
            <path d="M10 21h4" />
            <path d="M12 3V2" />
        </svg>
    );
}

function PricingIcon() {
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="h-5 w-5">
            <path d="M20 13 13 20a2 2 0 0 1-2.8 0L4 13.8V4h9.8l6.2 6.2a2 2 0 0 1 0 2.8Z" />
            <circle cx="9" cy="9" r="1.5" />
        </svg>
    );
}

function NavbarIconAction({
    label,
    onClick,
    children,
}: {
    label: string;
    onClick?: () => void;
    children: ReactNode;
}) {
    if (onClick) {
        return (
            <button type="button" aria-label={label} className={cx(navbarClassNames.iconButton, "cursor-pointer")} onClick={onClick}>
                {children}
            </button>
        );
    }

    return (
        <span aria-label={label} className={navbarClassNames.iconDisplay}>
            {children}
        </span>
    );
}

export default function DashboardNavbar({
    searchPlaceholder = "Search ...",
    searchValue,
    onSearchChange,
    onSettingsClick,
    onNotificationsClick,
    pricingLabel = "Explore plans",
    pricingHref = "/billing/plans",
    pricingIsActive = false,
    showPricingCta = false,
    createLabel = "Create Scene ✨",
    createHref,
    onCreateClick,
    showCreateButton = true,
    className = "",
}: DashboardNavbarProps) {
    const handleSearchChange = (event: ChangeEvent<HTMLInputElement>) => {
        onSearchChange?.(event.target.value);
    };

    return (
        <header className={cx(navbarClassNames.root, className)}>
            <div className={navbarClassNames.search} role={onSearchChange ? "search" : undefined}>
                <span className={navbarClassNames.icon}>
                    <SearchIcon />
                </span>
                {onSearchChange ? (
                    <input
                        type="search"
                        aria-label="Search"
                        placeholder={searchPlaceholder}
                        value={searchValue}
                        onChange={handleSearchChange}
                        className={navbarClassNames.searchText}
                    />
                ) : (
                    <span className={navbarClassNames.searchStaticText}>{searchValue || searchPlaceholder}</span>
                )}
            </div>

            <div className={navbarClassNames.actions}>
                {showPricingCta ? (
                    <Button
                        href={pricingHref}
                        variant="primary"
                        tone="dark"
                        aria-current={pricingIsActive ? "page" : undefined}
                        className={cx(navbarClassNames.pricingButton, pricingIsActive && navbarClassNames.pricingButtonActive)}
                    >
                        <PricingIcon />
                        {pricingLabel}
                    </Button>
                ) : null}
                <NavbarIconAction label="Open settings" onClick={onSettingsClick}>
                    <SettingsIcon />
                </NavbarIconAction>
                <NavbarIconAction label="Open notifications" onClick={onNotificationsClick}>
                    <NotificationIcon />
                </NavbarIconAction>
                {showCreateButton ? (
                    createHref ? (
                        <Button href={createHref} variant="primary" tone="dark" className={navbarClassNames.createButton}>
                            {createLabel}
                        </Button>
                    ) : (
                        <Button variant="primary" tone="dark" className={navbarClassNames.createButton} onClick={onCreateClick}>
                            {createLabel}
                        </Button>
                    )
                ) : null}
            </div>
        </header>
    );
}

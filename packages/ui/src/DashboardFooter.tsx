import Link from "next/link";

export type DashboardFooterLink = {
    label: string;
    href: string;
};

export type DashboardFooterProps = {
    copyright?: string;
    links?: DashboardFooterLink[];
    className?: string;
};

const defaultLinks: DashboardFooterLink[] = [
    { label: "Creative Tim", href: "#" },
    { label: "About Us", href: "#" },
    { label: "Blog", href: "#" },
    { label: "License", href: "#" },
];

const dashboardFooterClassNames = {
    root: "flex w-full flex-col gap-3 rounded-lg px-4 py-3 font-sans-secondary text-xs font-medium leading-5 text-neutral-650 md:flex-row md:items-center md:justify-between",
    linkGroup: "flex flex-wrap items-center gap-6",
    link: "transition-colors hover:text-white",
    brand: "font-semibold text-primary",
} as const;

function cx(...classNames: Array<string | undefined | false>) {
    return classNames.filter(Boolean).join(" ");
}

function DashboardFooterLinkItem({ link }: { link: DashboardFooterLink }) {
    if (link.href.startsWith("http")) {
        return (
            <a href={link.href} target="_blank" rel="noopener noreferrer" className={dashboardFooterClassNames.link}>
                {link.label}
            </a>
        );
    }

    return (
        <Link href={link.href} className={dashboardFooterClassNames.link}>
            {link.label}
        </Link>
    );
}

export default function DashboardFooter({
    copyright,
    links = defaultLinks,
    className = "",
}: DashboardFooterProps) {
    return (
        <footer className={cx(dashboardFooterClassNames.root, className)} role="contentinfo">
            <p>
                {copyright ?? (
                    <>
                        © 2026, made by <span className={dashboardFooterClassNames.brand}>VISUALA AI</span> Empowering Advertising & Marketing
                    </>
                )}
            </p>
            <nav aria-label="Footer navigation" className={dashboardFooterClassNames.linkGroup}>
                {links.map((link) => (
                    <DashboardFooterLinkItem key={`${link.label}-${link.href}`} link={link} />
                ))}
            </nav>
        </footer>
    );
}

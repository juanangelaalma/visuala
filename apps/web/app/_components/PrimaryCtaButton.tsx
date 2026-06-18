import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";
import Button from "./Button";

type PrimaryCtaButtonBaseProps = {
    children: ReactNode;
    className?: string;
    glow?: boolean;
    tone?: "light" | "dark";
    trailingIcon?: ReactNode;
};

type PrimaryCtaButtonProps = PrimaryCtaButtonBaseProps &
    (
        | (Omit<ButtonHTMLAttributes<HTMLButtonElement>, keyof PrimaryCtaButtonBaseProps> & { href?: undefined })
        | (Omit<AnchorHTMLAttributes<HTMLAnchorElement>, keyof PrimaryCtaButtonBaseProps | "href"> & { href: string })
    );

export default function PrimaryCtaButton({
    children,
    className = "",
    glow = false,
    tone = "light",
    trailingIcon,
    ...props
}: PrimaryCtaButtonProps) {
    const button = props.href ? (
        <Button
            {...props}
            variant="solid"
            tone={tone}
            size="lg"
            trailingIcon={trailingIcon}
            className={`gap-3 text-base font-bold uppercase tracking-wide ${className}`}
        >
            {children}
        </Button>
    ) : (
        <Button
            {...props}
            variant="solid"
            tone={tone}
            size="lg"
            trailingIcon={trailingIcon}
            className={`gap-3 text-base font-bold uppercase tracking-wide ${className}`}
        >
            {children}
        </Button>
    );

    if (!glow) return button;

    return (
        <div className="group relative transition-all duration-300">
            <div className="absolute inset-0 rounded-full bg-gradient-to-r from-primary to-white opacity-60 blur-md transition-all duration-300 group-hover:opacity-90" />
            {button}
        </div>
    );
}

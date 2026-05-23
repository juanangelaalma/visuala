import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";

type PrimaryCtaButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
    children: ReactNode;
    className?: string;
    href?: string;
    glow?: boolean;
    tone?: "light" | "dark";
    trailingIcon?: ReactNode;
};

const baseClassName =
    "inline-flex items-center justify-center gap-3 rounded-full px-8 py-4 text-[16px] font-bold uppercase tracking-[0.8px] transition-all duration-300 hover:bg-primary hover:text-black cursor-pointer";

const toneClassNames = {
    light: "bg-white text-black",
    dark: "bg-black text-white",
};

export default function PrimaryCtaButton({
    children,
    className = "",
    href,
    glow = false,
    tone = "light",
    trailingIcon,
    type = "button",
    ...props
}: PrimaryCtaButtonProps) {
    const content = (
        <>
            {children}
            {trailingIcon ? (
                <span className="inline-flex h-5 w-5 items-center justify-center rounded-full font-bold transition-transform duration-300 group-hover:translate-x-1">
                    {trailingIcon}
                </span>
            ) : null}
        </>
    );
    const buttonClassName = `${baseClassName} ${toneClassNames[tone]} ${className}`;

    const button = href ? (
        <Link href={href} className={buttonClassName}>
            {content}
        </Link>
    ) : (
        <button type={type} className={buttonClassName} {...props}>
            {content}
        </button>
    );

    if (!glow) {
        return button;
    }

    return (
        <div className="group relative transition-all duration-300">
            <div className="absolute inset-0 rounded-full bg-gradient-to-r from-primary to-white opacity-60 blur-[15px] transition-all duration-300 group-hover:opacity-90" />
            {button}
        </div>
    );
}

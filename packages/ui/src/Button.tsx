import Link from "next/link";
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";

type ButtonVariant = "primary" | "outline" | "solid";
type ButtonTone = "light" | "dark";
type ButtonSize = "sm" | "md" | "lg";

type ButtonBaseProps = {
    children: ReactNode;
    className?: string;
    variant?: ButtonVariant;
    tone?: ButtonTone;
    size?: ButtonSize;
    trailingIcon?: ReactNode;
};

type ButtonAsButtonProps = ButtonBaseProps &
    Omit<ButtonHTMLAttributes<HTMLButtonElement>, keyof ButtonBaseProps> & {
        href?: undefined;
    };

type ButtonAsLinkProps = ButtonBaseProps &
    Omit<AnchorHTMLAttributes<HTMLAnchorElement>, keyof ButtonBaseProps | "href"> & {
        href: string;
    };

type ButtonProps = ButtonAsButtonProps | ButtonAsLinkProps;

const baseClassName =
    "inline-flex cursor-pointer items-center justify-center rounded-full font-semibold transition-all duration-300";

const variantClassNames: Record<ButtonVariant, Record<ButtonTone, string>> = {
    primary: {
        light: "bg-primary text-black hover:bg-primary-dark",
        dark: "bg-primary text-black hover:bg-primary-dark",
    },
    outline: {
        light: "border-2 border-white bg-transparent text-white hover:bg-white/10",
        dark: "border-2 border-black bg-transparent text-black hover:bg-black/10",
    },
    solid: {
        light: "bg-white text-black hover:bg-primary hover:text-black",
        dark: "bg-black text-white hover:bg-primary hover:text-black",
    },
};

const sizeClassNames: Record<ButtonSize, string> = {
    sm: "px-4 py-2 text-base leading-6",
    md: "px-6 py-3 text-base leading-6",
    lg: "px-8 py-4 text-base leading-6",
};

function getButtonClassName({
    className = "",
    variant = "primary",
    tone = "light",
    size = "sm",
}: Pick<ButtonBaseProps, "className" | "variant" | "tone" | "size">) {
    return [baseClassName, sizeClassNames[size], variantClassNames[variant][tone], className].join(" ");
}

function ButtonContent({ children, trailingIcon }: Pick<ButtonBaseProps, "children" | "trailingIcon">) {
    return (
        <>
            {children}
            {trailingIcon ? <span className="inline-flex h-5 w-5 items-center justify-center">{trailingIcon}</span> : null}
        </>
    );
}

export default function Button(props: ButtonProps) {
    const { children, className, variant, tone, size, trailingIcon } = props;
    const classes = getButtonClassName({ className, variant, tone, size });

    if (props.href) {
        const { href, children: ignoredChildren, className: ignoredClassName, variant: ignoredVariant, tone: ignoredTone, size: ignoredSize, trailingIcon: ignoredTrailingIcon, ...linkProps } = props;
        void ignoredChildren;
        void ignoredClassName;
        void ignoredVariant;
        void ignoredTone;
        void ignoredSize;
        void ignoredTrailingIcon;

        return (
            <Link href={href} className={classes} {...linkProps}>
                <ButtonContent trailingIcon={trailingIcon}>{children}</ButtonContent>
            </Link>
        );
    }

    const buttonOnlyProps = props as ButtonAsButtonProps;
    const { children: ignoredChildren, className: ignoredClassName, variant: ignoredVariant, tone: ignoredTone, size: ignoredSize, trailingIcon: ignoredTrailingIcon, type = "button", ...buttonProps } = buttonOnlyProps;
    void ignoredChildren;
    void ignoredClassName;
    void ignoredVariant;
    void ignoredTone;
    void ignoredSize;
    void ignoredTrailingIcon;

    return (
        <button type={type} className={classes} {...buttonProps}>
            <ButtonContent trailingIcon={trailingIcon}>{children}</ButtonContent>
        </button>
    );
}

import type { ElementType, HTMLAttributes, ReactNode } from "react";

type ContainerProps<T extends ElementType = "div"> = HTMLAttributes<HTMLElement> & {
    as?: T;
    children: ReactNode;
    className?: string;
};

export function Container<T extends ElementType = "div">({
    as,
    children,
    className = "",
    ...props
}: ContainerProps<T>) {
    const Component = as ?? "div";

    return (
        <Component className={`base-container w-full mx-auto ${className}`} {...props}>
            {children}
        </Component>
    );
}

type SectionProps<T extends ElementType = "section"> = HTMLAttributes<HTMLElement> & {
    as?: T;
    children: ReactNode;
    className?: string;
    containerClassName?: string;
    contained?: boolean;
};

export default function Section<T extends ElementType = "section">({
    as,
    children,
    className = "",
    containerClassName = "",
    contained = true,
    ...props
}: SectionProps<T>) {
    const Component = as ?? "section";

    return (
        <Component className={className} {...props}>
            {contained ? <Container className={containerClassName}>{children}</Container> : children}
        </Component>
    );
}

import type { ReactNode } from "react";

type InfiniteMarqueeProps<T> = {
    items: T[];
    renderItem: (item: T, index: number) => ReactNode;
    ariaLabel: string;
    className?: string;
    trackClassName?: string;
    groupClassName?: string;
    duration?: string;
    pauseOnHover?: boolean;
};

export default function InfiniteMarquee<T>({
    items,
    renderItem,
    ariaLabel,
    className = "",
    trackClassName = "",
    groupClassName = "",
    duration = "32s",
    pauseOnHover = true,
}: InfiniteMarqueeProps<T>) {
    return (
        <div className={`infinite-marquee-wrapper ${className}`}>
            <div
                className={`infinite-marquee-track ${pauseOnHover ? "infinite-marquee-pause-on-hover" : ""} ${trackClassName}`}
                style={{ "--marquee-duration": duration } as React.CSSProperties}
                aria-label={ariaLabel}
            >
                {[0, 1].map((groupIndex) => (
                    <div key={groupIndex} className={groupClassName} aria-hidden={groupIndex === 1 ? "true" : undefined}>
                        {items.map((item, index) => renderItem(item, index))}
                    </div>
                ))}
            </div>
        </div>
    );
}

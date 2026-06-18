import Image from "next/image";
import BaseVideo from "../BaseVideo";
import type { ItemType } from "./data";

type ArtisticCardProps = {
    item: ItemType;
};

function ArtisticCardShell({ children, label }: { children?: React.ReactNode; label: string }) {
    return (
        <article className="group relative aspect-square overflow-hidden rounded-xl bg-neutral-800 transition-colors duration-500 hover:bg-neutral-825">
            {children}
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-linear-to-t from-black/50 to-transparent" />
            <div className="absolute bottom-5 left-4 pr-4">
                <span className="font-display text-caption font-normal uppercase tracking-wider text-white drop-shadow-label md:text-base">
                    {label}
                </span>
            </div>
        </article>
    );
}

export default function ArtisticCard({ item }: ArtisticCardProps) {
    if (item.video) {
        return (
            <ArtisticCardShell label={item.label}>
                <BaseVideo
                    src={item.video}
                    ariaLabel={item.label}
                    wrapperClassName="absolute inset-0 h-full w-full"
                    className="size-full object-cover transition-transform duration-700 group-hover:scale-105"
                    lazy
                />
            </ArtisticCardShell>
        );
    }

    if (item.img) {
        return (
            <ArtisticCardShell label={item.label}>
                <Image
                    src={item.img}
                    alt={item.label}
                    fill
                    className="object-cover transition-transform duration-700 group-hover:scale-105"
                    sizes="(max-width: 768px) 50vw, 25vw"
                />
            </ArtisticCardShell>
        );
    }

    return <ArtisticCardShell label={item.label} />;
}

import Image from "next/image";
import { ItemType } from "./data";

interface ArtisticCardProps {
    item: ItemType;
}

export default function ArtisticCard({ item }: ArtisticCardProps) {
    if (item.img) {
        return (
            <div className="relative aspect-square rounded-xl overflow-hidden group">
                <Image
                    src={item.img}
                    alt={item.label}
                    fill
                    className="object-cover transition-transform duration-700 group-hover:scale-105"
                    sizes="(max-width: 768px) 50vw, 25vw"
                />
                {/* Inner shadow overlay, plus gradient for text legibility */}
                <div className="absolute inset-0 bg-linear-to-t from-black/80 via-black/20 to-transparent pointer-events-none" />
                <div className="absolute inset-0 rounded-xl shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)] pointer-events-none" />

                <div className="absolute bottom-4 left-4 md:bottom-6 md:left-6 pr-4">
                    <span className="text-white text-[12px] md:text-[14px] uppercase tracking-wider font-normal">
                        {item.label}
                    </span>
                </div>
            </div>
        );
    }

    return (
        <div className="relative aspect-square rounded-xl bg-[#2A2A2A] overflow-hidden group hover:bg-[#333333] transition-colors duration-500">
            <div className="absolute inset-0 bg-linear-to-b from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            <div className="absolute inset-0 rounded-xl shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)] pointer-events-none" />

            <div className="absolute bottom-4 left-4 md:bottom-6 md:left-6 pr-4">
                <span className="text-[#D6D6D6] text-[12px] md:text-[14px] uppercase tracking-wider font-normal">
                    {item.label}
                </span>
            </div>
        </div>
    );
}

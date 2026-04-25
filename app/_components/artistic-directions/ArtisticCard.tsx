import Image from "next/image";
import { ItemType } from "./data";

interface ArtisticCardProps {
    item: ItemType;
}

export default function ArtisticCard({ item }: ArtisticCardProps) {
    if (item.img) {
        return (
            <div className="relative aspect-square rounded-[12px] overflow-hidden group">
                <Image
                    src={item.img}
                    alt={item.label}
                    fill
                    className="object-cover transition-transform duration-700 group-hover:scale-105"
                    sizes="(max-width: 768px) 50vw, 25vw"
                />
                {/* Bottom shadow gradient matching Figma */}
                <div className="absolute bottom-0 left-0 right-0 h-[50px] bg-gradient-to-t from-black/50 to-transparent pointer-events-none" />

                <div className="absolute bottom-[22px] left-4 pr-4">
                    <span className="text-white text-[14px] md:text-[16px] uppercase tracking-wider font-normal drop-shadow-[0_4px_4px_rgba(0,0,0,0.25)]">
                        {item.label}
                    </span>
                </div>
            </div>
        );
    }

    return (
        <div className="relative aspect-square rounded-[12px] bg-[#333] overflow-hidden group hover:bg-[#3a3a3a] transition-colors duration-500">
            <div className="absolute bottom-0 left-0 right-0 h-[50px] bg-gradient-to-t from-black/50 to-transparent pointer-events-none" />

            <div className="absolute bottom-[22px] left-4 pr-4">
                <span className="text-white text-[14px] md:text-[16px] uppercase tracking-wider font-normal drop-shadow-[0_4px_4px_rgba(0,0,0,0.25)]">
                    {item.label}
                </span>
            </div>
        </div>
    );
}

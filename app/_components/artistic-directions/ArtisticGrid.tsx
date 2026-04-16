import { ItemType } from "./data";
import ArtisticCard from "./ArtisticCard";

interface ArtisticGridProps {
    activeTab: string;
    items: ItemType[];
}

export default function ArtisticGrid({ activeTab, items }: ArtisticGridProps) {
    return (
        <div
            key={activeTab} // Using key to re-trigger the animation when category changes
            className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6 animate-fade-up"
        >
            {items.map((item, index) => (
                <ArtisticCard key={`${activeTab}-${index}`} item={item} />
            ))}
        </div>
    );
}

import { ItemType } from "./data";
import ArtisticCard from "./ArtisticCard";

interface ArtisticGridProps {
    items: ItemType[];
}

export default function ArtisticGrid({ items }: ArtisticGridProps) {
    return (
        <div
            className="grid grid-cols-2 md:grid-cols-4 gap-5"
        >
            {items.map((item, index) => (
                <ArtisticCard key={`${item.label}-${index}`} item={item} />
            ))}
        </div>
    );
}

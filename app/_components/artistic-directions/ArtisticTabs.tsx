"use client";

interface ArtisticTabsProps {
    categories: string[];
    activeTab: string;
    onTabChange: (tab: string) => void;
}

export default function ArtisticTabs({ categories, activeTab, onTabChange }: ArtisticTabsProps) {
    return (
        <div className="flex flex-wrap gap-x-6 md:gap-x-10 gap-y-4 items-center mt-2">
            {categories.map((cat) => {
                const isActive = activeTab === cat;
                return (
                    <button
                        key={cat}
                        onClick={() => onTabChange(cat)}
                        className={`relative cursor-pointer px-1 py-2 text-[14px] md:text-[16px] uppercase tracking-wider transition-colors duration-300 font-medium ${isActive ? "text-white" : "text-[#BABABA] hover:text-white"
                            }`}
                    >
                        {cat}
                        <div
                            className={`absolute -bottom-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-primary transition-opacity duration-300 ${isActive ? "opacity-100" : "opacity-0"
                                }`}
                        />
                    </button>
                );
            })}
        </div>
    );
}

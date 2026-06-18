"use client";

import { useState } from "react";
import { categories, categoryData } from "./data";
import ArtisticTabs from "./ArtisticTabs";
import ArtisticGrid from "./ArtisticGrid";

export default function ArtisticBoard() {
    const [activeTab, setActiveTab] = useState(categories[0]);
    const items = categoryData[activeTab] || categoryData["UGC"];

    return (
        <div className="base-container mx-auto flex flex-col gap-10">
            {/* Header Block */}
            <div className="flex font-display flex-col gap-10">
                <h2 className="text-section-sm md:text-section-md font-medium leading-tight md:leading-tight tracking-tight text-white max-w-4xl">
                    Explore ideas from<br />
                    <span className="text-primary">hundreds</span> of <span className="text-primary">artistic</span><br />
                    directions
                </h2>

                {/* Tabs / Categories */}
                <ArtisticTabs
                    categories={categories}
                    activeTab={activeTab}
                    onTabChange={setActiveTab}
                />
            </div>

            {/* Grid Content */}
            <ArtisticGrid items={items} />
        </div>
    );
}

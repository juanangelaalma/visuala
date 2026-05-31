import InfiniteMarquee from "../_components/InfiniteMarquee";
import CategoryVideoTile from "./CategoryVideoTile";

const categories = [
    { title: "GENERAL", src: "/videos/categories/general.mp4" },
    { title: "BEAUTY", src: "/videos/categories/beauty.mp4" },
    { title: "FASHION", src: "/videos/categories/fashion.mp4" },
    { title: "FITNES", src: "/videos/categories/fitnes.mp4" },
    { title: "FOOD", src: "/videos/categories/food.mp4" },
    { title: "OTOMOTIF", src: "/videos/categories/otomotif.mp4" },
    { title: "UGC", src: "/videos/categories/ugc.mp4" },
];

export default function CategoriesSection() {
    return (
        <section className="bg-primary py-16 md:py-24 pl-4 pr-0 lg:px-4 md:px-8 w-full flex flex-col gap-10">
            <div className="base-container w-full mx-auto flex flex-col gap-10">
                <h2 className="text-5xl font-display font-medium text-black leading-tight tracking-tight">
                    What do you want<br />to create?
                </h2>

                <InfiniteMarquee
                    items={categories}
                    ariaLabel="Scrolling categories video examples"
                    duration="36s"
                    className="w-full pb-4 pr-4 md:pr-0"
                    trackClassName="items-center"
                    groupClassName="flex items-center gap-4 pr-4 md:gap-[7.5px] md:pr-[7.5px]"
                    renderItem={(cat) => (
                        <div
                            key={cat.title}
                            className="relative aspect-259/459 w-[70vw] flex-none cursor-pointer overflow-hidden rounded-[12px] transition-shadow hover:shadow-lg sm:w-[45vw] lg:w-[259px] group"
                        >
                            <CategoryVideoTile
                                src={cat.src.replace(/\.mp4$/, ".m3u8")}
                                fallbackSrc={cat.src}
                                title={cat.title}
                            />
                        </div>
                    )}
                />
            </div>
        </section>
    );
}

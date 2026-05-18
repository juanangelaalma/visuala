import MoreDemoVideoTile from "./MoreDemoVideoTile";

const videos = [
    { src: "/showcase-video/eyelash", label: "Eyelash extension demo" },
    { src: "/showcase-video/leaves", label: "Floral portrait demo" },
    { src: "/showcase-video/car", label: "Luxury car showroom demo" },
];

export default function MoreDemoSection() {
    return (
        <section className="bg-black pb-[80px] pl-[16px] lg:p-[80px] w-full overflow-hidden">
            <div className="flex overflow-x-auto pr-[16px] md:pr-[0px] gap-4 md:gap-6 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] snap-x snap-mandatory base-container">
                {videos.map((video) => (
                    <div
                        key={video.src}
                        className="relative flex-none w-[75vw] sm:w-[50vw] md:w-[35vw] lg:w-[450px] lg:h-[800px] aspect-[9/16] rounded-2xl overflow-hidden snap-center"
                    >
                        <MoreDemoVideoTile src={video.src} label={video.label} />
                    </div>
                ))}
            </div>
        </section>
    );
}

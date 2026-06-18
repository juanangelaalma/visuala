import MoreDemoVideoTile from "./MoreDemoVideoTile";

const videos = [
    { src: "/showcase-video/eyelash", label: "Eyelash extension demo" },
    { src: "/showcase-video/leaves", label: "Floral portrait demo" },
    { src: "/showcase-video/car", label: "Luxury car showroom demo" },
];

export default function MoreDemoSection() {
    return (
        <section className="bg-black pb-20 pl-4 lg:p-20 w-full overflow-hidden">
            <div className="flex overflow-x-auto pr-4 md:pr-0 gap-4 md:gap-6 scrollbar-hidden snap-x snap-mandatory base-container">
                {videos.map((video) => (
                    <div
                        key={video.src}
                        className="relative flex-none w-3/4 sm:w-1/2 md:w-1/3 lg:w-demo-tile-w lg:h-demo-tile-h aspect-9/16 rounded-2xl overflow-hidden snap-center"
                    >
                        <MoreDemoVideoTile src={video.src} label={video.label} />
                    </div>
                ))}
            </div>
        </section>
    );
}

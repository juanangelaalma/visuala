import InfiniteMarquee from "../_components/InfiniteMarquee";
import PrimaryCtaButton from "../_components/PrimaryCtaButton";
import FeatureShowcaseVideoCard from "./FeatureShowcaseVideoCard";

const tags = ["TESTIMONIALS", "TRY-ONS", "UNBOXING", "PODCASTS", "REVIEWS", "DEMOS"];

const cards = [
    {
        src: "/videos/features/Woman_applying_facial_serum_202605281645.mp4",
        label: "Beauty UGC video - skincare model",
        rotate: "-2.5deg",
        translateY: "16px",
    },
    {
        src: "/videos/features/Elegant_woman_wearing_white_blazer_202605281645.mp4",
        label: "Fashion UGC video - elegant model",
        rotate: "1deg",
        translateY: "0px",
    },
    {
        src: "/videos/features/Unboxing.mp4",
        label: "Beauty UGC video - product unboxing",
        rotate: "-2.5deg",
        translateY: "16px",
    },
    {
        src: "/videos/features/Hands_lifting_smartphone_out_box_202605281645.mp4",
        label: "UGC video - smartphone unboxing",
        rotate: "1deg",
        translateY: "0px",
    },
];

function NewFeatureBadge() {
    return (
        <span
            className="pointer-events-none absolute -top-1/2 left-4/5 ml-2 flex h-feature-badge-sm-h w-feature-badge-sm-w select-none items-center justify-center bg-danger px-2 py-1 font-display text-xs-label font-semibold tracking-widest text-white uppercase shadow-lg animate-badge-pop md:-top-3/5 md:ml-4 md:h-feature-badge-lg-h md:w-feature-badge-lg-w md:px-4 md:py-2 md:text-body-2xl"
            style={{ transform: "rotate(15deg)", transformOrigin: "center" }}
        >
            New Feature!
        </span>
    );
}

function TagList() {
    return (
        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
            {tags.map((tag, index) => (
                <span key={tag} className="flex items-center gap-x-2">
                    <span className="text-xs-label font-normal tracking-widest text-neutral-450 uppercase md:text-body-xl">
                        {tag}
                    </span>
                    {index < tags.length - 1 ? <span className="text-xs text-white">•</span> : null}
                </span>
            ))}
        </div>
    );
}

function ShowcaseCard({ card }: { card: (typeof cards)[number] }) {
    return (
        <div
            className="relative aspect-9/16 w-showcase-sm flex-shrink-0 overflow-hidden rounded-2xl transition-transform duration-500 ease-out md:w-showcase-md lg:w-showcase-lg"
            style={{ transform: `rotate(${card.rotate}) translateY(${card.translateY})` }}
        >
            <FeatureShowcaseVideoCard src={card.src} label={card.label} />
            <div className="pointer-events-none absolute inset-0 rounded-2xl shadow-card-inner" />
        </div>
    );
}

function ShowcaseCarousel() {
    return (
        <div className="marquee-wrapper group relative mx-auto mt-6 h-showcase-track-sm w-full md:h-showcase-track-lg">
            <div className="pointer-events-none absolute top-0 bottom-0 -left-1 z-10 h-full w-16 bg-gradient-to-r from-black via-black/60 to-transparent md:left-0 md:w-showcase-edge" />
            <div className="pointer-events-none absolute top-0 right-1 bottom-0 z-10 h-full w-16 bg-gradient-to-l from-black via-black/80 to-transparent md:right-0 md:w-showcase-edge" />
            <InfiniteMarquee
                items={cards}
                ariaLabel="Scrolling showcase of UGC video examples"
                className="h-full cursor-pointer"
                trackClassName="h-full items-center"
                groupClassName="flex h-full items-center gap-4 pr-4 md:gap-10 md:pr-10"
                renderItem={(card, index) => <ShowcaseCard key={`${card.label}-${index}`} card={card} />}
            />
        </div>
    );
}

function ArrowIcon() {
    return (
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true" className="text-black">
            <path d="M2.5 7h9M8.5 4L11.5 7l-3 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}

export default function FeatureShowcaseSection() {
    return (
        <section className="w-full overflow-hidden bg-black px-4 py-16 md:py-24">
            <div className="base-container mx-auto flex flex-col gap-6 md:gap-12">
                <header className="flex flex-col gap-4">
                    <h2 className="text-feature-sm leading-none font-black tracking-tight text-white uppercase sm:text-feature-md sm:leading-none md:text-feature-lg md:leading-none">
                        <span className="block font-semibold">Generate</span>
                        <span className="relative block w-fit font-display">
                            <NewFeatureBadge />
                            <span className="tracking-wide text-primary">Ultrarealistic</span>
                        </span>
                        <span className="block font-semibold">UGC Videos</span>
                    </h2>
                    <TagList />
                    <p className="mt-2 max-w-full text-caption font-light tracking-wide text-white/40 md:text-base">
                        AI-powered authentic content that converts. Perfect for your brand&apos;s social proof.
                    </p>
                </header>

                <ShowcaseCarousel />

                <div className="mt-10 flex justify-center">
                    <PrimaryCtaButton id="generate-ugc-video-btn" glow className="relative tracking-widest" trailingIcon={<ArrowIcon />}>
                        Generate UGC Video
                    </PrimaryCtaButton>
                </div>
            </div>
        </section>
    );
}

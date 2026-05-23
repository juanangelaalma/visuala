import Image from "next/image";
import img1 from "../__assets/showcase/image 1.webp";
import img2 from "../__assets/showcase/image 2.webp";
import img3 from "../__assets/showcase/image 3.webp";

const tags = [
    "TESTIMONIALS",
    "TRY-ONS",
    "UNBOXING",
    "PODCASTS",
    "REVIEWS",
    "DEMOS",
];

const cards = [
    { src: img1, alt: "Beauty UGC video – skincare model", rotate: "-2.5deg", translateY: "16px", delay: "0ms" },
    { src: img2, alt: "Fashion UGC video – elegant model", rotate: "1deg", translateY: "0px", delay: "80ms" },
    { src: img3, alt: "Beauty UGC video – close-up model", rotate: "-2.5deg", translateY: "16px", delay: "160ms" },
];

export default function FeatureShowcaseSection() {
    return (
        <section className="bg-black w-full py-16 md:py-24 px-4 overflow-hidden">
            <div className="base-container mx-auto flex flex-col gap-6 md:gap-12">

                {/* ── Headline block ──────────────────────────── */}
                <div className="flex flex-col gap-4">
                    {/* Title + badge row */}
                    <div className="relative">
                        <h2
                            className="
                                text-[42px] sm:text-[64px] md:text-[96px]
                                font-black leading-[42px] sm:leading-[60px] md:leading-[90px] tracking-tight uppercase text-white
                            "
                        >
                            <span className="block font-semibold">Generate</span>
                            <span className="block relative w-fit font-display">
                                <div
                                    className="
                                        absolute -top-[50%] md:-top-[60%] left-[80%] md:left-[80%] ml-2 md:ml-4
                                        bg-[#DE0909] text-white
                                        px-2 md:px-4 py-1 md:py-2
                                        text-[12px] md:text-[24px]
                                        tracking-widest uppercase
                                        font-semibold
                                        font-display
                                        select-none pointer-events-none
                                        shadow-lg
                                        flex items-center justify-center
                                        w-[130px] md:w-[250px] h-[36px] md:h-[62px]
                                        animate-[badge-pop_0.5s_cubic-bezier(0.34,1.56,0.64,1)_0.3s_both]
                                    "
                                    style={{ transform: "rotate(15deg)", transformOrigin: "center" }}
                                >
                                    New Feature!
                                </div>
                                <span className="text-primary tracking-wide">Ultrarealistic</span>
                                {/* "NEW FEATURE!" badge — rotated red pill */}
                            </span>
                            <span className="block font-semibold">UGC Videos</span>
                        </h2>
                    </div>

                    {/* Tags row */}
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-2">
                        {tags.map((tag, i) => (
                            <span key={tag} className="flex items-center gap-x-2">
                                <span className="text-[#BABABA] font-normal text-[12px] md:text-[20px] tracking-[0.18em] uppercase">
                                    {tag}
                                </span>
                                {i < tags.length - 1 && (
                                    <span className="text-white text-xs">•</span>
                                )}
                            </span>
                        ))}
                    </div>

                    {/* Subtitle */}
                    <p className="text-white/40 text-[14px] md:text-[16px] font-light tracking-wide max-w-full mt-2">
                        AI-powered authentic content that converts. Perfect for your brand&apos;s social proof.
                    </p>
                </div>

                {/* ── Cards row ───────────────────────────────── */}
                <div className="relative mt-6 w-full h-[500px] md:h-[850px] mx-auto">
                    {/* Fade out gradients (outside the scroll container to stay fixed on edges) */}
                    <div className="absolute -left-1 md:left-0 top-0 bottom-0 w-[60px] md:w-[192px] bg-gradient-to-r from-black via-black/60 to-transparent z-10 h-[110%] pointer-events-none" />
                    <div className="absolute -right-1 md:right-0 top-0 bottom-0 w-[60px] md:w-[192px] bg-gradient-to-l from-black via-black/80 to-transparent z-10 h-[110%] pointer-events-none" />

                    <div className="flex justify-start items-center gap-4 md:gap-10 w-full h-full pl-[16px] overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                        {cards.map((card, i) => (
                            <div
                                key={i}
                                className="
                                    relative
                                    w-[240px] md:w-[100%] max-w-[450px]
                                    aspect-[450/800]
                                    rounded-[16px]
                                    overflow-hidden
                                    flex-shrink-0
                                    group
                                    transition-all duration-500 ease-out
                                "
                                style={{
                                    transform: `rotate(${card.rotate}) translateY(${card.translateY})`,
                                    transitionDelay: card.delay,
                                }}
                            >
                                <Image
                                    src={card.src}
                                    alt={card.alt}
                                    fill
                                    className="object-cover transition-transform duration-700 group-hover:scale-105"
                                    sizes="(max-width: 768px) 33vw, 260px"
                                />
                                {/* Subtle inner shadow overlay */}
                                <div className="absolute inset-0 rounded-[16px] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]" />
                            </div>
                        ))}
                    </div>
                </div>

                {/* ── CTA Button ──────────────────────────────── */}
                <div className="flex justify-center mt-10">
                    <div className="relative group transition-all duration-300">
                        {/* Gradient Glow */}
                        <div className="absolute inset-0 bg-gradient-to-r from-primary to-white rounded-full blur-[15px] opacity-60 transition-all duration-300" />

                        <button
                            id="generate-ugc-video-btn"
                            className="
                                relative
                                flex items-center justify-center gap-3
                                bg-white
                                text-black
                                rounded-full
                                px-8 py-4
                                text-[16px]
                                font-bold tracking-[0.15em] uppercase
                                cursor-pointer
                            "
                        >
                            Generate UGC Video
                            <span
                                className="
                                    inline-flex items-center justify-center
                                    w-5 h-5 rounded-full
                                    transition-transform duration-300
                                    group-hover:translate-x-1 font-bold
                                "
                            >
                                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true" className="text-black">
                                    <path d="M2.5 7h9M8.5 4L11.5 7l-3 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                            </span>
                        </button>
                    </div>
                </div>

            </div>

        </section>
    );
}

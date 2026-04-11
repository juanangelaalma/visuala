import Image from "next/image";

export default function DemoSection() {
    return (
        <section className="bg-black py-20 px-4 md:px-8 flex flex-col items-center w-full sm:px-6 lg:px-32">
            <div className="relative w-full max-w-10xl rounded-[16px] overflow-hidden aspect-[16/10] md:aspect-video bg-surface-1">
                <Image
                    src="/demo.webp"
                    alt="Demo visual"
                    fill
                    className="object-cover"
                />

                {/* Bottom left tag */}
                <div className="absolute bottom-4 left-4 md:bottom-6 md:left-6 bg-black/50 backdrop-blur-md px-3 py-1.5 md:px-4 md:py-2 rounded-full z-10 text-white/90">
                    <span className="text-[10px] md:text-[12px] font-light tracking-wide">all shots created on VISUALA</span>
                </div>

                {/* Bottom right volume icon */}
                <button className="absolute bottom-4 right-4 md:bottom-6 md:right-6 w-8 h-8 md:w-10 md:h-10 bg-black/50 backdrop-blur-md rounded-full flex items-center justify-center z-10 hover:bg-black/70 transition-colors text-white">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="opacity-90 scale-75 md:scale-100">
                        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
                        <line x1="23" y1="9" x2="17" y2="15"></line>
                        <line x1="17" y1="9" x2="23" y2="15"></line>
                    </svg>
                </button>
            </div>

            <div className="mt-16 text-center tracking-tight flex flex-col items-center gap-y-3">
                <p className="text-white text-[28px] md:text-[40px] font-light leading-snug">
                    Create jaw-dropping
                </p>
                <div className="text-white text-[28px] md:text-[40px] font-light leading-snug mt-2 flex items-center flex-col gap-y-3 md:flex-row">
                    <div className="bg-primary text-black px-3 py-1 mr-2 font-normal inline-block"
                        style={{ transform: 'rotate(-2deg)' }}
                    >
                        <p style={{ transform: 'rotate(2deg)' }}>
                            image and video
                        </p>
                    </div>
                    assets in minutes
                </div>
            </div>
        </section>
    )
}

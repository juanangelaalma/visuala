import DemoSectionVideo from "./DemoSectionVideo";

const demoVideoSrc = "/videos/demo/0604.mp4";

export default function DemoSection() {
    return (
        <section className="bg-black py-20 px-4 md:px-8 flex flex-col items-center w-full sm:px-6 lg:px-32">
            <div className="relative w-full base-container rounded-[16px] overflow-hidden aspect-16/10 md:aspect-video bg-surface-1">
                <DemoSectionVideo src={demoVideoSrc.replace(/\.mp4$/, "/index.m3u8")} fallbackSrc={demoVideoSrc} />

                {/* Bottom left tag */}
                <div className="absolute bottom-4 left-4 md:bottom-6 md:left-6 bg-black/50 backdrop-blur-md py-2.5 px-6 rounded-full z-10 text-white">
                    <span className="text-[14] font-display font-normal tracking-wide">all shots created on VISUALA</span>
                </div>

            </div>

            <div className="mt-16 text-center tracking-tight flex flex-col items-center gap-y-3">
                <p className="text-white font-display text-[28px] md:text-[40px] font-light leading-snug">
                    Create jaw-dropping
                </p>
                <div className="text-white font-display text-[28px] md:text-[40px] font-light leading-snug mt-2 flex items-center flex-col gap-y-3 md:flex-row">
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

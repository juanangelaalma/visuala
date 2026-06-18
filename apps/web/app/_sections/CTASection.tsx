import Image from "next/image";
import PrimaryCtaButton from "../_components/PrimaryCtaButton";
import bgImage from "../__assets/image/background-cta.png";

export default function CTASection() {
  return (
    <section className="relative w-full min-h-cta flex items-center justify-center overflow-hidden">
      {/* Background Image with 10px blur and dark overlay matching Figma */}
      <div className="absolute inset-0 z-0 scale-110">
        <Image
          src={bgImage}
          alt="Abstract Background"
          fill
          className="object-cover blur-md"
          quality={90}
        />
        <div className="absolute inset-0 bg-black/50" />
      </div>

      {/* Content */}
      <div className="relative z-10 max-w-5xl px-12 py-20 mx-auto text-center flex flex-col items-center gap-8">
        <h2 className="text-display-md md:text-6xl font-medium text-white tracking-tight uppercase leading-tight">
          AI just got cool.
        </h2>

        <div className="flex flex-col gap-10 text-body-lg md:text-body-2xl text-white/70 font-light max-w-copy leading-10 tracking-tight">
          <p>
            Built by actual creative directors who got<br className="hidden md:block" /> tired of AI that looked like AI.
          </p>

          <p>
            Trained on what works, not what&apos;s easy. Every<br className="hidden md:block" />
            output is filtered through the lens of taste—<br className="hidden md:block" />
            that ineffable quality that separates scroll-<br className="hidden md:block" />
            stopping content from digital wallpaper.
          </p>

          <p>
            Great brands don&apos;t compromise on creative.<br className="hidden md:block" />
            Neither should their tools.
          </p>
        </div>

        <div className="pt-8">
          <PrimaryCtaButton href="/signup">
            Join the Party
          </PrimaryCtaButton>
        </div>
      </div>
    </section>
  );
}

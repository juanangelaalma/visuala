import Image from "next/image";
import Link from "next/link";
import bgImage from "../__assets/image/background-cta.png";

export default function CTASection() {
  return (
    <section className="relative w-full min-h-[900px] flex items-center justify-center overflow-hidden">
      {/* Background Image with 10px blur and dark overlay matching Figma */}
      <div className="absolute inset-0 z-0 scale-110">
        <Image
          src={bgImage}
          alt="Abstract Background"
          fill
          className="object-cover blur-[10px]"
          quality={90}
        />
        <div className="absolute inset-0 bg-black/50" />
      </div>

      {/* Content */}
      <div className="relative z-10 max-w-[1024px] px-12 py-20 mx-auto text-center flex flex-col items-center gap-8">
        <h2 className="text-[40px] md:text-[60px] font-medium text-white tracking-[-1.5px] uppercase leading-tight">
          AI just got cool.
        </h2>

        <div className="flex flex-col gap-[39px] text-[18px] md:text-[24px] text-white/70 font-light max-w-[672px] leading-[39px] tracking-[-0.6px]">
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
          <Link
            href="/signup"
            className="inline-flex items-center justify-center bg-white text-black font-semibold text-[16px] uppercase tracking-[0.8px] px-8 py-4 rounded-full transition-all hover:scale-105 active:scale-95"
          >
            Join the Party
          </Link>
        </div>
      </div>
    </section>
  );
}

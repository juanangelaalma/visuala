import Image from "next/image";
import Link from "next/link";
import bgImage from "../__assets/showcase/image 1.webp";

export default function CTASection() {
  return (
    <section className="relative w-full py-32 md:py-48 flex items-center justify-center overflow-hidden min-h-[800px]">
      {/* Background Image with blur and overlay */}
      <div className="absolute inset-0 z-0">
        <Image
          src={bgImage}
          alt="Abstract Background"
          fill
          className="object-cover blur-[100px] scale-125 opacity-80"
          quality={70}
        />
        {/* Purpleish/Dark overlays to match the design's moody tone */}
        <div className="absolute inset-0 bg-[#3a1a42]/60 mix-blend-multiply" />
        <div className="absolute inset-0 bg-black/40" />
        <div className="absolute inset-0 bg-linear-to-b from-transparent via-[#2A0E30]/40 to-[#111111]" />
      </div>

      {/* Content */}
      <div className="relative z-10 max-w-4xl px-4 mx-auto text-center flex flex-col items-center">
        <h2 className="text-4xl md:text-5xl lg:text-[64px] font-medium text-white tracking-wide mb-12">
          AI JUST GOT COOL.
        </h2>

        <div className="space-y-8 text-[18px] md:text-[22px] text-[#e0e0e0] font-light max-w-2xl leading-[1.6]">
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

        <Link
          href="/signup"
          className="mt-16 inline-block bg-white text-black font-semibold text-[13px] uppercase tracking-[0.1em] px-8 py-4 rounded-full transition-transform hover:scale-105 active:scale-95 shadow-[0_0_30px_rgba(255,255,255,0.1)]"
        >
          Join the party
        </Link>
      </div>
    </section>
  );
}

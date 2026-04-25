import Link from "next/link";
import ReimagineBanner from "../_components/ReimagineBanner";
import AuthButtons from "../_components/AuthButton";
import StartFreeTrialButton from "../_components/StartFreeTrialButton";
import { OutlineButton } from "../_components/OutlineButton";
import PromoBar from "../_components/PromoBar";

export default function HeroSection() {
  return (
    <section
      id="hero"
      aria-labelledby="hero-heading"
      className="noise-overlay relative isolate flex min-h-dvh flex-col items-center justify-center overflow-hidden px-6 pt-24 pb-16 text-center lg:px-8 h-[1024px] bg-hero max-w-10xl"
    >

      {/* Heading */}
      <h1
        id="hero-heading"
        className="animate-fade-up mx-auto max-w-4xl text-4xl font-semibold tracking-tight md:text-6xl [animation-delay:100ms] font-display"
      >
        VIBEY ADS WITH AI,
      </h1>

      <ReimagineBanner />
      {/* CTAs */}
      <div className="flex flex-col w-full md:flex-row space-y-3 md:space-y-0 md:space-x-3 md:justify-center">
        <StartFreeTrialButton className="z-10 w-full uppercase md:w-auto" />
        <OutlineButton className="z-10 w-full font-sans-secondary text-[16px] font-semibold uppercase backdrop-blur-md md:w-auto">TALK TO SALES</OutlineButton>
      </div>

      <PromoBar />
    </section>
  );
}

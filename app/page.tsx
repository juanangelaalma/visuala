import Navbar from "./_components/Navbar";
import Footer from "./_components/Footer";
import HeroSection from "./_sections/HeroSection";
import ValuePropSection from "./_sections/ValuePropSection";
import DemoSection from "./_sections/DemoSection";
import LogoBand from "./_sections/LogoBand";
import FeaturesSection from "./_sections/FeaturesSection";
import HowItWorksSection from "./_sections/HowItWorksSection";
import TestimonialsSection from "./_sections/TestimonialsSection";
import PricingSection from "./_sections/PricingSection";
import FAQSection from "./_sections/FAQSection";
import CTASection from "./_sections/CTASection";

export default function HomePage() {
  return (
    <>
      <Navbar />

      <main id="main-content" tabIndex={-1}>
        <HeroSection />
        <ValuePropSection />
        <DemoSection />
        {/* <LogoBand />
        <FeaturesSection />
        <HowItWorksSection />
        <TestimonialsSection />
        <PricingSection />
        <FAQSection />
        <CTASection /> */}
      </main>

      {/* <Footer /> */}
    </>
  );
}

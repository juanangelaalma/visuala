import Navbar from "./_components/Navbar";
import Footer from "./_components/Footer";
import HeroSection from "./_sections/HeroSection";
import ValuePropSection from "./_sections/ValuePropSection";
import DemoSection from "./_sections/DemoSection";
import MoreDemoSection from "./_sections/MoreDemoSection";
import CategoriesSection from "./_sections/CategoriesSection";
import FeatureShowcaseSection from "./_sections/FeatureShowcaseSection";
import ArtisticDirectionsSection from "./_sections/ArtisticDirectionsSection";
import PricingSection from "./_sections/PricingSection";
import CTASection from "./_sections/CTASection";

export default function HomePage() {
  return (
    <>
      <Navbar />

      <main id="main-content" tabIndex={-1}>
        <HeroSection />
        <ValuePropSection />
        <DemoSection />
        <MoreDemoSection />
        <CategoriesSection />
        <FeatureShowcaseSection />
        <ArtisticDirectionsSection />
        <PricingSection />
        <CTASection />
      </main>

      <Footer />
    </>
  );
}

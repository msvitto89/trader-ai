import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { SmoothScroll } from "@/components/landing/SmoothScroll";
import { Nav } from "@/components/landing/Nav";
import { Hero } from "@/components/landing/Hero";
import {
  ProductShowcase,
  FeatureRisk,
  FeatureJournal,
  TrustStrip,
  Pricing,
  MetricsBand,
} from "@/components/landing/FeatureSections";
import { MarketExplorer } from "@/components/landing/MarketExplorer";
import { ScrollProgress } from "@/components/landing/interactive";
import { Faq } from "@/components/landing/Faq";
import { Footer } from "@/components/landing/Footer";

/**
 * Marketing landing page.
 *
 * The marketing route is the one place that prioritises motion over data
 * density, so it uses Lenis + GSAP/ScrollTrigger reveals and the ReactBits-style
 * marquee. Everything behind /app keeps the restrained shell.
 */
export default async function LandingPage() {
  const user = await getCurrentUser();
  if (user) redirect(user.onboardedAt ? "/app" : "/onboarding");

  return (
    <div className="relative min-h-screen bg-black text-white">
      <SmoothScroll />
      <ScrollProgress />
      <Nav />
      <main>
        <Hero />
        <MarketExplorer />
        <MetricsBand />
        <ProductShowcase />
        <FeatureRisk />
        <FeatureJournal />
        <TrustStrip />
        <Pricing />
        <Faq />
      </main>
      <Footer />
    </div>
  );
}

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
import { MercuryHeadings } from "@/components/landing/MercuryHeadings";
import { Faq } from "@/components/landing/Faq";
import { Footer } from "@/components/landing/Footer";

/**
 * Marketing landing page.
 *
 * Signed-in visitors are normally bounced to the workspace, since a returning
 * user wants their dashboard rather than the pitch. `?preview=1` bypasses that
 * so the marketing page can be inspected while logged in — otherwise it is
 * unreachable for exactly the person reviewing it.
 */
export default async function LandingPage({
  searchParams,
}: {
  searchParams: Promise<{ preview?: string }>;
}) {
  const [user, params] = await Promise.all([getCurrentUser(), searchParams]);
  const preview = params.preview === "1";

  if (user && !preview) redirect(user.onboardedAt ? "/app" : "/onboarding");

  return (
    <div className="relative min-h-screen bg-black text-white">
      <SmoothScroll />
      <ScrollProgress />
      <MercuryHeadings />
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

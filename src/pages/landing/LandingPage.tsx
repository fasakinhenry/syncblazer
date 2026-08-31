import { LandingHeader } from "@/components/landing/LandingHeader.tsx";
import { Hero } from "@/components/landing/Hero.tsx";
import { ProblemSection } from "@/components/landing/ProblemSection.tsx";
import { HowItWorksSection } from "@/components/landing/HowItWorksSection.tsx";
import { FeaturesSection } from "@/components/landing/FeaturesSection.tsx";
import { LocalFirstSection } from "@/components/landing/LocalFirstSection.tsx";
import { PrivacySection } from "@/components/landing/PrivacySection.tsx";
import { UseCasesSection } from "@/components/landing/UseCasesSection.tsx";
import { FinalCTASection } from "@/components/landing/FinalCTASection.tsx";
import { LandingFooter } from "@/components/landing/LandingFooter.tsx";

export function LandingPage() {
  return (
    <div className="bg-background">
      <LandingHeader />
      <main>
        <Hero />
        <ProblemSection />
        <HowItWorksSection />
        <FeaturesSection />
        <LocalFirstSection />
        <PrivacySection />
        <UseCasesSection />
        <FinalCTASection />
      </main>
      <LandingFooter />
    </div>
  );
}

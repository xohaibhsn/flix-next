import { CTA } from "@/components/sections/CTA";
import { Devices } from "@/components/sections/Devices";
import { FAQ } from "@/components/sections/FAQ";
import { Hero } from "@/components/sections/Hero";
import { HowItWorks } from "@/components/sections/HowItWorks";
import { Pricing } from "@/components/sections/Pricing";
import { Services } from "@/components/sections/Services";
import { StatsStrip } from "@/components/sections/StatsStrip";
import { TrustStats } from "@/components/sections/TrustStats";
import { WhyChooseUs } from "@/components/sections/WhyChooseUs";
import { SectionErrorBoundary } from "@/components/cms/SectionErrorBoundary";
import { mergeSectionData } from "@/lib/cms/defaults";
import type {
  CmsSection,
  CtaData,
  DevicesData,
  FaqData,
  HeroData,
  HighlightsData,
  HowItWorksData,
  PricingData,
  ServicesData,
  TrustStatsData,
  WhyChooseData,
} from "@/lib/cms/types";

function renderSection(section: CmsSection) {
  const data = mergeSectionData(section.type, section.data);
  switch (section.type) {
    case "hero":
      return <Hero data={data as HeroData} />;
    case "highlights":
      return <StatsStrip data={data as HighlightsData} />;
    case "how-it-works":
      return <HowItWorks data={data as HowItWorksData} />;
    case "services":
      return <Services data={data as ServicesData} />;
    case "pricing":
      return <Pricing data={data as PricingData} />;
    case "devices":
      return <Devices data={data as DevicesData} />;
    case "trust-stats":
      return <TrustStats data={data as TrustStatsData} />;
    case "why-choose":
      return <WhyChooseUs data={data as WhyChooseData} />;
    case "faq":
      return <FAQ data={data as FaqData} />;
    case "cta":
      return <CTA data={data as CtaData} />;
    default:
      return null;
  }
}

export function SectionRenderer({ sections }: { sections: CmsSection[] }) {
  return (
    <>
      {sections
        .filter((section) => section.visible)
        .sort((a, b) => a.order - b.order)
        .map((section) => (
          <SectionErrorBoundary key={section.id} label={`“${section.label}” could not be displayed.`}>
            {renderSection(section)}
          </SectionErrorBoundary>
        ))}
    </>
  );
}

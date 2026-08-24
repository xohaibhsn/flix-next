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
import {
  ContactFormBlock,
  ContactInfoCards,
  InfoCards,
  MessagingCta,
  RichContentBlock,
  RichTextBlock,
  SupportHours,
} from "@/components/sections/ExtraSections";
import { InnerPageHero } from "@/components/sections/InnerPageHero";
import { SectionErrorBoundary } from "@/components/cms/SectionErrorBoundary";
import { JsonLd } from "@/components/seo/JsonLd";
import { mergeSectionData } from "@/lib/cms/defaults";
import { faqPageJsonLd } from "@/lib/cms/json-ld";
import { resolveFaqData, resolvePricingData } from "@/lib/cms/resolve";
import type {
  CmsSection,
  ContactFormData,
  ContactInfoData,
  CtaData,
  DevicesData,
  FaqData,
  FaqItem,
  HeroData,
  HighlightsData,
  HoursData,
  HowItWorksData,
  InfoCardsData,
  MessagingCtaData,
  PageHeroData,
  PricingData,
  PricingPlan,
  RichContentData,
  RichTextData,
  ServicesData,
  SiteSettings,
  TrustStatsData,
  WhyChooseData,
} from "@/lib/cms/types";

function renderSection(
  section: CmsSection,
  settings: SiteSettings,
  plans: PricingPlan[],
  faqs: FaqItem[],
) {
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
      return <Pricing data={resolvePricingData(data as PricingData, plans)} />;
    case "devices":
      return <Devices data={data as DevicesData} />;
    case "trust-stats":
      return <TrustStats data={data as TrustStatsData} />;
    case "why-choose":
      return <WhyChooseUs data={data as WhyChooseData} />;
    case "faq": {
      const resolved = resolveFaqData(data as FaqData, faqs);
      return <FAQ data={resolved} />;
    }
    case "cta":
      return <CTA data={data as CtaData} />;
    case "page-hero":
      return <InnerPageHero data={data as PageHeroData} />;
    case "rich-text":
      return <RichTextBlock data={data as RichTextData} />;
    case "rich-content":
      return <RichContentBlock data={data as RichContentData} />;
    case "info-cards":
      return <InfoCards data={data as InfoCardsData} />;
    case "contact-info":
      return <ContactInfoCards data={data as ContactInfoData} settings={settings} />;
    case "contact-form":
      return <ContactFormBlock data={data as ContactFormData} />;
    case "messaging-cta":
      return <MessagingCta data={data as MessagingCtaData} settings={settings} />;
    case "hours":
      return <SupportHours data={data as HoursData} settings={settings} />;
    default:
      return null;
  }
}

export function SectionRenderer({
  sections,
  settings,
  plans = [],
  faqs = [],
}: {
  sections: CmsSection[];
  settings: SiteSettings;
  plans?: PricingPlan[];
  faqs?: FaqItem[];
}) {
  return (
    <>
      <JsonLd
        data={faqPageJsonLd({
          eyebrow: "",
          heading: "",
          description: "",
          sourceMode: "selected",
          useCentralFaqs: true,
          category: "",
          selectedFaqIds: [],
          maxItems: 0,
          items: sections
            .filter((section) => section.visible && section.type === "faq")
            .sort((a, b) => a.order - b.order)
            .flatMap((section) => resolveFaqData(mergeSectionData("faq", section.data) as FaqData, faqs).items)
            .filter((item, index, list) => item.question && item.answer && list.findIndex((row) => row.id === item.id) === index),
        })}
      />
      {sections
        .filter((section) => section.visible)
        .sort((a, b) => a.order - b.order)
        .map((section) => (
          <SectionErrorBoundary key={section.id} label={`“${section.label}” could not be displayed.`}>
            {renderSection(section, settings, plans, faqs)}
          </SectionErrorBoundary>
        ))}
    </>
  );
}

import { connection } from "next/server";
import { SectionRenderer } from "@/components/cms/SectionRenderer";
import { cms } from "@/lib/cms/repository";
import { createContactSections, createHomeSections, createSubscriptionSections } from "@/lib/cms/defaults";
import type { CmsSection } from "@/lib/cms/types";

function fallbackSections(slug: string): CmsSection[] {
  if (slug === "/iptv-subscriptions-uk/") return createSubscriptionSections();
  if (slug === "/contact/") return createContactSections();
  return createHomeSections();
}

export async function CmsPageView({ slug }: { slug: string }) {
  await connection();
  const [page, settings, plans, faqs] = await Promise.all([
    cms.getPageBySlug(slug),
    cms.getSettings(),
    cms.listPlans(),
    cms.listFaqs(),
  ]);
  const sections = page?.sections?.length ? page.sections : fallbackSections(slug);
  return (
    <SectionRenderer
      sections={sections}
      settings={settings}
      plans={plans.filter((plan) => plan.active)}
      faqs={faqs.filter((item) => item.visible)}
    />
  );
}

import { connection } from "next/server";
import { SectionRenderer } from "@/components/cms/SectionRenderer";
import {
  getPublicFaqs,
  getPublicPageBySlug,
  getPublicPlans,
  getPublicSettings,
} from "@/lib/cms/public-request-cache";
import { createCompanyPageSections, companyPageById, companyPageBySlug } from "@/lib/cms/company-pages";
import { createContactSections, createHomeSections, createSubscriptionSections } from "@/lib/cms/defaults";
import { SUBSCRIPTION_PAGE_ID, SUBSCRIPTION_SLUG, SUBSCRIPTION_SLUG_LEGACY } from "@/lib/cms/page-paths";
import type { CmsSection } from "@/lib/cms/types";
import { publicPageUrl } from "@/lib/site-url";

function fallbackSections(slug: string, pageId?: string): CmsSection[] {
  if (pageId === SUBSCRIPTION_PAGE_ID || slug === SUBSCRIPTION_SLUG || slug === SUBSCRIPTION_SLUG_LEGACY) {
    return createSubscriptionSections();
  }
  if (pageId === "page-contact" || slug === "/contact/") return createContactSections();
  const company = (pageId ? companyPageById(pageId) : null) || companyPageBySlug(slug);
  if (company) return createCompanyPageSections(company);
  return createHomeSections();
}

export async function CmsPageView({ slug }: { slug: string }) {
  await connection();
  const [page, settings, plans, faqs] = await Promise.all([
    getPublicPageBySlug(slug),
    getPublicSettings(),
    getPublicPlans(),
    getPublicFaqs(),
  ]);
  const sections = page?.sections?.length ? page.sections : fallbackSections(slug, page?.id);
  return (
    <SectionRenderer
      sections={sections}
      settings={settings}
      plans={plans.filter((plan) => plan.active)}
      faqs={faqs.filter((item) => item.visible)}
      pageUrl={publicPageUrl(page?.slug || slug)}
    />
  );
}

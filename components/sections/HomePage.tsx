import { connection } from "next/server";
import { cms } from "@/lib/cms/repository";
import { createHomeSections } from "@/lib/cms/defaults";
import { SectionRenderer } from "@/components/cms/SectionRenderer";
import { publicPageUrl } from "@/lib/site-url";

export async function HomePage() {
  await connection();
  const [page, settings, plans, faqs] = await Promise.all([
    cms.getPageBySlug("/"),
    cms.getSettings(),
    cms.listPlans(),
    cms.listFaqs(),
  ]);
  const sections = page?.sections?.length ? page.sections : createHomeSections();
  return (
    <SectionRenderer
      sections={sections}
      settings={settings}
      plans={plans.filter((plan) => plan.active)}
      faqs={faqs.filter((item) => item.visible)}
      pageUrl={publicPageUrl("/")}
    />
  );
}

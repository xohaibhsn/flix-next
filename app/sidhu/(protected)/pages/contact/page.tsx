import { notFound } from "next/navigation";
import { AdminShell } from "@/components/sidhu/AdminShell";
import { HomeBuilder } from "@/components/sidhu/HomeBuilder";
import { PageSeoPanel } from "@/components/sidhu/PageSeoPanel";
import { requireAdminSession } from "@/lib/auth/guards";
import { adminHasPermission } from "@/lib/auth/session";
import { defaultPages } from "@/lib/cms/defaults";
import { getCloudinaryStatusAction } from "@/lib/cms/actions";
import { getSeoAiProviderAvailability } from "@/lib/cms/ai-seo/config";
import { cms } from "@/lib/cms/repository";

export const dynamic = "force-dynamic";

export default async function SidhuContactBuilderPage() {
  const user = await requireAdminSession();
  const [page, faqs, assets, settings, cloud] = await Promise.all([
    cms.getPageBySlug("/contact/"),
    cms.listFaqs(),
    cms.listMedia(),
    cms.getSettings(),
    getCloudinaryStatusAction(),
  ]);
  const resolved = page ?? defaultPages().find((item) => item.slug === "/contact/");
  if (!resolved) notFound();
  const aiProviders = getSeoAiProviderAvailability();

  return (
    <AdminShell
      title="Contact"
      subtitle="Section builder for /contact/. Global phone, email, and WhatsApp still come from Site Settings."
    >
      <div className="space-y-6">
        <HomeBuilder
          page={resolved}
          title="Contact page builder"
          hint="Saving updates the live Contact page after a refresh. Contact values come from Site Settings."
          faqs={faqs}
          assets={assets}
        />
        {adminHasPermission(user, "seo") ? (
          <PageSeoPanel
            pageKey="contact"
            seo={settings.pageSeo.contact}
            assets={assets}
            configured={cloud.configured}
            openaiConfigured={aiProviders.openaiConfigured}
            geminiConfigured={aiProviders.geminiConfigured}
            settings={settings}
            page={resolved}
            fallbackTitle="Contact"
            fallbackDescription="Contact Flix IPTV support by WhatsApp, email, or form."
          />
        ) : null}
      </div>
    </AdminShell>
  );
}

import { notFound } from "next/navigation";
import { AdminShell } from "@/components/sidhu/AdminShell";
import { HomeBuilder } from "@/components/sidhu/HomeBuilder";
import { PageSeoPanel } from "@/components/sidhu/PageSeoPanel";
import { requireAdminSession } from "@/lib/auth/guards";
import { adminHasPermission } from "@/lib/auth/session";
import { defaultPages } from "@/lib/cms/defaults";
import { getCloudinaryStatusAction } from "@/lib/cms/actions";
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
          />
        ) : null}
      </div>
    </AdminShell>
  );
}

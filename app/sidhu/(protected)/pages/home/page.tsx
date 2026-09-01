import { notFound } from "next/navigation";
import { AdminShell } from "@/components/sidhu/AdminShell";
import { HomeBuilder } from "@/components/sidhu/HomeBuilder";
import { PageSeoPanel } from "@/components/sidhu/PageSeoPanel";
import { requireAdminSession } from "@/lib/auth/guards";
import { adminHasPermission } from "@/lib/auth/session";
import { getCloudinaryStatusAction } from "@/lib/cms/actions";
import { cms } from "@/lib/cms/repository";

export const dynamic = "force-dynamic";

export default async function SidhuHomeBuilderPage() {
  const user = await requireAdminSession();
  const [page, faqs, assets, settings, cloud] = await Promise.all([
    cms.getPageBySlug("/"),
    cms.listFaqs(),
    cms.listMedia(),
    cms.getSettings(),
    getCloudinaryStatusAction(),
  ]);
  if (!page) notFound();

  return (
    <AdminShell
      title="Home"
      subtitle="Section-by-section editor. Saving updates the live Home page at /welcome/ after a refresh. Hero heading is independent of Site Settings tagline."
    >
      <div className="space-y-6">
        <HomeBuilder page={page} faqs={faqs} assets={assets} />
        {adminHasPermission(user, "seo") ? (
          <PageSeoPanel
            pageKey="home"
            seo={settings.pageSeo.home}
            assets={assets}
            configured={cloud.configured}
          />
        ) : null}
      </div>
    </AdminShell>
  );
}

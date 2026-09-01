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

export default async function SidhuSubscriptionsBuilderPage() {
  const user = await requireAdminSession();
  const [page, faqs, assets, settings, cloud] = await Promise.all([
    cms.getPageBySlug("/iptv-subscriptions-uk/"),
    cms.listFaqs(),
    cms.listMedia(),
    cms.getSettings(),
    getCloudinaryStatusAction(),
  ]);
  const resolved = page ?? defaultPages().find((item) => item.slug === "/iptv-subscriptions-uk/");
  if (!resolved) notFound();

  return (
    <AdminShell
      title="IPTV Subscription"
      subtitle="Same section builder as Home. Saving updates /iptv-subscriptions-uk/."
    >
      <div className="space-y-6">
        <HomeBuilder
          page={resolved}
          title="IPTV Subscription builder"
          hint="Saving updates the live IPTV Subscription page after a refresh."
          faqs={faqs}
          assets={assets}
        />
        {adminHasPermission(user, "seo") ? (
          <PageSeoPanel
            pageKey="subscriptions"
            seo={settings.pageSeo.subscriptions}
            assets={assets}
            configured={cloud.configured}
          />
        ) : null}
      </div>
    </AdminShell>
  );
}

import { notFound } from "next/navigation";
import { AdminShell } from "@/components/sidhu/AdminShell";
import { HomeBuilder } from "@/components/sidhu/HomeBuilder";
import { defaultPages } from "@/lib/cms/defaults";
import { cms } from "@/lib/cms/repository";

export const dynamic = "force-dynamic";

export default async function SidhuSubscriptionsBuilderPage() {
  const [page, faqs, assets] = await Promise.all([
    cms.getPageBySlug("/iptv-subscriptions-uk/"),
    cms.listFaqs(),
    cms.listMedia(),
  ]);
  const resolved = page ?? defaultPages().find((item) => item.slug === "/iptv-subscriptions-uk/");
  if (!resolved) notFound();

  return (
    <AdminShell
      title="IPTV Subscription"
      subtitle="Same section builder as Home. Saving updates /iptv-subscriptions-uk/."
    >
      <HomeBuilder
        page={resolved}
        title="IPTV Subscription builder"
        hint="Saving updates the live IPTV Subscription page after a refresh."
        faqs={faqs}
        assets={assets}
      />
    </AdminShell>
  );
}

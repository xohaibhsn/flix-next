import { CmsPageView } from "@/components/cms/CmsPageView";
import { SiteShell } from "@/components/layout/SiteShell";
import { pageSeoMetadata } from "@/lib/metadata";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  return pageSeoMetadata(
    "subscriptions",
    "IPTV Subscriptions UK",
    "IPTV plans, devices, and FAQs for THE FLIX IPTV.",
    "/iptv-subscriptions-uk/",
  );
}

export default function SubscriptionsPage() {
  return (
    <SiteShell>
      <CmsPageView slug="/iptv-subscriptions-uk/" />
    </SiteShell>
  );
}

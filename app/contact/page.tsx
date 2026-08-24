import { CmsPageView } from "@/components/cms/CmsPageView";
import { SiteShell } from "@/components/layout/SiteShell";
import { pageSeoMetadata } from "@/lib/metadata";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  return pageSeoMetadata(
    "contact",
    "Contact",
    "Contact THE FLIX IPTV support by WhatsApp, email, or form.",
    "/contact/",
  );
}

export default function ContactPage() {
  return (
    <SiteShell>
      <CmsPageView slug="/contact/" />
    </SiteShell>
  );
}

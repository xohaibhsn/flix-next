import { CmsPageView } from "@/components/cms/CmsPageView";
import { SiteShell } from "@/components/layout/SiteShell";
import { pageSeoMetadata } from "@/lib/metadata";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  return pageSeoMetadata("home", "Welcome", "", "/");
}

export default function HomePage() {
  return (
    <SiteShell overlayHeader showOrganization pageSeoKey="home">
      <CmsPageView slug="/" />
    </SiteShell>
  );
}

import { CmsPageView } from "@/components/cms/CmsPageView";
import { SiteShell } from "@/components/layout/SiteShell";
import { pageSeoMetadata } from "@/lib/metadata";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  return pageSeoMetadata("home", "Welcome", "", "/welcome/");
}

export default function WelcomePage() {
  return (
    <SiteShell overlayHeader>
      <CmsPageView slug="/" />
    </SiteShell>
  );
}

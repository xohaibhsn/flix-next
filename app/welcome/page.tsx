import { HomePage } from "@/components/sections/HomePage";
import { SiteShell } from "@/components/layout/SiteShell";
import { pageMetadata } from "@/lib/metadata";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  return pageMetadata("Welcome", "", "/welcome/");
}

export default function WelcomePage() {
  return (
    <SiteShell overlayHeader>
      <HomePage />
    </SiteShell>
  );
}

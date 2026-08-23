import { HomePage } from "@/components/sections/HomePage";
import { SiteShell } from "@/components/layout/SiteShell";
import { pageMetadata } from "@/lib/metadata";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  return pageMetadata(
    "Home",
    "THE FLIX IPTV — live TV, movies, and series in HD, FHD, and 4K. Local demo homepage for The Flix.",
    "/",
  );
}

export default function Home() {
  return (
    <SiteShell overlayHeader>
      <HomePage />
    </SiteShell>
  );
}

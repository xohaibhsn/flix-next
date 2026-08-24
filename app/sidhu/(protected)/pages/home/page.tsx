import { notFound } from "next/navigation";
import { AdminShell } from "@/components/sidhu/AdminShell";
import { HomeBuilder } from "@/components/sidhu/HomeBuilder";
import { cms } from "@/lib/cms/repository";

export const dynamic = "force-dynamic";

export default async function SidhuHomeBuilderPage() {
  const [page, faqs, assets] = await Promise.all([cms.getPageBySlug("/"), cms.listFaqs(), cms.listMedia()]);
  if (!page) notFound();

  return (
    <AdminShell
      title="Home"
      subtitle="Section-by-section editor. Saving updates the live Home page at /welcome/ after a refresh. Hero heading is independent of Site Settings tagline."
    >
      <HomeBuilder page={page} faqs={faqs} assets={assets} />
    </AdminShell>
  );
}

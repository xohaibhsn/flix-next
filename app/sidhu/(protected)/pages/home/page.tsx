import { notFound } from "next/navigation";
import { AdminShell } from "@/components/sidhu/AdminShell";
import { HomeBuilder } from "@/components/sidhu/HomeBuilder";
import { cms } from "@/lib/cms/repository";

export const dynamic = "force-dynamic";

export default async function SidhuHomeBuilderPage() {
  const page = await cms.getPageBySlug("/");
  if (!page) notFound();

  return (
    <AdminShell title="Home" subtitle="Section-by-section editor. Saving writes local JSON and updates / after refresh.">
      <HomeBuilder page={page} />
    </AdminShell>
  );
}

import { AdminShell } from "@/components/sidhu/AdminShell";
import { SeoModuleChrome } from "@/components/sidhu/SeoModuleChrome";
import { SeoPlanningList } from "@/components/sidhu/SeoPlanningList";
import { cms } from "@/lib/cms/repository";

export const dynamic = "force-dynamic";

export default async function SidhuSeoPlanningPage() {
  const drafts = await cms.listSeoPlanningDrafts();

  return (
    <AdminShell
      title="SEO"
      subtitle="Search visibility, metadata and technical diagnostics."
      breadcrumbs={[{ label: "SEO", href: "/sidhu/seo/" }, { label: "Planning" }]}
    >
      <SeoModuleChrome>
        <SeoPlanningList drafts={drafts} />
      </SeoModuleChrome>
    </AdminShell>
  );
}

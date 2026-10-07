import { AdminShell } from "@/components/sidhu/AdminShell";
import { SeoModuleChrome } from "@/components/sidhu/SeoModuleChrome";
import { SeoPlanningList } from "@/components/sidhu/SeoPlanningList";
import { cms } from "@/lib/cms/repository";

export const dynamic = "force-dynamic";

export default async function SidhuSeoPlanningPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const params = await searchParams;
  const view = params.view === "archived" ? "archived" : "active";
  const [activeDrafts, archivedDrafts] = await Promise.all([
    cms.listSeoPlanningDrafts({ lifecycle: "active" }),
    cms.listSeoPlanningDrafts({ lifecycle: "archived" }),
  ]);
  const drafts = view === "archived" ? archivedDrafts : activeDrafts;

  return (
    <AdminShell
      title="SEO"
      subtitle="Search visibility, metadata and technical diagnostics."
      breadcrumbs={[{ label: "SEO", href: "/sidhu/seo/" }, { label: "Planning" }]}
    >
      <SeoModuleChrome>
        <SeoPlanningList
          drafts={drafts}
          view={view}
          activeCount={activeDrafts.length}
          archivedCount={archivedDrafts.length}
        />
      </SeoModuleChrome>
    </AdminShell>
  );
}

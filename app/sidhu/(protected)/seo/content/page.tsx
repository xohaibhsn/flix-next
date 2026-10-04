import { AdminShell } from "@/components/sidhu/AdminShell";
import { SeoModuleChrome } from "@/components/sidhu/SeoModuleChrome";
import { SeoOverviewTable } from "@/components/sidhu/SeoOverviewTable";
import { SectionCard } from "@/components/sidhu/ui/SectionCard";
import { sidhuSeoOverviewRows } from "@/lib/cms/sidhu-seo-preview";
import { cms } from "@/lib/cms/repository";

export const dynamic = "force-dynamic";

export default async function SidhuSeoContentPage() {
  const [settings, posts, categories] = await Promise.all([
    cms.getSettings(),
    cms.listPosts(),
    cms.listCategories(),
  ]);
  const rows = sidhuSeoOverviewRows(settings, posts, categories);

  return (
    <AdminShell
      title="SEO"
      subtitle="Search visibility, metadata and technical diagnostics."
      breadcrumbs={[{ label: "SEO", href: "/sidhu/seo/" }, { label: "Content" }]}
    >
      <SeoModuleChrome>
        <SectionCard className="space-y-3">
          <div>
            <h2 className="text-base font-semibold text-ink">Content SEO inventory</h2>
            <p className="mt-1 text-sm text-muted">
              Current saved SEO state for pages, posts, and categories. Edit page and post metadata from the links.
              Category rows are read-only in this phase.
            </p>
          </div>
          <SeoOverviewTable rows={rows} />
        </SectionCard>
      </SeoModuleChrome>
    </AdminShell>
  );
}

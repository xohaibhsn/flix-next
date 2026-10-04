import { AdminShell } from "@/components/sidhu/AdminShell";
import { MetadataDiagnosticsReport } from "@/components/sidhu/MetadataDiagnosticsReport";
import { SeoModuleChrome } from "@/components/sidhu/SeoModuleChrome";
import { scanMetadataDiagnostics } from "@/lib/cms/metadata-diagnostics";
import { cms } from "@/lib/cms/repository";

export const dynamic = "force-dynamic";

export default async function SidhuMetadataDiagnosticsPage() {
  const [settings, pages, posts, categories, redirects] = await Promise.all([
    cms.getSettings(),
    cms.listPages(),
    cms.listPosts(),
    cms.listCategories(),
    cms.listRedirects(),
  ]);

  const report = scanMetadataDiagnostics({
    settings,
    pages,
    posts,
    categories,
    redirects,
  });

  return (
    <AdminShell
      title="SEO"
      subtitle="Search visibility, metadata and technical diagnostics."
      breadcrumbs={[{ label: "SEO", href: "/sidhu/seo/" }, { label: "Metadata" }]}
    >
      <SeoModuleChrome>
        <div className="space-y-3">
          <div>
            <h2 className="text-base font-semibold text-ink">Metadata diagnostics</h2>
            <p className="mt-1 text-sm text-muted">
              Read-only duplicate title, description, and canonical analysis. Nothing is rewritten.
            </p>
          </div>
          <MetadataDiagnosticsReport
            entities={report.entities}
            summary={report.summary}
            duplicateTitles={report.duplicateTitles}
            duplicateDescriptions={report.duplicateDescriptions}
            noindexDuplicateTitles={report.noindexDuplicateTitles}
            noindexDuplicateDescriptions={report.noindexDuplicateDescriptions}
          />
        </div>
      </SeoModuleChrome>
    </AdminShell>
  );
}

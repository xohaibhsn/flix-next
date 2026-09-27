import { AdminShell } from "@/components/sidhu/AdminShell";
import { MetadataDiagnosticsReport } from "@/components/sidhu/MetadataDiagnosticsReport";
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
      title="Metadata diagnostics"
      subtitle="Read-only duplicate title, description, and canonical analysis. Nothing is rewritten."
    >
      <MetadataDiagnosticsReport
        entities={report.entities}
        summary={report.summary}
        duplicateTitles={report.duplicateTitles}
        duplicateDescriptions={report.duplicateDescriptions}
        noindexDuplicateTitles={report.noindexDuplicateTitles}
        noindexDuplicateDescriptions={report.noindexDuplicateDescriptions}
      />
    </AdminShell>
  );
}

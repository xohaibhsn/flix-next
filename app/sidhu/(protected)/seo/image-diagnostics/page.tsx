import { AdminShell } from "@/components/sidhu/AdminShell";
import { ImageDiagnosticsReport } from "@/components/sidhu/ImageDiagnosticsReport";
import { scanImageDiagnostics } from "@/lib/cms/image-diagnostics";
import { cms } from "@/lib/cms/repository";

export const dynamic = "force-dynamic";

export default async function SidhuImageDiagnosticsPage() {
  const [settings, pages, posts, categories, media] = await Promise.all([
    cms.getSettings(),
    cms.listPages(),
    cms.listPosts(),
    cms.listCategories(),
    cms.listMedia(),
  ]);

  const { findings, summary } = scanImageDiagnostics({
    settings,
    pages,
    posts,
    categories,
    media,
  });

  return (
    <AdminShell
      title="Image diagnostics"
      subtitle="Read-only alt coverage for Media Library, heroes, and rich HTML. Nothing is rewritten."
    >
      <ImageDiagnosticsReport findings={findings} summary={summary} />
    </AdminShell>
  );
}

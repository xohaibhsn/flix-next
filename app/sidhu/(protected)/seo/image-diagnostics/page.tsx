import { AdminShell } from "@/components/sidhu/AdminShell";
import { ImageDiagnosticsReport } from "@/components/sidhu/ImageDiagnosticsReport";
import { SeoModuleChrome } from "@/components/sidhu/SeoModuleChrome";
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
      title="SEO"
      subtitle="Search visibility, metadata and technical diagnostics."
      breadcrumbs={[{ label: "SEO", href: "/sidhu/seo/" }, { label: "Media" }]}
    >
      <SeoModuleChrome>
        <div className="space-y-3">
          <div>
            <h2 className="text-base font-semibold text-ink">Image diagnostics</h2>
            <p className="mt-1 text-sm text-muted">
              Read-only alt coverage for Media Library, heroes, and rich HTML. Nothing is rewritten.
            </p>
          </div>
          <ImageDiagnosticsReport findings={findings} summary={summary} />
        </div>
      </SeoModuleChrome>
    </AdminShell>
  );
}

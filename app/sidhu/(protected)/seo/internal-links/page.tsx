import { AdminShell } from "@/components/sidhu/AdminShell";
import { InternalLinksReport } from "@/components/sidhu/InternalLinksReport";
import { SeoModuleChrome } from "@/components/sidhu/SeoModuleChrome";
import { scanInternalLinks } from "@/lib/cms/internal-links";
import { cms } from "@/lib/cms/repository";

export const dynamic = "force-dynamic";

export default async function SidhuInternalLinksPage() {
  const [settings, pages, posts, categories, redirects] = await Promise.all([
    cms.getSettings(),
    cms.listPages(),
    cms.listPosts(),
    cms.listCategories(),
    cms.listRedirects(),
  ]);

  const { findings, summary, orphans } = scanInternalLinks({
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
      breadcrumbs={[{ label: "SEO", href: "/sidhu/seo/" }, { label: "Links" }]}
    >
      <SeoModuleChrome>
        <div className="space-y-3">
          <div>
            <h2 className="text-base font-semibold text-ink">Internal links</h2>
            <p className="mt-1 text-sm text-muted">
              Diagnostic-only report of internal hrefs in CMS content and navigation. Nothing is rewritten.
            </p>
          </div>
          <InternalLinksReport findings={findings} summary={summary} orphans={orphans} />
        </div>
      </SeoModuleChrome>
    </AdminShell>
  );
}

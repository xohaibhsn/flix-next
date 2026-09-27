import { AdminShell } from "@/components/sidhu/AdminShell";
import { InternalLinksReport } from "@/components/sidhu/InternalLinksReport";
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
      title="Internal links"
      subtitle="Diagnostic-only report of internal hrefs in CMS content and navigation. Nothing is rewritten."
    >
      <InternalLinksReport findings={findings} summary={summary} orphans={orphans} />
    </AdminShell>
  );
}

import { AdminShell } from "@/components/sidhu/AdminShell";
import { RedirectManager } from "@/components/sidhu/RedirectManager";
import { knownLocalDestinations } from "@/lib/cms/page-paths";
import { cms } from "@/lib/cms/repository";

export const dynamic = "force-dynamic";

export default async function SidhuRedirectsPage() {
  const [rules, pages, posts, categories] = await Promise.all([
    cms.listRedirects(),
    cms.listPages(),
    cms.listPosts(),
    cms.listCategories(),
  ]);
  const known = [...knownLocalDestinations(pages, posts, categories)];
  return (
    <AdminShell
      title="Redirects"
      subtitle="Database-backed redirects applied at request time. `/` → `/welcome/` is managed here, not in Next.js config."
    >
      <RedirectManager initialRules={rules} knownDestinations={known} />
    </AdminShell>
  );
}

import { AdminShell } from "@/components/sidhu/AdminShell";
import { SeoForm } from "@/components/sidhu/SeoForm";
import { cms } from "@/lib/cms/repository";

export const dynamic = "force-dynamic";

export default async function SidhuSeoPage() {
  const [settings, posts, categories] = await Promise.all([
    cms.getSettings(),
    cms.listPosts(),
    cms.listCategories(),
  ]);
  return (
    <AdminShell
      title="SEO"
      subtitle="Overview of page, post, and category SEO. Edit page and post metadata in their editors. Site-wide custom JSON-LD is below."
    >
      <SeoForm settings={settings} posts={posts} categories={categories} />
    </AdminShell>
  );
}

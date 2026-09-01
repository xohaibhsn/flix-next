import { AdminShell } from "@/components/sidhu/AdminShell";
import { BlogList } from "@/components/sidhu/BlogList";
import { PageSeoPanel } from "@/components/sidhu/PageSeoPanel";
import { requireAdminSession } from "@/lib/auth/guards";
import { adminHasPermission } from "@/lib/auth/session";
import { getCloudinaryStatusAction } from "@/lib/cms/actions";
import { cms } from "@/lib/cms/repository";

export const dynamic = "force-dynamic";

export default async function SidhuBlogPage() {
  const user = await requireAdminSession();
  const [posts, categories, settings, assets, cloud] = await Promise.all([
    cms.listPosts(),
    cms.listCategories(),
    cms.getSettings(),
    cms.listMedia(),
    getCloudinaryStatusAction(),
  ]);
  return (
    <AdminShell title="Blog" subtitle="Draft, publish, and organise posts. Public routes stay /blog/ and /blog/[slug]/. Listing SEO is below.">
      <div className="space-y-6">
        <BlogList posts={posts} categories={categories} />
        {adminHasPermission(user, "seo") ? (
          <PageSeoPanel
            pageKey="blog"
            seo={settings.pageSeo.blog}
            assets={assets}
            configured={cloud.configured}
          />
        ) : null}
      </div>
    </AdminShell>
  );
}

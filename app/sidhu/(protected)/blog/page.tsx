import Link from "next/link";
import { AdminShell } from "@/components/sidhu/AdminShell";
import { BlogList } from "@/components/sidhu/BlogList";
import { PageSeoPanel } from "@/components/sidhu/PageSeoPanel";
import { sidhuButtonClass } from "@/components/sidhu/ui/Button";
import { requireAdminSession } from "@/lib/auth/guards";
import { adminHasPermission } from "@/lib/auth/session";
import { getCloudinaryStatusAction } from "@/lib/cms/actions";
import { getSeoAiProviderAvailability } from "@/lib/cms/ai-seo/config";
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
  const aiProviders = getSeoAiProviderAvailability();
  return (
    <AdminShell
      title="Blog"
      subtitle="Manage posts and categories. Listing SEO stays on this page under its own tab."
      breadcrumbs={[{ label: "Content" }, { label: "Blog" }]}
      actions={
        <Link href="/sidhu/blog/new/" className={sidhuButtonClass("primary")}>
          New Post
        </Link>
      }
    >
      <BlogList
        posts={posts}
        categories={categories}
        listingSeo={
          adminHasPermission(user, "seo") ? (
            <PageSeoPanel
              pageKey="blog"
              seo={settings.pageSeo.blog}
              assets={assets}
              configured={cloud.configured}
              openaiConfigured={aiProviders.openaiConfigured}
              geminiConfigured={aiProviders.geminiConfigured}
              settings={settings}
              fallbackTitle="Blog"
              fallbackDescription="Guides and updates from Flix IPTV."
            />
          ) : undefined
        }
      />
    </AdminShell>
  );
}

import { AdminShell } from "@/components/sidhu/AdminShell";
import { BlogEditor, emptyPost } from "@/components/sidhu/BlogEditor";
import { getCloudinaryStatusAction } from "@/lib/cms/actions";
import { cms } from "@/lib/cms/repository";

export const dynamic = "force-dynamic";

export default async function SidhuNewPostPage() {
  const [categories, assets, cloud] = await Promise.all([
    cms.listCategories(),
    cms.listMedia(),
    getCloudinaryStatusAction(),
  ]);
  return (
    <AdminShell title="New post" subtitle="Draft is the default. Publish when the article is ready.">
      <BlogEditor post={emptyPost()} categories={categories} assets={assets} configured={cloud.configured} />
    </AdminShell>
  );
}

import { AdminShell } from "@/components/sidhu/AdminShell";
import { BlogEditor, emptyPost } from "@/components/sidhu/BlogEditor";
import { cms } from "@/lib/cms/repository";

export const dynamic = "force-dynamic";

export default async function SidhuNewPostPage() {
  const [categories, assets] = await Promise.all([cms.listCategories(), cms.listMedia()]);
  return (
    <AdminShell title="New post" subtitle="Draft is the default. Publish when the article is ready.">
      <BlogEditor post={emptyPost()} categories={categories} assets={assets} />
    </AdminShell>
  );
}

import { AdminShell } from "@/components/sidhu/AdminShell";
import { BlogList } from "@/components/sidhu/BlogList";
import { cms } from "@/lib/cms/repository";

export const dynamic = "force-dynamic";

export default async function SidhuBlogPage() {
  const [posts, categories] = await Promise.all([cms.listPosts(), cms.listCategories()]);
  return (
    <AdminShell title="Blog" subtitle="Draft, publish, and organise posts. Public routes stay /blog/ and /blog/[slug]/.">
      <BlogList posts={posts} categories={categories} />
    </AdminShell>
  );
}

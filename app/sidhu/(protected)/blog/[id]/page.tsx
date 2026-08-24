import { notFound } from "next/navigation";
import { AdminShell } from "@/components/sidhu/AdminShell";
import { BlogEditor } from "@/components/sidhu/BlogEditor";
import { getCloudinaryStatusAction } from "@/lib/cms/actions";
import { cms } from "@/lib/cms/repository";

export const dynamic = "force-dynamic";

export default async function SidhuEditPostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [posts, categories, assets, cloud] = await Promise.all([
    cms.listPosts(),
    cms.listCategories(),
    cms.listMedia(),
    getCloudinaryStatusAction(),
  ]);
  const post = posts.find((item) => item.id === id);
  if (!post) notFound();
  return (
    <AdminShell title="Edit post" subtitle="TipTap content is stored as sanitized HTML.">
      <BlogEditor post={post} categories={categories} assets={assets} configured={cloud.configured} />
    </AdminShell>
  );
}

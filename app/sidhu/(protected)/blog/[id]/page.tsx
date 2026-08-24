import { notFound, redirect } from "next/navigation";
import { AdminShell } from "@/components/sidhu/AdminShell";
import { BlogEditor } from "@/components/sidhu/BlogEditor";
import { getCloudinaryStatusAction } from "@/lib/cms/actions";
import { cms } from "@/lib/cms/repository";
import { logServerError } from "@/lib/security/errors";

export const dynamic = "force-dynamic";

export default async function SidhuEditPostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (id === "new") redirect("/sidhu/blog/new/");
  let post;
  let categories;
  let assets;
  let cloud;
  try {
    [post, categories, assets, cloud] = await Promise.all([
      cms.getPostById(id),
      cms.listCategories(),
      cms.listMedia(),
      getCloudinaryStatusAction(),
    ]);
  } catch (error) {
    logServerError("sidhu:blog-edit", error);
    throw error;
  }
  if (!post) notFound();
  return (
    <AdminShell title="Edit post" subtitle="TipTap content is stored as sanitized HTML.">
      <BlogEditor post={post} categories={categories} assets={assets} configured={cloud.configured} />
    </AdminShell>
  );
}

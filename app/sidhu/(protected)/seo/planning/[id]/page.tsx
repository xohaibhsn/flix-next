import { notFound } from "next/navigation";
import { AdminShell } from "@/components/sidhu/AdminShell";
import { SeoModuleChrome } from "@/components/sidhu/SeoModuleChrome";
import { SeoPlanningDetail } from "@/components/sidhu/SeoPlanningDetail";
import { normalizePublicPath } from "@/lib/cms/ai-seo/research-schemas";
import { blogPostPath } from "@/lib/cms/blog-paths";
import { cms } from "@/lib/cms/repository";
import { buildArticleSnapshot } from "@/lib/cms/seo-planning/article-snapshot";
import { classifyRefreshArticle } from "@/lib/cms/seo-planning/refresh-target";
import type { WritingArticleContext } from "@/lib/cms/seo-planning/writing-brief";
import type { BlogPost, SeoPlanningDraft } from "@/lib/cms/types";

export const dynamic = "force-dynamic";

async function writingArticleForDraft(
  draft: SeoPlanningDraft,
  targetPost: BlogPost | null,
): Promise<WritingArticleContext> {
  if (draft.recommendation !== "REFRESH_EXISTING") return { status: "skipped" };
  const status = classifyRefreshArticle({
    targetPostId: draft.targetPostId,
    matchedPublicUrl: draft.matchedPublicUrl,
    post: targetPost,
  });
  if (status === "missing") return { status: "missing" };
  if (status === "mismatch") return { status: "mismatch" };
  if (!targetPost) return { status: "missing" };
  const categories = await cms.listCategories();
  const category = categories.find((item) => item.id === targetPost.categoryId);
  return {
    status: "ready",
    snapshot: buildArticleSnapshot({
      title: targetPost.title,
      excerpt: targetPost.excerpt,
      publicPath: normalizePublicPath(blogPostPath(targetPost.slug)) || blogPostPath(targetPost.slug),
      categoryName: category?.name || "",
      focusKeyword: targetPost.focusKeyword,
      featuredImagePresent: Boolean(targetPost.featuredImage),
      html: targetPost.content,
    }),
  };
}

export default async function SidhuSeoPlanningDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const draft = await cms.getSeoPlanningDraftById(id);
  if (!draft) notFound();

  const targetPost = draft.targetPostId ? await cms.getPostById(draft.targetPostId) : null;

  return (
    <AdminShell
      title="SEO"
      subtitle="Search visibility, metadata and technical diagnostics."
      breadcrumbs={[
        { label: "SEO", href: "/sidhu/seo/" },
        { label: "Planning", href: "/sidhu/seo/planning/" },
        { label: draft.workingTitle || "Draft" },
      ]}
    >
      <SeoModuleChrome>
        <SeoPlanningDetail
          draft={draft}
          targetPostTitle={targetPost?.title || null}
          writingArticle={await writingArticleForDraft(draft, targetPost)}
        />
      </SeoModuleChrome>
    </AdminShell>
  );
}

/**
 * Server-side WritingArticleContext builder for REFRESH_EXISTING plans.
 * Shared by Planning detail page and D2 prompt generation.
 */

import { normalizePublicPath } from "@/lib/cms/ai-seo/research-schemas";
import { blogPostPath } from "@/lib/cms/blog-paths";
import { buildArticleSnapshot } from "@/lib/cms/seo-planning/article-snapshot";
import { classifyRefreshArticle } from "@/lib/cms/seo-planning/refresh-target";
import type { WritingArticleContext } from "@/lib/cms/seo-planning/writing-brief";
import type { BlogCategory, BlogPost, SeoPlanningDraft } from "@/lib/cms/types";

export function buildWritingArticleContext(args: {
  draft: SeoPlanningDraft;
  targetPost: BlogPost | null;
  categories: BlogCategory[];
}): WritingArticleContext {
  if (args.draft.recommendation !== "REFRESH_EXISTING") return { status: "skipped" };
  const status = classifyRefreshArticle({
    targetPostId: args.draft.targetPostId,
    matchedPublicUrl: args.draft.matchedPublicUrl,
    post: args.targetPost,
  });
  if (status === "missing") return { status: "missing" };
  if (status === "mismatch") return { status: "mismatch" };
  if (!args.targetPost) return { status: "missing" };
  const category = args.categories.find((item) => item.id === args.targetPost?.categoryId);
  return {
    status: "ready",
    snapshot: buildArticleSnapshot({
      title: args.targetPost.title,
      excerpt: args.targetPost.excerpt,
      publicPath:
        normalizePublicPath(blogPostPath(args.targetPost.slug)) || blogPostPath(args.targetPost.slug),
      categoryName: category?.name || "",
      focusKeyword: args.targetPost.focusKeyword,
      featuredImagePresent: Boolean(args.targetPost.featuredImage),
      html: args.targetPost.content,
    }),
  };
}

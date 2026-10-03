import { BLOG_INDEX_SLUG } from "@/lib/cms/blog-index";
import { blogPostPath } from "@/lib/cms/blog-paths";
import { categoryPublicPath } from "@/lib/cms/category-seo";
import type { BlogCategory, BlogPost } from "@/lib/cms/types";

export type BlogArchivePostCardLink = {
  /** Stable id for diagnostics (post id + source). */
  id: string;
  label: string;
  href: string;
  sourcePath: string;
  sourceLabel: string;
  postId: string;
};

type PostPick = Pick<BlogPost, "id" | "title" | "slug" | "status" | "categoryId">;
type CategoryPick = Pick<BlogCategory, "id" | "name" | "slug" | "active">;

function publishedPostWithSlug(post: PostPick) {
  return post.status === "published" && Boolean(post.slug?.trim()) && Boolean(post.title?.trim());
}

/** Post-card title links rendered on /blogs/ (published posts only). */
export function blogIndexPostCardLinks(posts: PostPick[]): BlogArchivePostCardLink[] {
  return posts.filter(publishedPostWithSlug).map((post) => ({
    id: `blog-index-post:${post.id}`,
    label: post.title.trim(),
    href: blogPostPath(post.slug.trim()),
    sourcePath: BLOG_INDEX_SLUG,
    sourceLabel: "Blog index",
    postId: post.id,
  }));
}

/**
 * Post-card title links rendered on active /category/[slug]/ archives.
 * Only includes published posts whose categoryId matches that category.
 */
export function categoryArchivePostCardLinks(
  categories: CategoryPick[],
  posts: PostPick[],
): BlogArchivePostCardLink[] {
  const out: BlogArchivePostCardLink[] = [];
  for (const category of categories) {
    if (!category.active || !category.slug.trim()) continue;
    const sourcePath = categoryPublicPath(category.slug.trim());
    const sourceLabel = category.name.trim() || category.slug.trim();
    for (const post of posts) {
      if (!publishedPostWithSlug(post)) continue;
      if (post.categoryId !== category.id) continue;
      out.push({
        id: `category-archive-post:${category.id}:${post.id}`,
        label: post.title.trim(),
        href: blogPostPath(post.slug.trim()),
        sourcePath,
        sourceLabel,
        postId: post.id,
      });
    }
  }
  return out;
}

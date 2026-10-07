/**
 * Governor-specific bounded Blog corpus projection (includes postId).
 * Separate from `buildSeoResearchInventory` so Research payloads stay unchanged.
 *
 * V1: exact projection only — no embeddings / fulltext. Cap ≤20 candidates.
 */

import { blogPostPath, resolveBlogPostCanonical } from "@/lib/cms/blog-paths";
import { normalizePublicPath } from "@/lib/cms/ai-seo/research-schemas";
import type { BlogPost } from "@/lib/cms/types";
import {
  SEO_REFRESH_FIRST_CAPS,
  type SeoRefreshFirstCorpusCandidate,
} from "@/lib/cms/seo-refresh-first/types";

function trim(value: unknown, max: number) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

/**
 * Project BlogPosts into Governor candidates with authoritative postId.
 * Sorted newest-first; hard-capped. Never includes body content.
 */
export function buildSeoRefreshFirstCorpusCandidates(
  posts: BlogPost[],
  options?: { max?: number; categoryNameById?: ReadonlyMap<string, string> },
): SeoRefreshFirstCorpusCandidate[] {
  const max = Math.min(
    Math.max(1, options?.max ?? SEO_REFRESH_FIRST_CAPS.maxCandidates),
    SEO_REFRESH_FIRST_CAPS.maxCandidates,
  );
  const sorted = [...(posts || [])].sort((a, b) =>
    String(b.updatedAt || b.publishedAt || "").localeCompare(
      String(a.updatedAt || a.publishedAt || ""),
    ),
  );

  const out: SeoRefreshFirstCorpusCandidate[] = [];
  for (const post of sorted) {
    if (out.length >= max) break;
    const id = trim(post.id, SEO_REFRESH_FIRST_CAPS.postId);
    if (!id) continue;
    const slug = trim(post.slug, SEO_REFRESH_FIRST_CAPS.slug);
    const publicUrl = normalizePublicPath(blogPostPath(slug || post.slug));
    if (!publicUrl) continue;
    const canonicalRaw = resolveBlogPostCanonical(post);
    const canonicalUrl = normalizePublicPath(canonicalRaw) || trim(canonicalRaw, SEO_REFRESH_FIRST_CAPS.url);
    const categoryName =
      post.categoryId && options?.categoryNameById
        ? trim(options.categoryNameById.get(post.categoryId), 80) || undefined
        : undefined;

    out.push({
      postId: id,
      publicUrl,
      title: trim(post.title, SEO_REFRESH_FIRST_CAPS.title) || undefined,
      slug: slug || undefined,
      seoTitle: trim(post.seoTitle, SEO_REFRESH_FIRST_CAPS.title) || undefined,
      canonicalUrl: canonicalUrl || undefined,
      status: post.status,
      categoryName,
      excerpt: trim(post.excerpt, SEO_REFRESH_FIRST_CAPS.excerpt) || undefined,
    });
  }
  return out;
}

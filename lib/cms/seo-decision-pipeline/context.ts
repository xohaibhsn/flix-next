/**
 * Pure Decision Pipeline run-context construction.
 * Zero I/O — feed posts/drafts from the caller or from context-cms.
 */

import { normalizePublicPath } from "@/lib/cms/ai-seo/research-schemas";
import { blogPostPath, resolveBlogPostCanonical } from "@/lib/cms/blog-paths";
import { buildSeoRefreshFirstCorpusCandidates } from "@/lib/cms/seo-refresh-first";
import { SEO_REFRESH_FIRST_CAPS } from "@/lib/cms/seo-refresh-first/types";
import type { BlogPost, SeoPlanningDraft } from "@/lib/cms/types";
import {
  extractDraftBlogReservations,
  extractPlanningReservationKeys,
  normalizeDecisionPipelinePath,
} from "@/lib/cms/seo-decision-pipeline/adapt";
import {
  SEO_DECISION_PIPELINE_CAPS,
  type SeoDecisionPipelineBlogIdentity,
  type SeoDecisionPipelineContext,
} from "@/lib/cms/seo-decision-pipeline/types";

function trim(value: unknown, max: number): string {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

/**
 * Project BlogPosts into lightweight identities (no body).
 * Includes published + draft — drafts reserve content.
 */
export function projectBlogIdentities(
  posts: readonly BlogPost[],
  categoryNameById?: ReadonlyMap<string, string>,
): SeoDecisionPipelineBlogIdentity[] {
  const out: SeoDecisionPipelineBlogIdentity[] = [];
  for (const post of posts || []) {
    const postId = trim(post.id, SEO_DECISION_PIPELINE_CAPS.postId);
    if (!postId) continue;
    const slug = trim(post.slug, SEO_DECISION_PIPELINE_CAPS.slug);
    const publicUrl =
      normalizeDecisionPipelinePath(blogPostPath(slug || post.slug)) ||
      normalizePublicPath(blogPostPath(slug || post.slug));
    if (!publicUrl) continue;
    const canonicalRaw = resolveBlogPostCanonical(post);
    const canonicalUrl =
      normalizeDecisionPipelinePath(canonicalRaw) ||
      trim(canonicalRaw, SEO_DECISION_PIPELINE_CAPS.url) ||
      undefined;
    const categoryName =
      post.categoryId && categoryNameById
        ? trim(categoryNameById.get(post.categoryId), 80) || undefined
        : undefined;
    out.push({
      postId,
      publicUrl,
      slug: slug || "",
      title: trim(post.title, SEO_REFRESH_FIRST_CAPS.title) || "",
      seoTitle: trim(post.seoTitle, SEO_REFRESH_FIRST_CAPS.title) || undefined,
      canonicalUrl: canonicalUrl || undefined,
      status: post.status,
      categoryName,
      excerpt: trim(post.excerpt, SEO_REFRESH_FIRST_CAPS.excerpt) || undefined,
    });
  }
  return out;
}

/**
 * Pure context builder from already-loaded data.
 * Safe for unit tests — no CMS I/O.
 */
export function createSeoDecisionPipelineContextFromData(args: {
  posts: readonly BlogPost[];
  planningDrafts?: readonly SeoPlanningDraft[];
  categoryNameById?: ReadonlyMap<string, string>;
  runId?: string;
}): SeoDecisionPipelineContext {
  const categoryNameById = args.categoryNameById;
  const blogIdentities = projectBlogIdentities(args.posts, categoryNameById);
  const totalBlogCount = blogIdentities.length;

  const candidates = buildSeoRefreshFirstCorpusCandidates([...args.posts], {
    max: SEO_DECISION_PIPELINE_CAPS.maxCandidates,
    categoryNameById,
  });

  const draftReservations = extractDraftBlogReservations(blogIdentities);
  const planning = extractPlanningReservationKeys(args.planningDrafts || []);

  const blogComplete = totalBlogCount <= SEO_DECISION_PIPELINE_CAPS.maxCandidates;
  const reservationsTruncated = planning.truncated;
  // False PASS protection: incomplete Blog space OR truncated Planning reservations
  // must never claim corpusComplete.
  const corpusComplete = blogComplete && !reservationsTruncated;

  return {
    blogIdentities,
    totalBlogCount,
    corpusComplete,
    candidates,
    reservations: {
      draftSlugs: draftReservations.draftSlugs,
      draftTopicKeys: draftReservations.draftTopicKeys,
      reservedTopicKeys: planning.reservedTopicKeys,
      reservedSlugs: planning.reservedSlugs,
    },
    reservationsTruncated,
    categoryNameById,
    source: args.runId ? { runId: args.runId } : undefined,
  };
}

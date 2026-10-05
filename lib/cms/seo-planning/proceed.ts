import { normalizePublicPath } from "@/lib/cms/ai-seo/research-schemas";
import { blogPostPath, blogPostPathLegacy } from "@/lib/cms/blog-paths";
import { classifyGscPageUrl } from "@/lib/cms/gsc/classify-url";
import { gscKnownHistoricalPathSet } from "@/lib/cms/gsc/historical-registry";
import { buildGscSiteUrlIndex } from "@/lib/cms/gsc/site-url-index";
import { createId } from "@/lib/cms/ids";
import { withSlash } from "@/lib/cms/redirects";
import {
  SEO_PLANNING_DEFAULT_WORKFLOW,
  type SeoPlanningActionableRecommendation,
} from "@/lib/cms/seo-planning/constants";
import {
  buildSeoPlanningFingerprint,
  normalizePlanningRestorePath,
} from "@/lib/cms/seo-planning/fingerprint";
import {
  buildPlanningPayload,
  parseProceedOpportunityInput,
  sanitizeProceedGscMeta,
  sanitizeProceedSources,
  type ProceedOpportunityInput,
} from "@/lib/cms/seo-planning/sanitize";
import { slugify } from "@/lib/cms/slug";
import { mysqlDuplicateError } from "@/lib/cms/slug-change";
import type { BlogPost, CmsPage, BlogCategory, RedirectRule, SeoPlanningDraft } from "@/lib/cms/types";

export type ProceedSeoPlanningSuccess = {
  ok: true;
  id: string;
  created: boolean;
};

export type ProceedSeoPlanningFailure = {
  ok: false;
  error: string;
};

export type ProceedSeoPlanningResult = ProceedSeoPlanningSuccess | ProceedSeoPlanningFailure;

export type SeoPlanningCatalog = {
  listPosts(): Promise<BlogPost[]>;
  listPages(): Promise<CmsPage[]>;
  listCategories(): Promise<BlogCategory[]>;
  listActiveRedirects(): Promise<RedirectRule[]>;
  getSeoPlanningDraftByFingerprint(fingerprint: string): Promise<SeoPlanningDraft | null>;
  saveSeoPlanningDraft(draft: SeoPlanningDraft): Promise<SeoPlanningDraft>;
};

export type ResolvedProceedTarget = {
  recommendation: SeoPlanningActionableRecommendation;
  fingerprint: string;
  proposedSlug: string;
  targetPostId: string | null;
  matchedPublicUrl: string;
  restorePath: string;
};

export function resolvePostByMatchedPublicUrl(
  posts: readonly BlogPost[],
  matchedPublicUrl: string,
): BlogPost | null {
  const path = normalizePublicPath(matchedPublicUrl);
  if (!path) return null;
  for (const post of posts) {
    const current = normalizePublicPath(blogPostPath(post.slug));
    const legacy = normalizePublicPath(blogPostPathLegacy(post.slug));
    if (path === current || path === legacy) return post;
  }
  return null;
}

export function validateProceedTarget(args: {
  opportunity: ProceedOpportunityInput;
  posts: readonly BlogPost[];
  pages: readonly CmsPage[];
  categories: readonly BlogCategory[];
  redirects: readonly RedirectRule[];
}): { ok: true; value: ResolvedProceedTarget } | { ok: false; error: string } {
  const { opportunity } = args;
  const recommendation = opportunity.recommendation as SeoPlanningActionableRecommendation;

  if (recommendation === "NEW_BLOG") {
    const proposedSlug = slugify(opportunity.proposedSlug || opportunity.workingTitle);
    if (!proposedSlug) {
      return { ok: false, error: "A valid proposed slug is required for a new blog plan." };
    }
    const collision = args.posts.find((post) => post.slug === proposedSlug);
    if (collision) {
      return {
        ok: false,
        error: "Existing content already owns that slug. Choose a different topic or refresh the current article instead.",
      };
    }
    return {
      ok: true,
      value: {
        recommendation,
        fingerprint: buildSeoPlanningFingerprint({ recommendation, proposedSlug }),
        proposedSlug,
        targetPostId: null,
        matchedPublicUrl: "",
        restorePath: "",
      },
    };
  }

  if (recommendation === "REFRESH_EXISTING") {
    const matchedPublicUrl = opportunity.matchedPublicUrl || "";
    if (!matchedPublicUrl) {
      return {
        ok: false,
        error: "Refresh planning requires a matched current article URL.",
      };
    }
    const post = resolvePostByMatchedPublicUrl(args.posts, matchedPublicUrl);
    if (!post) {
      return {
        ok: false,
        error: "Could not resolve the matched URL to an existing blog post.",
      };
    }
    return {
      ok: true,
      value: {
        recommendation,
        fingerprint: buildSeoPlanningFingerprint({
          recommendation,
          targetPostId: post.id,
        }),
        proposedSlug: "",
        targetPostId: post.id,
        matchedPublicUrl: normalizePublicPath(blogPostPath(post.slug)) || matchedPublicUrl,
        restorePath: "",
      },
    };
  }

  if (recommendation === "RESTORE_HISTORICAL") {
    const restorePath = normalizePlanningRestorePath(opportunity.restorePath);
    if (!restorePath || restorePath === "/") {
      return {
        ok: false,
        error: "Historical restore planning requires a valid non-root path.",
      };
    }
    if (!gscKnownHistoricalPathSet().has(withSlash(restorePath))) {
      return {
        ok: false,
        error: "That historical path is not in the known restoration registry.",
      };
    }
    const index = buildGscSiteUrlIndex({
      pages: [...args.pages],
      posts: [...args.posts],
      categories: [...args.categories],
      redirects: [...args.redirects],
    });
    const classified = classifyGscPageUrl(restorePath, index);
    if (classified.classification === "CURRENT_CMS") {
      return {
        ok: false,
        error: "That path is currently owned by published CMS content and cannot be planned for restore.",
      };
    }
    if (classified.classification === "CURRENT_PUBLIC_NON_CMS") {
      return {
        ok: false,
        error: "That path is a current public route and cannot be planned for restore.",
      };
    }
    if (classified.classification === "REDIRECTED_HISTORICAL") {
      return {
        ok: false,
        error: "Redirected historical paths are not eligible for restore planning.",
      };
    }
    if (classified.classification !== "REMOVED_OR_404") {
      return {
        ok: false,
        error: "That path is not currently classified as removed/historical for restore planning.",
      };
    }
    return {
      ok: true,
      value: {
        recommendation,
        fingerprint: buildSeoPlanningFingerprint({ recommendation, restorePath }),
        proposedSlug: "",
        targetPostId: null,
        matchedPublicUrl: "",
        restorePath,
      },
    };
  }

  // INTERNAL_LINK_ONLY
  const matchedPublicUrl = opportunity.matchedPublicUrl
    ? normalizePublicPath(opportunity.matchedPublicUrl) || ""
    : "";
  let resolvedUrl = matchedPublicUrl;
  let targetPostId: string | null = null;
  if (matchedPublicUrl) {
    const post = resolvePostByMatchedPublicUrl(args.posts, matchedPublicUrl);
    if (post) {
      targetPostId = post.id;
      resolvedUrl = normalizePublicPath(blogPostPath(post.slug)) || matchedPublicUrl;
    }
  }
  return {
    ok: true,
    value: {
      recommendation,
      fingerprint: buildSeoPlanningFingerprint({
        recommendation,
        matchedPublicUrl: resolvedUrl,
        topic: opportunity.topic,
      }),
      proposedSlug: "",
      targetPostId,
      matchedPublicUrl: resolvedUrl,
      restorePath: "",
    },
  };
}

/**
 * Create or open a private SEO planning draft from an opportunity snapshot.
 * Never calls OpenAI/GSC. Never writes BlogPost or redirects.
 */
export async function proceedSeoOpportunityToPlanningDraft(args: {
  rawOpportunity: unknown;
  rawSources?: unknown;
  rawGscMeta?: unknown;
  adminId: string;
  catalog: SeoPlanningCatalog;
  now?: string;
  createIdFn?: (prefix?: string) => string;
}): Promise<ProceedSeoPlanningResult> {
  const parsed = parseProceedOpportunityInput(args.rawOpportunity);
  if (!parsed.ok) return parsed;

  const [posts, pages, categories, redirects] = await Promise.all([
    args.catalog.listPosts(),
    args.catalog.listPages(),
    args.catalog.listCategories(),
    args.catalog.listActiveRedirects(),
  ]);

  const postsBefore = posts.length;
  const redirectsBefore = redirects.length;

  const validated = validateProceedTarget({
    opportunity: parsed.value,
    posts,
    pages,
    categories,
    redirects,
  });
  if (!validated.ok) return validated;

  const existing = await args.catalog.getSeoPlanningDraftByFingerprint(validated.value.fingerprint);
  if (existing) {
    return { ok: true, id: existing.id, created: false };
  }

  const now = args.now || new Date().toISOString();
  const id = (args.createIdFn || createId)("seoplan");
  const sources = sanitizeProceedSources(args.rawSources);
  const gsc = sanitizeProceedGscMeta(args.rawGscMeta);
  const draft: SeoPlanningDraft = {
    id,
    recommendation: validated.value.recommendation,
    workflowStatus: SEO_PLANNING_DEFAULT_WORKFLOW,
    fingerprint: validated.value.fingerprint,
    topic: parsed.value.topic,
    workingTitle: parsed.value.workingTitle,
    proposedSlug: validated.value.proposedSlug,
    targetPostId: validated.value.targetPostId,
    matchedPublicUrl: validated.value.matchedPublicUrl,
    restorePath: validated.value.restorePath,
    searchIntent: parsed.value.searchIntent,
    linkedPostId: null,
    createdBy: args.adminId,
    createdAt: now,
    updatedAt: now,
    payload: buildPlanningPayload({
      opportunity: {
        ...parsed.value,
        restorePath: validated.value.restorePath || parsed.value.restorePath,
        matchedPublicUrl: validated.value.matchedPublicUrl || parsed.value.matchedPublicUrl,
      },
      sources,
      gsc,
    }),
  };

  try {
    const saved = await args.catalog.saveSeoPlanningDraft(draft);
    // Resource-safety invariants for callers/tests (no BlogPost/redirect writes in this path).
    void postsBefore;
    void redirectsBefore;
    return { ok: true, id: saved.id, created: true };
  } catch (error) {
    if (mysqlDuplicateError(error)) {
      const raced = await args.catalog.getSeoPlanningDraftByFingerprint(validated.value.fingerprint);
      if (raced) return { ok: true, id: raced.id, created: false };
    }
    // JSON catalog may throw a plain Error for fingerprint conflict.
    if (error instanceof Error && /fingerprint/i.test(error.message)) {
      const raced = await args.catalog.getSeoPlanningDraftByFingerprint(validated.value.fingerprint);
      if (raced) return { ok: true, id: raced.id, created: false };
    }
    return {
      ok: false,
      error: "Could not create the planning draft. Please try again.",
    };
  }
}

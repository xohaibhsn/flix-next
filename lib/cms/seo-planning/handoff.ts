/**
 * Content Handoff V1 — Planning → existing Blog editor (Option A).
 * No article body in Planning. No auto-publish. No workflow auto-advance.
 */

import { emptyPost } from "@/lib/cms/blog";
import { createId } from "@/lib/cms/ids";
import { slugify } from "@/lib/cms/slug";
import {
  isSeoPlanningDraftArchived,
  SEO_PLANNING_ARCHIVED_EDIT_MESSAGE,
  SEO_PLANNING_MISSING_DRAFT_MESSAGE,
} from "@/lib/cms/seo-planning/lifecycle";
import { isInternalLinkPlanningRecommendation } from "@/lib/cms/seo-planning/workspace";
import type { BlogPost, SeoPlanningDraft } from "@/lib/cms/types";
import { sanitizePost, sanitizeText } from "@/lib/cms/validation";
import { SEO_PLANNING_FIELD_CAPS } from "@/lib/cms/seo-planning/constants";

export const SEO_PLANNING_HANDOFF_BLOG_PERMISSION_MESSAGE =
  "Blog access is required to open or create an article from Planning.";
export const SEO_PLANNING_HANDOFF_UNSUPPORTED_MESSAGE =
  "Content Handoff is not available for this planning recommendation.";
export const SEO_PLANNING_HANDOFF_INTERNAL_LINK_MESSAGE =
  "Internal-link plans do not create or edit articles. Use the future Internal Link workflow instead.";
export const SEO_PLANNING_HANDOFF_RESTORE_HISTORICAL_MESSAGE =
  "Historical restore needs a separate recovery review before article creation.";
export const SEO_PLANNING_HANDOFF_REFRESH_TARGET_MISSING_MESSAGE =
  "The target BlogPost for this refresh plan could not be found.";
export const SEO_PLANNING_HANDOFF_LINKED_POST_MISSING_MESSAGE =
  "The linked Blog draft no longer exists. Restore or relink requires a deliberate recovery step.";
export const SEO_PLANNING_HANDOFF_SLUG_CONFLICT_MESSAGE =
  "That blog slug is already in use. Change the proposed slug or working title, then try again.";
export const SEO_PLANNING_HANDOFF_TITLE_REQUIRED_MESSAGE =
  "A working title is required before creating a Blog draft.";
export const SEO_PLANNING_HANDOFF_REFRESH_TARGET_REQUIRED_MESSAGE =
  "This refresh plan is missing its target BlogPost id.";
export const SEO_PLANNING_HANDOFF_CONFLICT_MESSAGE =
  "Content Handoff could not complete because Planning state changed. Try again.";

export type SeoPlanningHandoffErrorCode =
  | "planning_not_found"
  | "planning_archived"
  | "unsupported_recommendation"
  | "internal_link_only"
  | "restore_historical"
  | "refresh_target_missing"
  | "refresh_target_required"
  | "linked_post_missing"
  | "slug_conflict"
  | "title_required"
  | "blog_permission_required"
  | "handoff_conflict"
  | "access_denied"
  | "unauthorized";

export type SeoPlanningHandoffSuccess = {
  ok: true;
  postId: string;
  editorPath: string;
  created: boolean;
  recommendation: "REFRESH_EXISTING" | "NEW_BLOG";
};

export type SeoPlanningHandoffFailure = {
  ok: false;
  error: string;
  code: SeoPlanningHandoffErrorCode;
};

export type SeoPlanningHandoffResult = SeoPlanningHandoffSuccess | SeoPlanningHandoffFailure;

export function seoPlanningBlogEditorPath(postId: string): string {
  const id = String(postId || "").trim();
  return id ? `/sidhu/blog/${id}/` : "/sidhu/blog/";
}

export function parseSeoPlanningHandoffInput(
  raw: unknown,
): { ok: true; planningDraftId: string } | SeoPlanningHandoffFailure {
  const id =
    raw && typeof raw === "object" && !Array.isArray(raw) && "planningDraftId" in raw
      ? sanitizeText(String((raw as { planningDraftId?: unknown }).planningDraftId || ""), SEO_PLANNING_FIELD_CAPS.id)
      : typeof raw === "string"
        ? sanitizeText(raw, SEO_PLANNING_FIELD_CAPS.id)
        : "";
  if (!id) {
    return { ok: false, error: SEO_PLANNING_MISSING_DRAFT_MESSAGE, code: "planning_not_found" };
  }
  return { ok: true, planningDraftId: id };
}

export function evaluateSeoPlanningHandoffEligibility(
  draft: SeoPlanningDraft | null | undefined,
): SeoPlanningHandoffFailure | { ok: true; draft: SeoPlanningDraft } {
  if (!draft) {
    return { ok: false, error: SEO_PLANNING_MISSING_DRAFT_MESSAGE, code: "planning_not_found" };
  }
  if (isSeoPlanningDraftArchived(draft)) {
    return { ok: false, error: SEO_PLANNING_ARCHIVED_EDIT_MESSAGE, code: "planning_archived" };
  }
  if (isInternalLinkPlanningRecommendation(draft.recommendation)) {
    return {
      ok: false,
      error: SEO_PLANNING_HANDOFF_INTERNAL_LINK_MESSAGE,
      code: "internal_link_only",
    };
  }
  if (draft.recommendation === "RESTORE_HISTORICAL") {
    return {
      ok: false,
      error: SEO_PLANNING_HANDOFF_RESTORE_HISTORICAL_MESSAGE,
      code: "restore_historical",
    };
  }
  if (draft.recommendation === "REFRESH_EXISTING" || draft.recommendation === "NEW_BLOG") {
    return { ok: true, draft };
  }
  return {
    ok: false,
    error: SEO_PLANNING_HANDOFF_UNSUPPORTED_MESSAGE,
    code: "unsupported_recommendation",
  };
}

export function resolveNewBlogHandoffSlug(draft: Pick<SeoPlanningDraft, "proposedSlug" | "workingTitle">): string {
  const proposed = String(draft.proposedSlug || "").trim();
  const title = String(draft.workingTitle || "").trim();
  return slugify(proposed || title) || "post";
}

/**
 * Minimal private Blog draft for NEW_BLOG handoff.
 * Does not publish, attach media, or invent SEO metadata.
 */
export function buildNewBlogHandoffDraft(args: {
  workingTitle: string;
  proposedSlug: string;
  createIdFn?: (prefix?: string) => string;
  now?: string;
}): BlogPost | SeoPlanningHandoffFailure {
  const title = String(args.workingTitle || "").trim();
  if (!title) {
    return {
      ok: false,
      error: SEO_PLANNING_HANDOFF_TITLE_REQUIRED_MESSAGE,
      code: "title_required",
    };
  }
  const now = args.now || new Date().toISOString();
  const id = (args.createIdFn || createId)("post");
  const slug = slugify(String(args.proposedSlug || "").trim() || title) || "post";
  const base = emptyPost();
  return sanitizePost({
    ...base,
    id,
    title,
    slug,
    content: "<p></p>",
    status: "draft",
    publishedAt: null,
    createdAt: now,
    updatedAt: now,
    categoryId: null,
    featuredImage: null,
    ogImage: null,
    seoTitle: "",
    seoDescription: "",
    focusKeyword: "",
    canonicalUrl: "",
    ogTitle: "",
    ogDescription: "",
  });
}

export function handoffSuccess(args: {
  postId: string;
  created: boolean;
  recommendation: "REFRESH_EXISTING" | "NEW_BLOG";
}): SeoPlanningHandoffSuccess {
  return {
    ok: true,
    postId: args.postId,
    editorPath: seoPlanningBlogEditorPath(args.postId),
    created: args.created,
    recommendation: args.recommendation,
  };
}

/**
 * Phase B — private planning workspace updates + workflow transitions.
 * No BlogPost / redirects / OpenAI / GSC. No timestamp-based stale guard
 * (MySQL DATETIME is second-precision; last save wins).
 */

import { SEO_RESEARCH_INTENTS, type SeoResearchIntent } from "@/lib/cms/ai-seo/research-schemas";
import {
  SEO_PLANNING_FIELD_CAPS,
  SEO_PLANNING_HUMAN_NOTES_CAP,
  isSeoPlanningActionableRecommendation,
} from "@/lib/cms/seo-planning/constants";
import { sanitizeSeoPlanningDraft } from "@/lib/cms/seo-planning/sanitize";
import {
  SEO_PLANNING_WORKFLOW_STATUSES,
  type SeoPlanningDraft,
  type SeoPlanningWorkflowStatus,
} from "@/lib/cms/types";
import { sanitizeText } from "@/lib/cms/validation";

const CONTENT_WORKFLOW_GRAPH: Record<
  SeoPlanningWorkflowStatus,
  readonly SeoPlanningWorkflowStatus[]
> = {
  PLANNING: ["CONTENT_NEEDED"],
  CONTENT_NEEDED: ["PLANNING", "IMAGE_NEEDED"],
  IMAGE_NEEDED: ["CONTENT_NEEDED", "SEO_REVIEW"],
  SEO_REVIEW: ["IMAGE_NEEDED", "CONTENT_NEEDED", "READY_TO_PUBLISH"],
  READY_TO_PUBLISH: ["SEO_REVIEW"],
};

const CONTENT_RECOMMENDATIONS = new Set([
  "NEW_BLOG",
  "REFRESH_EXISTING",
  "RESTORE_HISTORICAL",
]);

export type SeoPlanningWorkspaceInput = {
  id: string;
  topic: string;
  workingTitle: string;
  searchIntent: SeoResearchIntent;
  humanNotes: string;
  workflowStatus: SeoPlanningWorkflowStatus;
};

export type SeoPlanningWorkspaceParseResult =
  | { ok: true; value: SeoPlanningWorkspaceInput }
  | { ok: false; error: string };

export type SeoPlanningWorkspaceApplyResult =
  | { ok: true; draft: SeoPlanningDraft }
  | { ok: false; error: string };

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  const text = typeof value === "string" ? value.trim() : "";
  return (allowed as readonly string[]).includes(text) ? (text as T) : null;
}

export function isContentPlanningRecommendation(recommendation: string): boolean {
  return CONTENT_RECOMMENDATIONS.has(recommendation);
}

export function isInternalLinkPlanningRecommendation(recommendation: string): boolean {
  return recommendation === "INTERNAL_LINK_ONLY";
}

/** Allowed next statuses from `from` for content recommendations (excludes same-status). */
export function allowedSeoPlanningTransitions(
  from: SeoPlanningWorkflowStatus,
): readonly SeoPlanningWorkflowStatus[] {
  return CONTENT_WORKFLOW_GRAPH[from] || [];
}

export function isAllowedSeoPlanningWorkflowTransition(
  from: SeoPlanningWorkflowStatus,
  to: SeoPlanningWorkflowStatus,
): boolean {
  if (from === to) return true;
  return allowedSeoPlanningTransitions(from).includes(to);
}

/** Human button label for a transition from `from` → `to`. */
export function seoPlanningTransitionButtonLabel(
  from: SeoPlanningWorkflowStatus,
  to: SeoPlanningWorkflowStatus,
): string {
  if (from === "CONTENT_NEEDED" && to === "PLANNING") return "Back to Planning";
  if (from === "IMAGE_NEEDED" && to === "CONTENT_NEEDED") return "Back to Content Needed";
  if (from === "SEO_REVIEW" && to === "IMAGE_NEEDED") return "Back to Image Needed";
  if (from === "SEO_REVIEW" && to === "CONTENT_NEEDED") return "Back to Content Needed";
  if (from === "READY_TO_PUBLISH" && to === "SEO_REVIEW") return "Back to SEO Review";
  if (to === "CONTENT_NEEDED") return "Move to Content Needed";
  if (to === "IMAGE_NEEDED") return "Move to Image Needed";
  if (to === "SEO_REVIEW") return "Move to SEO Review";
  if (to === "READY_TO_PUBLISH") return "Mark Ready to Publish";
  if (to === "PLANNING") return "Back to Planning";
  const _exhaustive: never = to;
  return _exhaustive;
}

export function parseSeoPlanningWorkspaceInput(
  raw: unknown,
): SeoPlanningWorkspaceParseResult {
  const row = asRecord(raw);
  if (!row) return { ok: false, error: "Planning workspace data is missing." };

  const id = sanitizeText(row.id, SEO_PLANNING_FIELD_CAPS.id).trim();
  if (!id) return { ok: false, error: "Planning draft id is required." };

  const topic = sanitizeText(row.topic, SEO_PLANNING_FIELD_CAPS.topic).trim();
  if (!topic) return { ok: false, error: "Topic is required." };

  const workingTitle = sanitizeText(row.workingTitle, SEO_PLANNING_FIELD_CAPS.workingTitle).trim();
  if (!workingTitle) return { ok: false, error: "Working title is required." };

  const searchIntent = oneOf(row.searchIntent, SEO_RESEARCH_INTENTS);
  if (!searchIntent) return { ok: false, error: "Choose a valid search intent." };

  const humanNotes = sanitizeText(
    typeof row.humanNotes === "string" ? row.humanNotes : "",
    SEO_PLANNING_HUMAN_NOTES_CAP,
  );

  const workflowStatus = oneOf(row.workflowStatus, SEO_PLANNING_WORKFLOW_STATUSES);
  if (!workflowStatus) return { ok: false, error: "Choose a valid workflow status." };

  return {
    ok: true,
    value: {
      id,
      topic,
      workingTitle,
      searchIntent,
      humanNotes,
      workflowStatus,
    },
  };
}

function mergeWorkspaceHumanNotes(
  storedPayload: Record<string, unknown>,
  humanNotes: string,
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...storedPayload };
  const existingWorkspace = asRecord(storedPayload.workspace) || {};
  next.workspace = {
    ...existingWorkspace,
    humanNotes,
  };
  return next;
}

export function readWorkspaceHumanNotes(payload: unknown): string {
  const root = asRecord(payload);
  if (!root) return "";
  const workspace = asRecord(root.workspace);
  if (!workspace) return "";
  return typeof workspace.humanNotes === "string" ? workspace.humanNotes : "";
}

/**
 * Build next draft from STORED draft + parsed workspace input.
 * Immutable fields always come from stored. Evidence payload preserved.
 */
export function applySeoPlanningWorkspaceUpdate(
  stored: SeoPlanningDraft,
  input: SeoPlanningWorkspaceInput,
  now?: string,
): SeoPlanningWorkspaceApplyResult {
  if (input.id !== stored.id) {
    return { ok: false, error: "Planning draft id does not match." };
  }

  if (!isSeoPlanningActionableRecommendation(stored.recommendation)) {
    return { ok: false, error: "This planning draft cannot be edited." };
  }

  if (isInternalLinkPlanningRecommendation(stored.recommendation)) {
    if (input.workflowStatus !== "PLANNING" || stored.workflowStatus !== "PLANNING") {
      return {
        ok: false,
        error: "Internal-link planning stays in Planning. Workflow transitions are not available.",
      };
    }
  } else if (isContentPlanningRecommendation(stored.recommendation)) {
    if (!isAllowedSeoPlanningWorkflowTransition(stored.workflowStatus, input.workflowStatus)) {
      return {
        ok: false,
        error: "That workflow change is not allowed from the current status.",
      };
    }
  } else {
    return { ok: false, error: "This planning draft cannot be edited." };
  }

  const storedPayload =
    stored.payload && typeof stored.payload === "object" && !Array.isArray(stored.payload)
      ? ({ ...stored.payload } as Record<string, unknown>)
      : {};

  const updatedAt = now || new Date().toISOString();
  const next = sanitizeSeoPlanningDraft({
    ...stored,
    // Explicit immutable copies (never from client).
    id: stored.id,
    recommendation: stored.recommendation,
    fingerprint: stored.fingerprint,
    proposedSlug: stored.proposedSlug,
    targetPostId: stored.targetPostId,
    matchedPublicUrl: stored.matchedPublicUrl,
    restorePath: stored.restorePath,
    linkedPostId: stored.linkedPostId,
    createdBy: stored.createdBy,
    createdAt: stored.createdAt,
    // Editable.
    topic: input.topic,
    workingTitle: input.workingTitle,
    searchIntent: input.searchIntent,
    workflowStatus: input.workflowStatus,
    updatedAt,
    payload: mergeWorkspaceHumanNotes(storedPayload, input.humanNotes),
  });

  return { ok: true, draft: next };
}

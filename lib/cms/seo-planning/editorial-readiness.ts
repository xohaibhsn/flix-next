/**
 * Read-only Editorial Readiness Checklist for Planning Detail.
 * Reuses existing eligibility helpers — no new AI / Apply / publish gates.
 */

import {
  hasSeoPlanningEditorialEvidenceContent,
  readSeoPlanningEditorialEvidence,
  SEO_PLANNING_EDITORIAL_TRUST,
  type SeoPlanningEditorialEvidenceV1,
} from "@/lib/cms/seo-planning/editorial-evidence";
import { evaluateSeoPlanningHandoffEligibility } from "@/lib/cms/seo-planning/handoff";
import {
  isSeoPlanningDraftArchived,
  SEO_PLANNING_ARCHIVED_PROVIDER_MESSAGE,
} from "@/lib/cms/seo-planning/lifecycle";
import {
  buildWritingBrief,
  type WritingArticleContext,
  type WritingBrief,
} from "@/lib/cms/seo-planning/writing-brief";
import type { SeoPlanningDraft } from "@/lib/cms/types";

export type EditorialReadinessItemStatus = "ok" | "hold" | "blocked" | "info" | "absent";

export type EditorialReadinessItem = {
  id: string;
  label: string;
  status: EditorialReadinessItemStatus;
  detail: string;
};

export type SeoPlanningEditorialReadinessChecklist = {
  items: EditorialReadinessItem[];
  /** Explicit policy banners — never imply Apply/Publish readiness. */
  aiApply: "unavailable";
  autonomousPublishing: "OFF";
  scheduler: "OFF";
  notes: string[];
};

/** Client-safe mirror of A1 NEW_BLOG gates — does not import server-only article-generation. */
function evaluateA1PreviewEligibility(
  draft: SeoPlanningDraft,
  brief: WritingBrief,
): { ok: true } | { ok: false; status: EditorialReadinessItemStatus; detail: string } {
  if (isSeoPlanningDraftArchived(draft)) {
    return {
      ok: false,
      status: "blocked",
      detail: `${SEO_PLANNING_ARCHIVED_PROVIDER_MESSAGE} Priority score does not override this.`,
    };
  }
  if (draft.recommendation === "REFRESH_EXISTING") {
    return {
      ok: false,
      status: "hold",
      detail:
        "A1 article preview supports NEW_BLOG only. REFRESH must not become autonomous NEW_BLOG. Priority score does not override this.",
    };
  }
  if (draft.recommendation === "RESTORE_HISTORICAL") {
    return {
      ok: false,
      status: "hold",
      detail:
        "RESTORE_HISTORICAL is recovery-gated — not A1 NEW_BLOG preview. Priority score does not override this.",
    };
  }
  if (draft.recommendation === "INTERNAL_LINK_ONLY") {
    return {
      ok: false,
      status: "hold",
      detail:
        "INTERNAL_LINK_ONLY is a link task — not A1 article preview. Priority score does not override this.",
    };
  }
  if (draft.recommendation !== "NEW_BLOG") {
    return {
      ok: false,
      status: "hold",
      detail: `Recommendation ${draft.recommendation} is not eligible for A1 NEW_BLOG preview.`,
    };
  }
  if (!brief.providerEligible || brief.taskType !== "NEW_BLOG") {
    return {
      ok: false,
      status: "hold",
      detail: `${brief.providerIneligibleReason || "Writing brief is not eligible for A1 preview."} Priority score does not override this.`,
    };
  }
  if (draft.workflowStatus !== "CONTENT_NEEDED") {
    return {
      ok: false,
      status: "hold",
      detail:
        "A1 preview requires Content Needed workflow. Priority score does not override this.",
    };
  }
  return { ok: true };
}

function recommendationLabel(value: string) {
  return value.replaceAll("_", " ");
}

function workflowLabel(value: string) {
  return value.replaceAll("_", " ");
}

export function buildSeoPlanningEditorialReadinessChecklist(args: {
  draft: SeoPlanningDraft;
  writingArticle?: WritingArticleContext;
  /** A1 feature gate — boolean only. */
  aiArticleGenerationEnabled?: boolean;
  openaiBlogArticleConfigured?: boolean;
}): SeoPlanningEditorialReadinessChecklist {
  const draft = args.draft;
  const writingArticle = args.writingArticle ?? { status: "skipped" };
  const archived = isSeoPlanningDraftArchived(draft);
  const brief: WritingBrief = buildWritingBrief(draft, writingArticle);
  const evidence: SeoPlanningEditorialEvidenceV1 = readSeoPlanningEditorialEvidence(draft.payload);
  const evidencePresent = hasSeoPlanningEditorialEvidenceContent(evidence);

  const items: EditorialReadinessItem[] = [];

  items.push({
    id: "recommendation",
    label: "Planning recommendation",
    status: draft.recommendation === "SKIP" ? "hold" : "info",
    detail: `${recommendationLabel(draft.recommendation)} · workflow ${workflowLabel(draft.workflowStatus)}`,
  });

  items.push({
    id: "lifecycle",
    label: "Archived / active status",
    status: archived ? "blocked" : "ok",
    detail: archived
      ? `Archived${draft.archivedAt ? ` at ${draft.archivedAt}` : ""}. Restore before editing.`
      : "Active — not archived.",
  });

  items.push({
    id: "writing_brief",
    label: "Writing-brief eligibility",
    status: brief.providerEligible ? "ok" : "hold",
    detail: brief.providerEligible
      ? `Eligible (${brief.taskLabel}).`
      : brief.providerIneligibleReason || "Writing brief is not eligible for provider prompts.",
  });

  const handoff = evaluateSeoPlanningHandoffEligibility(draft);
  items.push({
    id: "manual_handoff",
    label: "Manual Blog handoff eligibility",
    status: handoff.ok ? "ok" : archived || handoff.code === "planning_archived" ? "blocked" : "hold",
    detail: handoff.ok
      ? `Eligible for ${draft.recommendation === "REFRESH_EXISTING" ? "REFRESH open" : "NEW_BLOG create/reopen"}.`
      : handoff.error,
  });

  let a1Detail: string;
  let a1Status: EditorialReadinessItemStatus;
  if (!args.aiArticleGenerationEnabled) {
    a1Status = "hold";
    a1Detail =
      "A1 article preview feature gate is OFF — no provider invocation from this checklist.";
  } else {
    const articleElig = evaluateA1PreviewEligibility(draft, brief);
    if (!articleElig.ok) {
      a1Status = articleElig.status;
      a1Detail = articleElig.detail;
    } else if (!args.openaiBlogArticleConfigured) {
      a1Status = "hold";
      a1Detail = "OpenAI blog article provider is not configured.";
    } else {
      a1Status = "ok";
      a1Detail =
        "A1 private preview eligible (feature on + NEW_BLOG + Content Needed). Not A2 Apply.";
    }
  }
  items.push({
    id: "a1_preview",
    label: "A1 article-preview eligibility",
    status: a1Status,
    detail: a1Detail,
  });

  items.push({
    id: "editorial_evidence_presence",
    label: "Editorial evidence present/absent",
    status: evidencePresent ? "ok" : "absent",
    detail: evidencePresent
      ? `Captured (${evidence.entries.length} entr${evidence.entries.length === 1 ? "y" : "ies"}). Not verified grounded evidence.`
      : "No editorial evidence captured yet.",
  });

  items.push({
    id: "editorial_evidence_trust",
    label: "Editorial evidence trust",
    status: "info",
    detail: SEO_PLANNING_EDITORIAL_TRUST,
  });

  items.push({
    id: "missing_supporting_evidence",
    label: "Missing supporting evidence notes",
    status: evidence.missingEvidenceNotes.trim() ? "hold" : "info",
    detail: evidence.missingEvidenceNotes.trim()
      ? evidence.missingEvidenceNotes
      : "No missing-evidence notes recorded.",
  });

  const notes: string[] = [
    "A strong Priority score does not override eligibility.",
    "REFRESH / RESTORE / INTERNAL_LINK / HOLD must not become autonomous NEW_BLOG.",
    "GSC run-level AVAILABLE is not automatically linked query×page evidence.",
    "Editorial evidence capture is not verified grounded evidence.",
    "A1 Preview readiness is not A2 Apply readiness.",
    "Workflow READY_TO_PUBLISH is not publication approval.",
  ];

  if (draft.recommendation === "REFRESH_EXISTING") {
    notes.push("REFRESH stays on the existing Blog target — never auto-promoted to NEW_BLOG.");
  }
  if (draft.recommendation === "RESTORE_HISTORICAL") {
    notes.push("RESTORE_HISTORICAL remains recovery-gated — not autonomous NEW_BLOG.");
  }
  if (draft.recommendation === "INTERNAL_LINK_ONLY") {
    notes.push("INTERNAL_LINK_ONLY is a link task — not article generation.");
  }
  if (draft.recommendation === "SKIP") {
    notes.push("SKIP / HOLD recommendation — planning edits stay blocked by existing policy.");
  }
  if (draft.workflowStatus === "READY_TO_PUBLISH") {
    notes.push("READY_TO_PUBLISH is a private workflow marker only — nothing is published.");
  }

  return {
    items,
    aiApply: "unavailable",
    autonomousPublishing: "OFF",
    scheduler: "OFF",
    notes,
  };
}

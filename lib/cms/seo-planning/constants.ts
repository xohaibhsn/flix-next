import type { SeoResearchRecommendation } from "@/lib/cms/ai-seo/research-schemas";
import type { SeoPlanningWorkflowStatus } from "@/lib/cms/types";

export const SEO_PLANNING_ACTIONABLE_RECOMMENDATIONS = [
  "NEW_BLOG",
  "REFRESH_EXISTING",
  "RESTORE_HISTORICAL",
  "INTERNAL_LINK_ONLY",
] as const satisfies readonly SeoResearchRecommendation[];

export type SeoPlanningActionableRecommendation =
  (typeof SEO_PLANNING_ACTIONABLE_RECOMMENDATIONS)[number];

export const SEO_PLANNING_DEFAULT_WORKFLOW: SeoPlanningWorkflowStatus = "PLANNING";

/** Phase B human notes — stored under payload.workspace.humanNotes. */
export const SEO_PLANNING_HUMAN_NOTES_CAP = 4000;

export const SEO_PLANNING_FIELD_CAPS = {
  id: 80,
  fingerprint: 320,
  topic: 160,
  workingTitle: 180,
  proposedSlug: 180,
  targetPostId: 80,
  matchedPublicUrl: 300,
  restorePath: 300,
  searchIntent: 40,
  recommendation: 40,
  workflowStatus: 40,
  createdBy: 80,
  linkedPostId: 80,
  humanNotes: SEO_PLANNING_HUMAN_NOTES_CAP,
  whyNow: 280,
  webEvidence: 360,
  suggestedAngle: 280,
  nextStep: 220,
  matchedTitle: 160,
  confidence: 16,
  existingCoverage: 16,
  gscEvidenceRefs: 8,
  gscEvidenceRows: 8,
  sources: 24,
  sourceTitle: 160,
  sourceUrl: 400,
  evidenceId: 24,
  evidenceKind: 24,
  evidenceQuery: 200,
  evidenceClassification: 40,
  evidenceHistoricalKey: 80,
  evidenceRedirect: 300,
  statusLabel: 120,
  helperText: 280,
} as const;

export function isSeoPlanningActionableRecommendation(
  value: string,
): value is SeoPlanningActionableRecommendation {
  return (SEO_PLANNING_ACTIONABLE_RECOMMENDATIONS as readonly string[]).includes(value);
}

/**
 * SEO Manager workspace status — single-operator control surface data.
 *
 * NEW_BLOG eligibility on this panel is never a stale historical claim.
 * Without an injected authoritative Ledger summary, status is
 * ELIGIBILITY_NOT_CURRENTLY_VERIFIED (fail-closed; does not open Apply).
 */

import { readSeoAutomationSwitchBoard } from "@/lib/cms/seo-automation/master-control";
import { SEO_AUTOMATION_PILOT_LIMITS } from "@/lib/cms/seo-automation/budgets";
import { SEO_AUTOMATION_SCHEDULER_SAFE_DEFAULTS } from "@/lib/cms/seo-automation/scheduler";
import { evaluateA2ApplyDurableSchemaReadiness } from "@/lib/cms/seo-planning/article-apply-schema-readiness";
import {
  SEO_AI_ARTICLE_APPLY_PRODUCTION_WIRING_ENABLED,
} from "@/lib/cms/seo-planning/article-apply-production-gate";
import {
  SEO_AI_ONESHOT_PUBLISHER_ACTIVATED,
} from "@/lib/cms/seo-planning/article-oneshot-publisher";
import { isSeoAiArticleGenerationEnabled } from "@/lib/cms/ai-seo/config";
import { planSeoAutomationDurableMigration } from "@/lib/cms/seo-automation/migration-artifacts";
import { __peekCmsApplyDurableFacadeFactoryInstalled } from "@/lib/cms/seo-planning/article-apply-production-di";

export const SEO_AUTOMATION_WORKSPACE_STATUS_SPEC =
  "seo-automation-workspace-status-v1" as const;

/** Sidhu CMS Blog list route (not public `/blogs/`). */
export const SEO_MANAGER_CMS_BLOG_LIST_HREF = "/sidhu/blog/" as const;

/**
 * Historical last-audited note only — never presented as a live eligibility verdict.
 * CURSOR-REPORTED from prior authenticated Sidhu inspection; not re-verified here.
 */
export const SEO_AUTOMATION_ELIGIBILITY_HISTORICAL_LAST_AUDIT_NOTE =
  "Historical last-audited Sidhu inspection (CURSOR-REPORTED, not re-verified): Ledger showed zero currently visible eligible NEW_BLOG decisions. Open Experiment Ledger for current evidence." as const;

export type SeoAutomationEligibilityPanelStatus =
  | {
      status: "CURRENT";
      eligibleNewBlogCount: number;
      evidenceSource: "authoritative_ledger_summary";
      evidenceFreshness: "current";
    }
  | {
      status: "ELIGIBILITY_NOT_CURRENTLY_VERIFIED";
      evidenceFreshness: "stale_or_absent";
      reason: string;
      historicalLastAuditNote: string | null;
    }
  | {
      status: "UNKNOWN";
      evidenceFreshness: "unknown";
      reason: string;
      historicalLastAuditNote: string | null;
    };

/**
 * Optional authoritative summary for tests / future bounded Ledger reader wiring.
 * Must already apply RF/NBA/autonomous/selectable rules upstream — this helper
 * does not re-run Research and does not treat SUCCESS alone as eligible.
 */
export type SeoAutomationAuthoritativeEligibilitySummary = {
  eligibleNewBlogCount: number;
  /** When false/absent, result is UNKNOWN rather than a false zero. */
  summaryComplete: boolean;
};

export function resolveNewBlogEligibilityPanelStatus(args?: {
  authoritativeSummary?: SeoAutomationAuthoritativeEligibilitySummary | null;
  includeHistoricalLastAuditNote?: boolean;
}): SeoAutomationEligibilityPanelStatus {
  const historical =
    args?.includeHistoricalLastAuditNote === false
      ? null
      : SEO_AUTOMATION_ELIGIBILITY_HISTORICAL_LAST_AUDIT_NOTE;

  const summary = args?.authoritativeSummary;
  if (summary == null) {
    return {
      status: "ELIGIBILITY_NOT_CURRENTLY_VERIFIED",
      evidenceFreshness: "stale_or_absent",
      reason:
        "No authoritative current Ledger eligibility summary is attached to this panel. Missing Ledger data is not treated as zero eligible opportunities.",
      historicalLastAuditNote: historical,
    };
  }

  if (!summary.summaryComplete) {
    return {
      status: "UNKNOWN",
      evidenceFreshness: "unknown",
      reason:
        "Ledger eligibility summary is incomplete. Missing or partial data is not a verified zero.",
      historicalLastAuditNote: historical,
    };
  }

  const count = Number(summary.eligibleNewBlogCount);
  if (!Number.isFinite(count) || count < 0) {
    return {
      status: "UNKNOWN",
      evidenceFreshness: "unknown",
      reason: "Eligible NEW_BLOG count is not a usable non-negative number.",
      historicalLastAuditNote: historical,
    };
  }

  return {
    status: "CURRENT",
    eligibleNewBlogCount: Math.floor(count),
    evidenceSource: "authoritative_ledger_summary",
    evidenceFreshness: "current",
  };
}

export type SeoAutomationWorkspaceStatus = {
  spec: typeof SEO_AUTOMATION_WORKSPACE_STATUS_SPEC;
  operatorRole: "SEO Manager";
  superAdminOversightPreserved: true;
  switches: ReturnType<typeof readSeoAutomationSwitchBoard>;
  a1GenerationEnvEnabled: boolean;
  a2ApplyProductionWiringEnabled: boolean;
  a2SchemaReady: boolean;
  a2SchemaMessage: string;
  durableFacadeInstalled: boolean;
  oneshotPublisherActivated: boolean;
  schedulerDefaults: typeof SEO_AUTOMATION_SCHEDULER_SAFE_DEFAULTS;
  pilotLimits: typeof SEO_AUTOMATION_PILOT_LIMITS;
  migration: ReturnType<typeof planSeoAutomationDurableMigration>;
  livePilotReady: false;
  /** Current vs unverified vs UNKNOWN — never a historical false zero. */
  newBlogEligibility: SeoAutomationEligibilityPanelStatus;
  cmsBlogListHref: typeof SEO_MANAGER_CMS_BLOG_LIST_HREF;
  blockers: string[];
};

export function buildSeoAutomationWorkspaceStatus(args?: {
  authoritativeEligibilitySummary?: SeoAutomationAuthoritativeEligibilitySummary | null;
}): SeoAutomationWorkspaceStatus {
  const schema = evaluateA2ApplyDurableSchemaReadiness();
  const migration = planSeoAutomationDurableMigration();
  const newBlogEligibility = resolveNewBlogEligibilityPanelStatus({
    authoritativeSummary: args?.authoritativeEligibilitySummary ?? null,
  });

  const blockers: string[] = [];
  if (readSeoAutomationSwitchBoard().emergencyKill) blockers.push("emergency_kill_on");
  if (!Boolean(SEO_AI_ARTICLE_APPLY_PRODUCTION_WIRING_ENABLED)) {
    blockers.push("a2_apply_production_wiring_off");
  }
  if (!schema.ok) blockers.push("a2_durable_schema_unregistered");
  if (!__peekCmsApplyDurableFacadeFactoryInstalled()) {
    blockers.push("durable_facade_not_installed");
  }
  if (!Boolean(SEO_AI_ONESHOT_PUBLISHER_ACTIVATED)) blockers.push("oneshot_publisher_inactive");
  if (migration.blockers.includes("gate:oldWorkersPositivelyFenced")) {
    blockers.push("old_worker_fencing_unproven");
  }
  if (newBlogEligibility.status === "ELIGIBILITY_NOT_CURRENTLY_VERIFIED") {
    blockers.push("eligibility_not_currently_verified");
  } else if (newBlogEligibility.status === "UNKNOWN") {
    blockers.push("eligibility_unknown");
  } else if (newBlogEligibility.eligibleNewBlogCount < 1) {
    blockers.push("no_current_eligible_new_blog");
  }
  blockers.push("supervised_pilot_not_accepted");

  return {
    spec: SEO_AUTOMATION_WORKSPACE_STATUS_SPEC,
    operatorRole: "SEO Manager",
    superAdminOversightPreserved: true,
    switches: readSeoAutomationSwitchBoard(),
    a1GenerationEnvEnabled: isSeoAiArticleGenerationEnabled(),
    a2ApplyProductionWiringEnabled: Boolean(SEO_AI_ARTICLE_APPLY_PRODUCTION_WIRING_ENABLED),
    a2SchemaReady: schema.ok === true,
    a2SchemaMessage: schema.ok ? "ready" : schema.error,
    durableFacadeInstalled: __peekCmsApplyDurableFacadeFactoryInstalled(),
    oneshotPublisherActivated: Boolean(SEO_AI_ONESHOT_PUBLISHER_ACTIVATED),
    schedulerDefaults: SEO_AUTOMATION_SCHEDULER_SAFE_DEFAULTS,
    pilotLimits: SEO_AUTOMATION_PILOT_LIMITS,
    migration,
    livePilotReady: false,
    newBlogEligibility,
    cmsBlogListHref: SEO_MANAGER_CMS_BLOG_LIST_HREF,
    blockers,
  };
}

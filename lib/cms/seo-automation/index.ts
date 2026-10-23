export {
  SEO_AUTOMATION_MASTER_CONTROL_SPEC,
  SEO_AUTOMATION_EMERGENCY_KILL_SWITCH,
  SEO_AUTOMATION_MASTER_ENABLED,
  SEO_AUTOMATION_RESEARCH_ENABLED,
  SEO_AUTOMATION_GENERATION_ENABLED,
  SEO_AUTOMATION_APPLY_WRITERS_ENABLED,
  SEO_AUTOMATION_PUBLISHER_ENABLED,
  SEO_AUTOMATION_SCHEDULER_ENABLED,
  SEO_AUTOMATION_OUTCOMES_RECURRING_ENABLED,
  SEO_AUTOMATION_DEFAULT_TIMEZONE,
  readSeoAutomationSwitchBoard,
  assertSeoAutomationPathAllowed,
  type SeoAutomationSwitchBoard,
} from "@/lib/cms/seo-automation/master-control";

export {
  SEO_AUTOMATION_ELIGIBILITY_SPEC,
  evaluateAutonomousNewBlogEligibility,
  type SeoAutomationEligibilityInput,
  type SeoAutomationEligibilityResult,
} from "@/lib/cms/seo-automation/eligibility";

export {
  SEO_AUTOMATION_BUDGET_SPEC,
  SEO_AUTOMATION_PILOT_LIMITS,
  emptyPilotUsage,
  authorizePilotSpend,
  requireBoundedCostEstimate,
  assertRecurrenceBlocked,
  type SeoAutomationPilotUsage,
  type SeoAutomationBudgetDecision,
} from "@/lib/cms/seo-automation/budgets";

export {
  SEO_AUTOMATION_SCHEDULER_SPEC,
  SEO_AUTOMATION_SCHEDULER_SAFE_DEFAULTS,
  buildSchedulerOccurrenceKey,
  isSchedulerDayAllowed,
  evaluateSeoAutomationSchedulerTick,
  type SeoAutomationSchedulerConfig,
  type SeoAutomationSchedulerInvokeResult,
} from "@/lib/cms/seo-automation/scheduler";

export {
  SEO_AUTOMATION_OUTCOMES_SPEC,
  buildEmptyOutcomeWindow,
  computeOutcomeDeltas,
  evaluateOutcomeCollectionGate,
  type SeoAutomationOutcomeRecord,
  type SeoAutomationOutcomeWindow,
} from "@/lib/cms/seo-automation/outcomes";

export {
  SEO_AUTOMATION_RESEARCH_PILOT_SPEC,
  SEO_AUTOMATION_NO_ELIGIBLE_NEW_BLOG,
  prepareBoundedUkResearchPilot,
} from "@/lib/cms/seo-automation/research-pilot";

export {
  SEO_AUTOMATION_IMAGE_SEO_SPEC,
  SEO_AUTOMATION_IMAGE_PLAN,
  SEO_AUTOMATION_ONPAGE_SEO_PLAN,
  planArticleImages,
  evaluateAutomationOnPageSeo,
} from "@/lib/cms/seo-automation/image-seo-pipeline";

export {
  SEO_AUTOMATION_PREPUBLISH_GATE_SPEC,
  evaluateAutomationPrepublishGate,
} from "@/lib/cms/seo-automation/prepublish-automation-gate";

export {
  SEO_AUTOMATION_MIGRATION_ARTIFACT_SPEC,
  SEO_AUTOMATION_EXTENDED_DDL_STATEMENTS,
  SEO_AUTOMATION_MIGRATION_GATES_DEFAULT,
  planSeoAutomationDurableMigration,
} from "@/lib/cms/seo-automation/migration-artifacts";

export {
  SEO_AUTOMATION_ONESHOT_RUNTIME_SPEC,
  evaluateAndRefuseOneshotPublication,
  getInactiveOneshotPublisher,
} from "@/lib/cms/seo-automation/oneshot-publisher-runtime";

export {
  SEO_AUTOMATION_WORKSPACE_STATUS_SPEC,
  buildSeoAutomationWorkspaceStatus,
  type SeoAutomationWorkspaceStatus,
} from "@/lib/cms/seo-automation/workspace-status";

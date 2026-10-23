/**
 * SEO Manager workspace status — single-operator control surface data.
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
  blockers: string[];
};

export function buildSeoAutomationWorkspaceStatus(): SeoAutomationWorkspaceStatus {
  const schema = evaluateA2ApplyDurableSchemaReadiness();
  const migration = planSeoAutomationDurableMigration();
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
  blockers.push("no_eligible_new_blog_in_live_ledger_at_last_audit");
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
    blockers,
  };
}

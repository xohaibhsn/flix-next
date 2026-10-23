/**
 * Versioned, repeatable schema/migration ARTIFACTS for SEO Automation durability.
 *
 * NEVER registered with ensureCmsSchema / CMS_SCHEMA_STATEMENTS.
 * NEVER bumps CURRENT_CMS_SCHEMA_VERSION.
 * Production migration remains BLOCKED until backup, fencing, and Berlin authority.
 */

import {
  A2_APPLY_DURABLE_DDL_STATEMENTS,
  A2_APPLY_DURABLE_MUST_PRESERVE_LIVE_SCHEMA_VERSION,
  A2_APPLY_DURABLE_SCHEMA_REGISTERED_WITH_ENSURE,
  A2_APPLY_DURABLE_TARGET_SCHEMA_SLOT,
} from "@/lib/cms/seo-planning/article-apply-durable-schema";
import { CURRENT_CMS_SCHEMA_VERSION } from "@/lib/db/schema";

export const SEO_AUTOMATION_MIGRATION_ARTIFACT_SPEC =
  "seo-automation-migration-artifact-v1" as const;

/** Publisher job + lease tables (additive; unregistered). */
export const SEO_AUTOMATION_PUBLISHER_JOB_DDL = `
CREATE TABLE IF NOT EXISTS seo_automation_publisher_jobs (
  job_id VARCHAR(80) NOT NULL,
  post_id VARCHAR(80) NOT NULL,
  planning_draft_id VARCHAR(80) NOT NULL,
  content_fingerprint CHAR(64) NOT NULL,
  idempotency_key VARCHAR(120) NOT NULL,
  supervised_receipt_id VARCHAR(80) NOT NULL,
  status VARCHAR(24) NOT NULL,
  lease_owner VARCHAR(80) NULL,
  lease_expires_at DATETIME NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  PRIMARY KEY (job_id),
  UNIQUE KEY seo_automation_publisher_jobs_idempotency (idempotency_key),
  KEY seo_automation_publisher_jobs_post (post_id),
  CONSTRAINT seo_automation_publisher_jobs_post_fk
    FOREIGN KEY (post_id) REFERENCES blog_posts(id) ON DELETE RESTRICT,
  CONSTRAINT seo_automation_publisher_jobs_planning_fk
    FOREIGN KEY (planning_draft_id) REFERENCES seo_planning_drafts(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`.trim();

export const SEO_AUTOMATION_SCHEDULER_LEASE_DDL = `
CREATE TABLE IF NOT EXISTS seo_automation_scheduler_leases (
  occurrence_key VARCHAR(160) NOT NULL,
  claimed_by VARCHAR(80) NOT NULL,
  claimed_at DATETIME NOT NULL,
  expires_at DATETIME NOT NULL,
  status VARCHAR(24) NOT NULL,
  PRIMARY KEY (occurrence_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`.trim();

export const SEO_AUTOMATION_OUTCOME_DDL = `
CREATE TABLE IF NOT EXISTS seo_automation_gsc_outcomes (
  outcome_id VARCHAR(80) NOT NULL,
  research_opportunity_id VARCHAR(80) NOT NULL,
  ledger_decision_id VARCHAR(80) NULL,
  planning_id VARCHAR(80) NOT NULL,
  blog_post_id VARCHAR(80) NOT NULL,
  published_canonical_url VARCHAR(512) NOT NULL,
  publication_timestamp DATETIME NOT NULL,
  baseline_json MEDIUMTEXT NOT NULL,
  day7_json MEDIUMTEXT NULL,
  day14_json MEDIUMTEXT NULL,
  day28_json MEDIUMTEXT NULL,
  experiment_status VARCHAR(32) NOT NULL,
  ai_provider_cost_usd DECIMAL(10,4) NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  PRIMARY KEY (outcome_id),
  UNIQUE KEY seo_automation_gsc_outcomes_post (blog_post_id),
  KEY seo_automation_gsc_outcomes_planning (planning_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`.trim();

export const SEO_AUTOMATION_EXTENDED_DDL_STATEMENTS = [
  ...A2_APPLY_DURABLE_DDL_STATEMENTS,
  SEO_AUTOMATION_PUBLISHER_JOB_DDL,
  SEO_AUTOMATION_SCHEDULER_LEASE_DDL,
  SEO_AUTOMATION_OUTCOME_DDL,
] as const;

export type SeoAutomationMigrationGateEvidence = {
  exactCurrentSchemaVerified: boolean;
  migrationIdempotentAndTested: boolean;
  productionBackupCompletedAndVerified: boolean;
  restoreProcedureDocumentedAndCredible: boolean;
  writerFreezeEnforceableAcrossWorkers: boolean;
  oldWorkersPositivelyFenced: boolean;
  rollbackAndRecoveryCredible: boolean;
  noProtectedDataLoss: boolean;
  hostingerResourceConstraintsRespected: boolean;
  noConflictingDeploymentOrWorker: boolean;
};

export const SEO_AUTOMATION_MIGRATION_GATES_DEFAULT: SeoAutomationMigrationGateEvidence = {
  exactCurrentSchemaVerified: false,
  migrationIdempotentAndTested: true,
  productionBackupCompletedAndVerified: false,
  restoreProcedureDocumentedAndCredible: false,
  writerFreezeEnforceableAcrossWorkers: false,
  oldWorkersPositivelyFenced: false,
  rollbackAndRecoveryCredible: false,
  noProtectedDataLoss: true,
  hostingerResourceConstraintsRespected: true,
  noConflictingDeploymentOrWorker: false,
};

export type SeoAutomationMigrationPlan = {
  spec: typeof SEO_AUTOMATION_MIGRATION_ARTIFACT_SPEC;
  registeredWithEnsure: false;
  liveSchemaVersion: number;
  mustPreserveLiveSchemaVersion: typeof A2_APPLY_DURABLE_MUST_PRESERVE_LIVE_SCHEMA_VERSION;
  targetSlot: typeof A2_APPLY_DURABLE_TARGET_SCHEMA_SLOT;
  ddlStatementCount: number;
  executeAuthorized: false;
  blockers: string[];
};

/**
 * Build a non-executing migration plan. executeAuthorized is always false here.
 */
export function planSeoAutomationDurableMigration(
  gates: SeoAutomationMigrationGateEvidence = SEO_AUTOMATION_MIGRATION_GATES_DEFAULT,
): SeoAutomationMigrationPlan {
  const blockers: string[] = [];
  if (Boolean(A2_APPLY_DURABLE_SCHEMA_REGISTERED_WITH_ENSURE)) {
    blockers.push("unexpected_registered_with_ensure");
  }
  if (CURRENT_CMS_SCHEMA_VERSION !== A2_APPLY_DURABLE_MUST_PRESERVE_LIVE_SCHEMA_VERSION) {
    blockers.push(
      `live_schema_version_mismatch:code=${CURRENT_CMS_SCHEMA_VERSION}:must=${A2_APPLY_DURABLE_MUST_PRESERVE_LIVE_SCHEMA_VERSION}`,
    );
  }
  for (const [key, value] of Object.entries(gates) as [
    keyof SeoAutomationMigrationGateEvidence,
    boolean,
  ][]) {
    if (!value && key !== "migrationIdempotentAndTested" && key !== "noProtectedDataLoss" && key !== "hostingerResourceConstraintsRespected") {
      blockers.push(`gate:${key}`);
    }
  }
  // Old-worker fencing is the hard Hostinger blocker when writers would activate.
  if (!gates.oldWorkersPositivelyFenced) {
    if (!blockers.includes("gate:oldWorkersPositivelyFenced")) {
      blockers.push("gate:oldWorkersPositivelyFenced");
    }
  }

  return {
    spec: SEO_AUTOMATION_MIGRATION_ARTIFACT_SPEC,
    registeredWithEnsure: false,
    liveSchemaVersion: CURRENT_CMS_SCHEMA_VERSION,
    mustPreserveLiveSchemaVersion: A2_APPLY_DURABLE_MUST_PRESERVE_LIVE_SCHEMA_VERSION,
    targetSlot: A2_APPLY_DURABLE_TARGET_SCHEMA_SLOT,
    ddlStatementCount: SEO_AUTOMATION_EXTENDED_DDL_STATEMENTS.length,
    executeAuthorized: false,
    blockers,
  };
}

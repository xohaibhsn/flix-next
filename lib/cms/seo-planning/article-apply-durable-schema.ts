/**
 * A2 durable Apply storage — NON-EXECUTING schema contract only.
 *
 * DEPLOYMENT STATUS: BLOCKED / UNREGISTERED
 *
 * - Live CMS schema remains v6 (CURRENT_CMS_SCHEMA_VERSION).
 * - These DDL strings must NOT be appended to CMS_SCHEMA_STATEMENTS.
 * - Must NOT bump CURRENT_CMS_SCHEMA_VERSION.
 * - Must NOT run via ensureCmsSchema / mysql-migrate from this module.
 * - Numeric schema slot is intentionally unallocated (A2 must not claim v7).
 *
 * L4B note: seo_planning_decision_links is separately proposed under
 * PROVISIONAL_V7_POST_CONCURRENCY_V6 and also unregistered. A2 tables are
 * additive and name-disjoint; coexistence is feasible under a future
 * Berlin-approved coordinated or ordered additive migration. FK parents
 * (seo_planning_drafts, blog_posts, admin_users) already exist on v6.
 */

import { GENERATED_ARTICLE_HTML_MAX_CHARS } from "@/lib/cms/ai-seo/config";

/** Live schema version this contract must preserve until Berlin allocates a slot. */
export const A2_APPLY_DURABLE_MUST_PRESERVE_LIVE_SCHEMA_VERSION = 6 as const;

/**
 * Documented future slot label only — NOT authorized, NOT numeric, NOT v7.
 * A2 must not independently allocate PROVISIONAL_V7 (reserved L4B discussion).
 */
export const A2_APPLY_DURABLE_TARGET_SCHEMA_SLOT =
  "PROVISIONAL_A2_APPLY_DURABLE_UNALLOCATED" as const;

/** True when DDL is intentionally disconnected from live schema ensure. */
export const A2_APPLY_DURABLE_SCHEMA_REGISTERED_WITH_ENSURE = false as const;

export const A2_APPLY_PREVIEW_TABLE = "seo_ai_article_previews" as const;
export const A2_APPLY_APPROVAL_TABLE = "seo_ai_article_approvals" as const;
export const A2_APPLY_AUDIT_TABLE = "seo_ai_article_apply_audits" as const;

/** Bounded canonical article HTML storage (matches generation caps). */
export const A2_APPLY_PREVIEW_HTML_MAX_CHARS = GENERATED_ARTICLE_HTML_MAX_CHARS;

/**
 * Server-owned immutable preview provenance (authoritative article source).
 * Client HTML is never provenance proof — resolve by preview_session_id.
 */
export const A2_APPLY_PREVIEW_DDL = `
CREATE TABLE IF NOT EXISTS seo_ai_article_previews (
  preview_session_id VARCHAR(80) NOT NULL,
  planning_draft_id VARCHAR(80) NOT NULL,
  planning_updated_at DATETIME NOT NULL,
  writing_fingerprint VARCHAR(128) NOT NULL,
  content_fingerprint CHAR(64) NOT NULL,
  generation_id VARCHAR(80) NOT NULL,
  model VARCHAR(120) NOT NULL,
  title VARCHAR(160) NOT NULL,
  excerpt VARCHAR(400) NOT NULL,
  html MEDIUMTEXT NOT NULL,
  created_at DATETIME NOT NULL,
  expires_at DATETIME NULL,
  invalidated TINYINT(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (preview_session_id),
  KEY seo_ai_article_previews_planning (planning_draft_id),
  KEY seo_ai_article_previews_generation (generation_id),
  CONSTRAINT seo_ai_article_previews_planning_fk
    FOREIGN KEY (planning_draft_id) REFERENCES seo_planning_drafts(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`.trim();

/**
 * Trusted human approval receipt — server-issued, not client checkbox.
 * Bound to exact preview session + content fingerprint + Planning identity.
 */
export const A2_APPLY_APPROVAL_DDL = `
CREATE TABLE IF NOT EXISTS seo_ai_article_approvals (
  receipt_id VARCHAR(80) NOT NULL,
  preview_session_id VARCHAR(80) NOT NULL,
  planning_draft_id VARCHAR(80) NOT NULL,
  planning_updated_at DATETIME NOT NULL,
  writing_fingerprint VARCHAR(128) NOT NULL,
  content_fingerprint CHAR(64) NOT NULL,
  approved_by_admin_id VARCHAR(80) NOT NULL,
  factual_review_confirmed TINYINT(1) NOT NULL,
  approved_at DATETIME NOT NULL,
  expires_at DATETIME NULL,
  revoked TINYINT(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (receipt_id),
  KEY seo_ai_article_approvals_preview (preview_session_id),
  KEY seo_ai_article_approvals_planning (planning_draft_id),
  KEY seo_ai_article_approvals_admin (approved_by_admin_id),
  CONSTRAINT seo_ai_article_approvals_preview_fk
    FOREIGN KEY (preview_session_id) REFERENCES seo_ai_article_previews(preview_session_id) ON DELETE RESTRICT,
  CONSTRAINT seo_ai_article_approvals_planning_fk
    FOREIGN KEY (planning_draft_id) REFERENCES seo_planning_drafts(id) ON DELETE RESTRICT,
  CONSTRAINT seo_ai_article_approvals_admin_fk
    FOREIGN KEY (approved_by_admin_id) REFERENCES admin_users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`.trim();

/**
 * Same-commit Apply audit. Unique operation key enforces durable idempotency.
 * post_id nullable for blocked attempts recorded without Blog mutation.
 */
export const A2_APPLY_AUDIT_DDL = `
CREATE TABLE IF NOT EXISTS seo_ai_article_apply_audits (
  apply_operation_key VARCHAR(120) NOT NULL,
  planning_draft_id VARCHAR(80) NOT NULL,
  post_id VARCHAR(80) NULL,
  preview_session_id VARCHAR(80) NOT NULL,
  approval_receipt_id VARCHAR(80) NOT NULL,
  generation_id VARCHAR(80) NOT NULL,
  admin_id VARCHAR(80) NOT NULL,
  writing_fingerprint VARCHAR(128) NOT NULL,
  content_fingerprint CHAR(64) NOT NULL,
  outcome VARCHAR(24) NOT NULL,
  result_code VARCHAR(64) NULL,
  detail VARCHAR(200) NOT NULL DEFAULT '',
  publication_ready TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL,
  PRIMARY KEY (apply_operation_key),
  KEY seo_ai_article_apply_audits_planning (planning_draft_id),
  KEY seo_ai_article_apply_audits_post (post_id),
  KEY seo_ai_article_apply_audits_preview (preview_session_id),
  CONSTRAINT seo_ai_article_apply_audits_planning_fk
    FOREIGN KEY (planning_draft_id) REFERENCES seo_planning_drafts(id) ON DELETE RESTRICT,
  CONSTRAINT seo_ai_article_apply_audits_preview_fk
    FOREIGN KEY (preview_session_id) REFERENCES seo_ai_article_previews(preview_session_id) ON DELETE RESTRICT,
  CONSTRAINT seo_ai_article_apply_audits_approval_fk
    FOREIGN KEY (approval_receipt_id) REFERENCES seo_ai_article_approvals(receipt_id) ON DELETE RESTRICT,
  CONSTRAINT seo_ai_article_apply_audits_post_fk
    FOREIGN KEY (post_id) REFERENCES blog_posts(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`.trim();

/** Ordered DDL list for a future approved additive migration (not executed here). */
export const A2_APPLY_DURABLE_DDL_STATEMENTS = [
  A2_APPLY_PREVIEW_DDL,
  A2_APPLY_APPROVAL_DDL,
  A2_APPLY_AUDIT_DDL,
] as const;

export type A2ApplyDurableL4bCompatibility = {
  liveSchemaVersionMustRemain: typeof A2_APPLY_DURABLE_MUST_PRESERVE_LIVE_SCHEMA_VERSION;
  a2SlotAllocated: false;
  l4bProvisionalSlotLabel: "PROVISIONAL_V7_POST_CONCURRENCY_V6";
  tablesCoexistWithL4bDecisionLinks: true;
  recommendedFkCreationOrder: readonly string[];
  migrationStrategy: "coordinated_or_ordered_additive_after_berlin_allocation";
  workerCutoverStillRequired: true;
  schemaRegisteredWithEnsure: typeof A2_APPLY_DURABLE_SCHEMA_REGISTERED_WITH_ENSURE;
};

/**
 * Concise L4B coexistence statement for Berlin/Professor — no version allocation.
 */
export function describeA2ApplyDurableL4bCompatibility(): A2ApplyDurableL4bCompatibility {
  return {
    liveSchemaVersionMustRemain: A2_APPLY_DURABLE_MUST_PRESERVE_LIVE_SCHEMA_VERSION,
    a2SlotAllocated: false,
    l4bProvisionalSlotLabel: "PROVISIONAL_V7_POST_CONCURRENCY_V6",
    tablesCoexistWithL4bDecisionLinks: true,
    recommendedFkCreationOrder: [
      "seo_planning_drafts / blog_posts / admin_users (already v6)",
      "seo_ai_article_previews",
      "seo_ai_article_approvals",
      "seo_ai_article_apply_audits",
      "seo_planning_decision_links (L4B; independent parents; order flexible vs A2)",
    ],
    migrationStrategy: "coordinated_or_ordered_additive_after_berlin_allocation",
    workerCutoverStillRequired: true,
    schemaRegisteredWithEnsure: A2_APPLY_DURABLE_SCHEMA_REGISTERED_WITH_ENSURE,
  };
}

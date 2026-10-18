/**
 * L4B — Isolated Planning ↔ Ledger decision lineage DDL.
 *
 * DEPLOYMENT STATUS: BLOCKED / NON-EXECUTING
 *
 * - Production CMS schema is now v6 (pages.content_revision CAS) — RELEASED.
 * - This DDL must NOT be appended to CMS_SCHEMA_STATEMENTS and must NOT bump
 *   CURRENT_CMS_SCHEMA_VERSION (would allocate an unauthorized next slot).
 * - Proposed next slot is PROVISIONAL_V7 (not formally allocated or approved).
 *
 * Do not call ensureCmsSchemaCurrent / mysql-migrate from this module.
 * Do not execute against production from this task.
 */

/** Documented future slot — not equal to CURRENT_CMS_SCHEMA_VERSION (6). */
export const L4B_PLANNING_LINEAGE_TARGET_SCHEMA_SLOT = "PROVISIONAL_V7_POST_CONCURRENCY_V6" as const;

/**
 * Numeric hint only — NOT authorized. Berlin must formally allocate before
 * any bump of CURRENT_CMS_SCHEMA_VERSION or ensure registration.
 */
export const L4B_PLANNING_LINEAGE_PROPOSED_NUMERIC_SLOT = 7 as const;

export const SEO_PLANNING_DECISION_LINKS_TABLE = "seo_planning_decision_links" as const;

/**
 * Additive CREATE TABLE for seo_planning_decision_links.
 * Not registered with the live schema ensure path.
 *
 * Contract:
 * - 1:1 Planning draft ↔ Ledger decision (UNIQUE on each side)
 * - Authoritative parents: seo_planning_drafts.id, seo_opportunity_decisions.id
 * - ON DELETE RESTRICT (no cascade, no silent unlink)
 * - Idempotent CREATE TABLE IF NOT EXISTS
 * - InnoDB for FK enforcement
 */
export const SEO_PLANNING_DECISION_LINKS_DDL = `
CREATE TABLE IF NOT EXISTS seo_planning_decision_links (
  id VARCHAR(80) NOT NULL,
  planning_draft_id VARCHAR(80) NOT NULL,
  decision_id VARCHAR(80) NOT NULL,
  linked_by_admin_id VARCHAR(80) NOT NULL,
  linked_at DATETIME NOT NULL,
  selection_marker VARCHAR(40) NOT NULL DEFAULT 'server_research_binding',
  PRIMARY KEY (id),
  UNIQUE KEY seo_planning_decision_links_draft_unique (planning_draft_id),
  UNIQUE KEY seo_planning_decision_links_decision_unique (decision_id),
  KEY seo_planning_decision_links_linked_at (linked_at),
  CONSTRAINT seo_planning_decision_links_draft_fk
    FOREIGN KEY (planning_draft_id) REFERENCES seo_planning_drafts(id) ON DELETE RESTRICT,
  CONSTRAINT seo_planning_decision_links_decision_fk
    FOREIGN KEY (decision_id) REFERENCES seo_opportunity_decisions(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`.trim();

/** True when DDL is intentionally disconnected from live schema ensure. */
export const L4B_PLANNING_LINEAGE_DDL_REGISTERED_WITH_ENSURE = false as const;

/**
 * Live schema version this candidate must preserve (production v6).
 * Lineage must not bump this until Berlin allocates PROVISIONAL_V7.
 */
export const L4B_LIVE_SCHEMA_VERSION_MUST_REMAIN = 6 as const;

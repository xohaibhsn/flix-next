/**
 * L4B Planning write-fence DDL package — source-controlled, NON-EXECUTED in production.
 *
 * DEPLOYMENT STATUS: BLOCKED / NON-EXECUTING
 * - Must NOT register with CMS schema ensure.
 * - Must NOT bump CURRENT_CMS_SCHEMA_VERSION (remains 6).
 * - Local disposable validation may apply this DDL only on flix_l4b_fence_bridge_rc.
 *
 * Security limitation: session marker (@flix_l4b_planning_auth) is an application-
 * compatibility signal for rejecting unmodified legacy writers under an armed fence.
 * It is NOT an independent identity against a shared-principal or SQL-capable attacker.
 */

import { L4B_LIVE_SCHEMA_VERSION_MUST_REMAIN } from "@/lib/cms/seo-planning-lineage/schema-ddl";
import {
  L4B_FENCE_ERROR_CODES,
  L4B_FENCE_TRIGGER_DELETE,
  L4B_FENCE_TRIGGER_INSERT,
  L4B_PLANNING_AUTH_SESSION_VAR,
  SEO_PLANNING_WRITE_FENCE_TABLE,
} from "@/lib/cms/seo-planning-lineage/planning-write-fence-codes";

export const L4B_PLANNING_WRITE_FENCE_DDL_VERSION = "l4b-fence-ddl-v1" as const;

/** Must remain false — fence DDL is disconnected from ensureCmsSchemaCurrent. */
export const L4B_PLANNING_WRITE_FENCE_DDL_REGISTERED_WITH_ENSURE = false as const;

/** Re-export inert constants (canonical home: planning-write-fence-codes.ts). */
export {
  L4B_FENCE_ERROR_CODES,
  L4B_FENCE_TRIGGER_DELETE,
  L4B_FENCE_TRIGGER_INSERT,
  L4B_PLANNING_AUTH_SESSION_VAR,
  SEO_PLANNING_WRITE_FENCE_TABLE,
};

/** Preserve live CMS schema marker. */
void L4B_LIVE_SCHEMA_VERSION_MUST_REMAIN;

/**
 * Control table: single-row fence state.
 * id MUST be 1. Missing row ⇒ fail-closed after triggers are installed.
 */
export const SEO_PLANNING_WRITE_FENCE_TABLE_DDL = `
CREATE TABLE IF NOT EXISTS seo_planning_write_fence (
  id TINYINT NOT NULL,
  fence_active TINYINT NOT NULL DEFAULT 0,
  expected_token VARBINARY(64) NOT NULL,
  armed_at DATETIME NULL,
  armed_by VARCHAR(80) NULL,
  note VARCHAR(200) NULL,
  PRIMARY KEY (id),
  CONSTRAINT seo_planning_write_fence_id_one CHECK (id = 1),
  CONSTRAINT seo_planning_write_fence_active_bool CHECK (fence_active IN (0, 1))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`.trim();

/**
 * Seed inactive fence row. Token is application-configured (not a secret identity).
 * Callers must supply the token via parameterized INSERT outside this string.
 */
export const SEO_PLANNING_WRITE_FENCE_SEED_SQL = `
INSERT INTO seo_planning_write_fence (id, fence_active, expected_token, armed_at, armed_by, note)
VALUES (1, 0, ?, NULL, NULL, 'l4b-fence-bridge-inactive')
ON DUPLICATE KEY UPDATE id = id
`.trim();

/**
 * BEFORE INSERT — locks control row (FOR UPDATE) so arming cannot complete while
 * an incompatible INSERT transaction remains open, and rejects unmarked inserts
 * when fence_active = 1.
 *
 * Privilege: TRIGGER privilege on schema (or SUPER / SYSTEM_VARIABLE_ADMIN not required).
 * Definer: current user at CREATE TRIGGER time on disposable; production TBD under approval.
 */
export const SEO_PLANNING_WRITE_FENCE_INSERT_TRIGGER_SQL = `
CREATE TRIGGER trg_l4b_fence_planning_ins
BEFORE INSERT ON seo_planning_drafts
FOR EACH ROW
BEGIN
  DECLARE v_found INT DEFAULT 0;
  DECLARE v_active TINYINT DEFAULT 0;
  DECLARE v_token VARBINARY(64) DEFAULT NULL;

  SELECT COUNT(*) INTO v_found
  FROM seo_planning_write_fence WHERE id = 1;

  IF v_found = 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'PLANNING_FENCE_METADATA_MISSING';
  END IF;

  SELECT fence_active, expected_token
    INTO v_active, v_token
  FROM seo_planning_write_fence
  WHERE id = 1
  FOR UPDATE;

  IF v_token IS NULL OR LENGTH(v_token) = 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'PLANNING_FENCE_METADATA_MISSING';
  END IF;

  IF v_active = 1 THEN
    IF @flix_l4b_planning_auth IS NULL
       OR CONVERT(@flix_l4b_planning_auth USING utf8mb4) COLLATE utf8mb4_bin
          <> CONVERT(v_token USING utf8mb4) COLLATE utf8mb4_bin THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'PLANNING_WRITE_FENCED';
    END IF;
  END IF;
END
`.trim();

/**
 * BEFORE DELETE — same lock + auth semantics as INSERT.
 * FK RESTRICT on lineage links remains the final integrity guard for linked drafts.
 */
export const SEO_PLANNING_WRITE_FENCE_DELETE_TRIGGER_SQL = `
CREATE TRIGGER trg_l4b_fence_planning_del
BEFORE DELETE ON seo_planning_drafts
FOR EACH ROW
BEGIN
  DECLARE v_found INT DEFAULT 0;
  DECLARE v_active TINYINT DEFAULT 0;
  DECLARE v_token VARBINARY(64) DEFAULT NULL;

  SELECT COUNT(*) INTO v_found
  FROM seo_planning_write_fence WHERE id = 1;

  IF v_found = 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'PLANNING_FENCE_METADATA_MISSING';
  END IF;

  SELECT fence_active, expected_token
    INTO v_active, v_token
  FROM seo_planning_write_fence
  WHERE id = 1
  FOR UPDATE;

  IF v_token IS NULL OR LENGTH(v_token) = 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'PLANNING_FENCE_METADATA_MISSING';
  END IF;

  IF v_active = 1 THEN
    IF @flix_l4b_planning_auth IS NULL
       OR CONVERT(@flix_l4b_planning_auth USING utf8mb4) COLLATE utf8mb4_bin
          <> CONVERT(v_token USING utf8mb4) COLLATE utf8mb4_bin THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'PLANNING_DELETE_FENCED';
    END IF;
  END IF;
END
`.trim();

/**
 * UPDATE protection: intentionally NOT installed by default.
 * Real CMS Planning paths (archive, payload edit, linked_post_id) must remain
 * usable for mixed-version workers after INSERT fencing. Lineage is not created
 * by UPDATE. Revisit only if a tested race shows UPDATE can cross the arming
 * boundary in a way INSERT locking does not cover.
 */
export const SEO_PLANNING_WRITE_FENCE_UPDATE_TRIGGER_SQL_OPTIONAL = `
-- OPTIONAL / NOT INSTALLED BY DEFAULT
-- CREATE TRIGGER trg_l4b_fence_planning_upd ...
`.trim();

export const SEO_PLANNING_WRITE_FENCE_DROP_TRIGGERS_SQL = `
DROP TRIGGER IF EXISTS trg_l4b_fence_planning_ins;
DROP TRIGGER IF EXISTS trg_l4b_fence_planning_del;
DROP TRIGGER IF EXISTS trg_l4b_fence_planning_upd;
`.trim();

export const L4B_PLANNING_WRITE_FENCE_PRIVILEGE_EXPECTATIONS = [
  "CREATE/ALTER/DROP TRIGGER on target schema (or equivalent)",
  "SELECT/INSERT/UPDATE/DELETE on seo_planning_write_fence and seo_planning_drafts",
  "Application principal may SET user variables on its own session",
  "TRIGGER privilege alone does not prove Hostinger production executability — separate validation required",
] as const;

export const L4B_PLANNING_WRITE_FENCE_INSTALL_SEQUENCE = [
  "1. Dedicated backup of production schema (separate approval)",
  "2. Verify physical lineage table READY and writers still OFF",
  "3. CREATE TABLE seo_planning_write_fence (inactive seed)",
  "4. CREATE INSERT + DELETE triggers",
  "5. Verify fail-closed missing-metadata and inactive legacy INSERT",
  "6. Arm via exclusive control-row transaction (see planning-write-fence-arm)",
  "7. Verify legacy INSERT rejected; authorized transactional path succeeds",
  "8. Do NOT flip application writer constants in the same change as DDL",
] as const;

export const L4B_PLANNING_WRITE_FENCE_ROLLBACK_SEQUENCE = [
  "Before any lineage writes under fence: DROP triggers, optionally DROP control table",
  "After lineage writes exist: DROP triggers does not remove links; app rollback ≠ DB restore",
  "Emergency OFF: UPDATE fence_active=0 under exclusive lock (permits legacy INSERT again)",
  "Full restore requires backup restore — not application writers-OFF alone",
] as const;

export function describePlanningWriteFenceDdlPackage(): {
  version: typeof L4B_PLANNING_WRITE_FENCE_DDL_VERSION;
  registeredWithEnsure: false;
  liveSchemaMustRemain: typeof L4B_LIVE_SCHEMA_VERSION_MUST_REMAIN;
  objects: string[];
  updateTriggerInstalledByDefault: false;
  securityLimitation: string;
} {
  return {
    version: L4B_PLANNING_WRITE_FENCE_DDL_VERSION,
    registeredWithEnsure: false,
    liveSchemaMustRemain: L4B_LIVE_SCHEMA_VERSION_MUST_REMAIN,
    objects: [
      SEO_PLANNING_WRITE_FENCE_TABLE,
      L4B_FENCE_TRIGGER_INSERT,
      L4B_FENCE_TRIGGER_DELETE,
    ],
    updateTriggerInstalledByDefault: false,
    securityLimitation:
      "Session marker rejects incompatible legacy application writers under an armed fence; " +
      "not a defense against shared DB principal, SQL injection, or arbitrary SQL forgery.",
  };
}

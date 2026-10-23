/**
 * A2 durable Apply schema readiness — LOCAL / OFFLINE probe only.
 *
 * Never runs DDL, never calls ensureCmsSchema, never bumps CMS schema version.
 * Reports whether a future Berlin-approved migration would still be required
 * before production Apply can leave fail-closed mode.
 */

import { CURRENT_CMS_SCHEMA_VERSION } from "@/lib/db/schema";
import {
  A2_APPLY_APPROVAL_TABLE,
  A2_APPLY_AUDIT_TABLE,
  A2_APPLY_DURABLE_DDL_STATEMENTS,
  A2_APPLY_DURABLE_MUST_PRESERVE_LIVE_SCHEMA_VERSION,
  A2_APPLY_DURABLE_SCHEMA_REGISTERED_WITH_ENSURE,
  A2_APPLY_DURABLE_TARGET_SCHEMA_SLOT,
  A2_APPLY_PREVIEW_TABLE,
  describeA2ApplyDurableL4bCompatibility,
} from "@/lib/cms/seo-planning/article-apply-durable-schema";

export const A2_APPLY_SCHEMA_READINESS_SPEC = "a2-apply-schema-readiness-v1" as const;

export const A2_APPLY_SCHEMA_NOT_READY_CODE = "durable_schema_unregistered" as const;

export const A2_APPLY_SCHEMA_NOT_READY_MESSAGE =
  "Durable A2 Apply tables are not registered with live CMS schema ensure. Apply remains fail-closed until Berlin allocates and migrates the additive A2 slot.";

export type A2ApplySchemaReadinessResult =
  | {
      ok: true;
      spec: typeof A2_APPLY_SCHEMA_READINESS_SPEC;
      registeredWithEnsure: true;
      liveSchemaVersion: number;
      requiredTables: readonly string[];
    }
  | {
      ok: false;
      spec: typeof A2_APPLY_SCHEMA_READINESS_SPEC;
      code: typeof A2_APPLY_SCHEMA_NOT_READY_CODE;
      error: string;
      registeredWithEnsure: false;
      liveSchemaVersion: number;
      mustPreserveLiveSchemaVersion: typeof A2_APPLY_DURABLE_MUST_PRESERVE_LIVE_SCHEMA_VERSION;
      targetSlot: typeof A2_APPLY_DURABLE_TARGET_SCHEMA_SLOT;
      requiredTables: readonly string[];
      ddlStatementCount: number;
      workerCutoverStillRequired: true;
      l4bCompatibility: ReturnType<typeof describeA2ApplyDurableL4bCompatibility>;
    };

/**
 * Deterministic readiness probe. Does not inspect a live database.
 * Physical table presence is a separate future Hostinger migration gate.
 */
export function evaluateA2ApplyDurableSchemaReadiness(): A2ApplySchemaReadinessResult {
  const requiredTables = [
    A2_APPLY_PREVIEW_TABLE,
    A2_APPLY_APPROVAL_TABLE,
    A2_APPLY_AUDIT_TABLE,
  ] as const;

  // Const is currently `false as const`; coerce to boolean so a future flip stays type-safe.
  const registeredWithEnsure = Boolean(A2_APPLY_DURABLE_SCHEMA_REGISTERED_WITH_ENSURE);
  if (registeredWithEnsure) {
    return {
      ok: true,
      spec: A2_APPLY_SCHEMA_READINESS_SPEC,
      registeredWithEnsure: true,
      liveSchemaVersion: CURRENT_CMS_SCHEMA_VERSION,
      requiredTables,
    };
  }

  return {
    ok: false,
    spec: A2_APPLY_SCHEMA_READINESS_SPEC,
    code: A2_APPLY_SCHEMA_NOT_READY_CODE,
    error: A2_APPLY_SCHEMA_NOT_READY_MESSAGE,
    registeredWithEnsure: false,
    liveSchemaVersion: CURRENT_CMS_SCHEMA_VERSION,
    mustPreserveLiveSchemaVersion: A2_APPLY_DURABLE_MUST_PRESERVE_LIVE_SCHEMA_VERSION,
    targetSlot: A2_APPLY_DURABLE_TARGET_SCHEMA_SLOT,
    requiredTables,
    ddlStatementCount: A2_APPLY_DURABLE_DDL_STATEMENTS.length,
    workerCutoverStillRequired: true,
    l4bCompatibility: describeA2ApplyDurableL4bCompatibility(),
  };
}

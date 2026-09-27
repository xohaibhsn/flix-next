import { CMS_SCHEMA_VERSION_KEY } from "@/lib/cms/migration-flags";
import { CURRENT_CMS_SCHEMA_VERSION } from "@/lib/db/schema";

export { CMS_SCHEMA_VERSION_KEY, CURRENT_CMS_SCHEMA_VERSION };

export type SchemaVersionLookup = { status: "unavailable" } | { status: "found"; version: number | null };

export type SchemaEnsureDecision =
  | { action: "fast-path" }
  | {
      action: "full-ensure";
      /** When false, leave a newer DB marker untouched (rollback safety). */
      writeVersionAfterSuccess: boolean;
      reason: "unavailable" | "absent-or-malformed" | "older" | "newer-than-code";
    };

export type SchemaEnsureOutcome = "skipped" | "ensured";

/** Parse a stored site_settings value into a positive integer schema version, or null if unusable. */
export function parseStoredSchemaVersion(raw: unknown): number | null {
  if (raw == null) return null;
  const text = typeof raw === "string" || typeof raw === "number" ? String(raw).trim() : "";
  if (!/^\d+$/.test(text)) return null;
  const n = Number(text);
  if (!Number.isSafeInteger(n) || n < 1) return null;
  return n;
}

/**
 * Decide whether the expensive ensureCmsSchema pass can be skipped.
 * Fail-open: anything uncertain → full ensure.
 * Newer DB than code → full ensure for this release's contract, never write a downgrade.
 */
export function decideSchemaEnsureAction(
  lookup: SchemaVersionLookup,
  currentVersion: number = CURRENT_CMS_SCHEMA_VERSION,
): SchemaEnsureDecision {
  if (lookup.status === "unavailable") {
    return { action: "full-ensure", writeVersionAfterSuccess: true, reason: "unavailable" };
  }
  const version = lookup.version;
  if (version == null) {
    return { action: "full-ensure", writeVersionAfterSuccess: true, reason: "absent-or-malformed" };
  }
  if (version === currentVersion) {
    return { action: "fast-path" };
  }
  if (version < currentVersion) {
    return { action: "full-ensure", writeVersionAfterSuccess: true, reason: "older" };
  }
  return { action: "full-ensure", writeVersionAfterSuccess: false, reason: "newer-than-code" };
}

/** MySQL missing-table / missing-view errors only — not connection or permission failures. */
export function isMissingRelationError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = "code" in error ? String(error.code) : "";
  const errno = "errno" in error ? Number(error.errno) : 0;
  return code === "ER_NO_SUCH_TABLE" || errno === 1146;
}

/**
 * Authoritative schema gate used by production via mysql-migrate.ensureCmsSchemaCurrent.
 * Injectable for unit tests — does not import server-only / MySQL.
 */
export async function runSchemaVersionGate(deps: {
  currentVersion?: number;
  readLookup: () => Promise<SchemaVersionLookup>;
  ensureSchema: () => Promise<void>;
  writeVersion?: (version: number) => Promise<void>;
}): Promise<SchemaEnsureOutcome> {
  const currentVersion = deps.currentVersion ?? CURRENT_CMS_SCHEMA_VERSION;
  const decision = decideSchemaEnsureAction(await deps.readLookup(), currentVersion);
  if (decision.action === "fast-path") return "skipped";

  await deps.ensureSchema();
  if (decision.writeVersionAfterSuccess) {
    if (!deps.writeVersion) {
      throw new Error("writeVersion is required when recording a schema version marker.");
    }
    await deps.writeVersion(currentVersion);
  }
  return "ensured";
}

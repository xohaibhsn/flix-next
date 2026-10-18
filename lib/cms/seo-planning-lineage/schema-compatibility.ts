/**
 * L4B — Schema compatibility matrix (pure documentation + asserts).
 *
 * Does NOT activate DDL, bump CURRENT_CMS_SCHEMA_VERSION, or edit CMS_SCHEMA_STATEMENTS.
 * Production concurrency v6 is RELEASED. L4B lineage remains unregistered until Berlin
 * allocates PROVISIONAL_V7_POST_CONCURRENCY_V6 (numeric 7 is a proposal only).
 */

import {
  L4B_LIVE_SCHEMA_VERSION_MUST_REMAIN,
  L4B_PLANNING_LINEAGE_DDL_REGISTERED_WITH_ENSURE,
  L4B_PLANNING_LINEAGE_PROPOSED_NUMERIC_SLOT,
  L4B_PLANNING_LINEAGE_TARGET_SCHEMA_SLOT,
  SEO_PLANNING_DECISION_LINKS_DDL,
  SEO_PLANNING_DECISION_LINKS_TABLE,
} from "@/lib/cms/seo-planning-lineage/schema-ddl";

/** Active production baseline on this candidate (v6 released). */
export const L4B4_ACTIVE_SCHEMA_VERSION = L4B_LIVE_SCHEMA_VERSION_MUST_REMAIN;

/** Released concurrency schema version (no longer "unreleased"). */
export const L4B4_CONCURRENCY_RELEASED_SCHEMA_VERSION = 6 as const;

/** @deprecated Use L4B4_CONCURRENCY_RELEASED_SCHEMA_VERSION — retained for test aliases. */
export const L4B4_CONCURRENCY_UNRELEASED_SCHEMA_VERSION =
  L4B4_CONCURRENCY_RELEASED_SCHEMA_VERSION;

/** Provisional dependency label — not a numeric allocation. */
export const L4B4_LINEAGE_MIGRATION_DEPENDENCY = L4B_PLANNING_LINEAGE_TARGET_SCHEMA_SLOT;

export type L4B4CompatibilityRow = {
  surface: string;
  v6Released: string;
  l4bLineageDdl: string;
  verdict: "COMPATIBLE" | "BLOCKER" | "APPROVAL_REQUIRED" | "N/A";
  notes: string;
};

/**
 * Concise compatibility matrix for Berlin review (post-v6 production baseline).
 */
export const L4B4_SCHEMA_COMPATIBILITY_MATRIX: readonly L4B4CompatibilityRow[] = [
  {
    surface: "CURRENT_CMS_SCHEMA_VERSION",
    v6Released: "6 (released)",
    l4bLineageDdl: "must not bump; propose PROVISIONAL_V7 only",
    verdict: "APPROVAL_REQUIRED",
    notes:
      "v6 is production. Lineage requires a separately approved next slot (proposed 7). Do not register DDL until allocated.",
  },
  {
    surface: "pages.content_revision",
    v6Released: "INT NOT NULL DEFAULT 1",
    l4bLineageDdl: "no dependency",
    verdict: "COMPATIBLE",
    notes: "Page CAS revision only; does not alter Planning id/delete semantics.",
  },
  {
    surface: "seo_planning_drafts identity (id PK)",
    v6Released: "VARCHAR(80) PK",
    l4bLineageDdl: "FK → id ON DELETE RESTRICT",
    verdict: "COMPATIBLE",
    notes: "Planning row identity unchanged across v5/v6.",
  },
  {
    surface: "seo_planning_drafts archived_at / timestamps / fingerprint",
    v6Released: "present",
    l4bLineageDdl: "no column change",
    verdict: "COMPATIBLE",
    notes: "Archive + fingerprint uniqueness unchanged.",
  },
  {
    surface: "seo_opportunity_decisions identity",
    v6Released: "VARCHAR(80) PK",
    l4bLineageDdl: "FK → id ON DELETE RESTRICT",
    verdict: "COMPATIBLE",
    notes: "Ledger decision PK stable for lineage FK.",
  },
  {
    surface: "seo_planning_decision_links table",
    v6Released: "absent",
    l4bLineageDdl: "isolated CREATE TABLE",
    verdict: "APPROVAL_REQUIRED",
    notes: "Structurally additive; not registered with ensure path until Berlin allocates slot.",
  },
  {
    surface: "Planning permanent DELETE with active link",
    v6Released: "DELETE allowed today (legacy, unlinked)",
    l4bLineageDdl: "ON DELETE RESTRICT + L4B-5 DENY_LINKED policy",
    verdict: "COMPATIBLE",
    notes:
      "L4B-5 defines DENY_LINKED (no unlink/cascade). Live delete action still unwired. FK RESTRICT remains final DB guard.",
  },
  {
    surface: "CMS_SCHEMA_STATEMENTS registration",
    v6Released: "no lineage DDL",
    l4bLineageDdl: "L4B_PLANNING_LINEAGE_DDL_REGISTERED_WITH_ENSURE=false",
    verdict: "COMPATIBLE",
    notes: "Production ensure must remain disconnected until authorized migration.",
  },
] as const;

export const L4B4_RECOMMENDED_MIGRATION_ORDER = [
  "Preserve production schema v6 (pages.content_revision CAS) unchanged.",
  "Berlin allocates numeric next slot (proposed PROVISIONAL_V7 = 7) — do not assume allocation.",
  "Add seo_planning_decision_links via approved migration under that slot.",
  "Register DDL in CMS_SCHEMA_STATEMENTS only after slot allocation + migration approval.",
  "Activate L4B-5 linked permanent-delete policy in a locked transactional delete path (FK remains final guard).",
  "Only then wire Proceed→lineage MySQL adapter into an authorized server action (writes remain OFF until then).",
  "No historical backfill — existing Planning drafts stay UNLINKED.",
] as const;

/** L4B-5 — Pure migration readiness (no ensure, no version bump). */
export type L4B5MigrationReadiness = {
  dependency: typeof L4B4_LINEAGE_MIGRATION_DEPENDENCY;
  proposedNumericSlot: typeof L4B_PLANNING_LINEAGE_PROPOSED_NUMERIC_SLOT;
  numericVersionAuthorized: false;
  readyToRegisterWithEnsure: false;
  blockers: string[];
  parentTablesCompatible: boolean;
  deletePolicyDefined: boolean;
  liveDeleteWired: false;
};

export function assessL4bLineageMigrationReadiness(args: {
  currentCmsSchemaVersion: number;
  concurrencyReleasedSchemaVersion?: number;
  /** @deprecated alias for concurrencyReleasedSchemaVersion */
  concurrencyUnreleasedSchemaVersion?: number;
  ddlRegisteredWithEnsure: boolean;
  /** Observed presence of seo_planning_decision_links in a target DB (optional). */
  lineageTablePresent?: boolean;
  /** Whether live permanent-delete action queries lineage (must stay false until activation). */
  liveDeleteQueriesLineage?: boolean;
}): L4B5MigrationReadiness {
  const concurrencyReleased =
    args.concurrencyReleasedSchemaVersion ??
    args.concurrencyUnreleasedSchemaVersion ??
    L4B4_CONCURRENCY_RELEASED_SCHEMA_VERSION;

  const blockers: string[] = [];
  if (args.currentCmsSchemaVersion !== L4B4_ACTIVE_SCHEMA_VERSION) {
    blockers.push(
      `Active schema version is not the expected v${L4B4_ACTIVE_SCHEMA_VERSION} production baseline.`,
    );
  }
  if (concurrencyReleased !== L4B4_CONCURRENCY_RELEASED_SCHEMA_VERSION) {
    blockers.push("Concurrency released schema claim drifted from production v6.");
  }
  if (args.ddlRegisteredWithEnsure) {
    blockers.push("Lineage DDL must not be registered with CMS schema ensure yet.");
  }
  if (args.lineageTablePresent === true && args.ddlRegisteredWithEnsure) {
    blockers.push("Table presence must not imply ensure registration or version completion.");
  }
  if (args.liveDeleteQueriesLineage) {
    blockers.push("Live permanent-delete must not query lineage until authorized activation.");
  }
  blockers.push(
    `Numeric schema slot after concurrency v6 is not authorized (${L4B4_LINEAGE_MIGRATION_DEPENDENCY} / proposed ${L4B_PLANNING_LINEAGE_PROPOSED_NUMERIC_SLOT} only).`,
  );
  blockers.push("Production Proceed→Ledger lineage writes remain inactive.");

  return {
    dependency: L4B4_LINEAGE_MIGRATION_DEPENDENCY,
    proposedNumericSlot: L4B_PLANNING_LINEAGE_PROPOSED_NUMERIC_SLOT,
    numericVersionAuthorized: false,
    readyToRegisterWithEnsure: false,
    blockers,
    parentTablesCompatible: true,
    deletePolicyDefined: true,
    liveDeleteWired: false,
  };
}

/** Structural checks on isolated L4B DDL text (pure — no DB). */
export function inspectL4bLineageDdlReadiness(ddl: string): {
  ok: boolean;
  reasons: string[];
} {
  const reasons: string[] = [];
  if (!/CREATE TABLE IF NOT EXISTS seo_planning_decision_links/i.test(ddl)) {
    reasons.push("Missing idempotent CREATE TABLE IF NOT EXISTS for link table.");
  }
  if (!/REFERENCES seo_planning_drafts\(id\) ON DELETE RESTRICT/i.test(ddl)) {
    reasons.push("Planning FK ON DELETE RESTRICT missing or altered.");
  }
  if (!/REFERENCES seo_opportunity_decisions\(id\) ON DELETE RESTRICT/i.test(ddl)) {
    reasons.push("Decision FK ON DELETE RESTRICT missing or altered.");
  }
  if (/ON DELETE CASCADE/i.test(ddl)) {
    reasons.push("CASCADE is forbidden for lineage FKs.");
  }
  if (!/seo_planning_decision_links_draft_unique/i.test(ddl)) {
    reasons.push("Unique Planning constraint name missing.");
  }
  if (!/seo_planning_decision_links_decision_unique/i.test(ddl)) {
    reasons.push("Unique decision constraint name missing.");
  }
  if (!/ENGINE=InnoDB/i.test(ddl)) {
    reasons.push("InnoDB engine required for FK enforcement.");
  }
  return { ok: reasons.length === 0, reasons };
}

export function assertL4b4SchemaActivationBoundaries(args: {
  currentCmsSchemaVersion: number;
  ddlRegisteredWithEnsure: boolean;
  targetSlot: string;
  linksTable: string;
  linksDdl: string;
}): void {
  if (args.currentCmsSchemaVersion !== L4B4_ACTIVE_SCHEMA_VERSION) {
    throw new Error(
      `Active schema version drifted from L4B expected v${L4B4_ACTIVE_SCHEMA_VERSION}.`,
    );
  }
  if (args.ddlRegisteredWithEnsure !== false) {
    throw new Error("Lineage DDL must remain unregistered with schema ensure.");
  }
  if (args.targetSlot !== L4B4_LINEAGE_MIGRATION_DEPENDENCY) {
    throw new Error("Lineage migration dependency label drifted.");
  }
  if (args.linksTable !== SEO_PLANNING_DECISION_LINKS_TABLE) {
    throw new Error("Lineage table name drifted.");
  }
  if (!/ON DELETE RESTRICT/i.test(args.linksDdl)) {
    throw new Error("Lineage DDL must retain ON DELETE RESTRICT.");
  }
  if (/ON DELETE CASCADE/i.test(args.linksDdl)) {
    throw new Error("Lineage DDL must not use ON DELETE CASCADE.");
  }
  void L4B_PLANNING_LINEAGE_DDL_REGISTERED_WITH_ENSURE;
  void SEO_PLANNING_DECISION_LINKS_DDL;
}

/**
 * L4B activation-RC — Read-only physical readiness contract for seo_planning_decision_links.
 *
 * Separates physical table verification from CMS schema marker (v6) and from
 * L4B_PLANNING_LINEAGE_DDL_REGISTERED_WITH_ENSURE (must remain false).
 *
 * - Never creates/alters/repairs schema.
 * - Never runs on import, build, render, or OFF facade calls.
 * - Callers must inject metadata readers; no production DB access from this module.
 * - A one-time READY result does not permanently authorize writers — revalidate at activation.
 */

import {
  SEO_PLANNING_DECISION_LINKS_TABLE,
  L4B_PLANNING_LINEAGE_DDL_REGISTERED_WITH_ENSURE,
  L4B_LIVE_SCHEMA_VERSION_MUST_REMAIN,
} from "@/lib/cms/seo-planning-lineage/schema-ddl";
import { CURRENT_CMS_SCHEMA_VERSION } from "@/lib/db/schema";

export const L4B_PHYSICAL_SCHEMA_READINESS_VERSION = "l4b-physical-readiness-v1" as const;

export const LINEAGE_PHYSICAL_READINESS_STATUSES = [
  "READY",
  "MISSING",
  "MISMATCH",
  "UNKNOWN",
] as const;

export type LineagePhysicalReadinessStatus =
  (typeof LINEAGE_PHYSICAL_READINESS_STATUSES)[number];

/** Allowlisted expected physical contract derived from SEO_PLANNING_DECISION_LINKS_DDL. */
export const LINEAGE_PHYSICAL_SCHEMA_EXPECTATIONS = {
  tableName: SEO_PLANNING_DECISION_LINKS_TABLE,
  engine: "InnoDB",
  collation: "utf8mb4_unicode_ci",
  primaryKeyColumn: "id",
  columns: [
    { name: "id", dataType: "varchar", nullable: false },
    { name: "planning_draft_id", dataType: "varchar", nullable: false },
    { name: "decision_id", dataType: "varchar", nullable: false },
    { name: "linked_by_admin_id", dataType: "varchar", nullable: false },
    { name: "linked_at", dataType: "datetime", nullable: false },
    { name: "selection_marker", dataType: "varchar", nullable: false },
  ],
  uniqueColumns: ["planning_draft_id", "decision_id"] as const,
  supportingIndexColumn: "linked_at",
  foreignKeys: [
    {
      column: "planning_draft_id",
      referencedTable: "seo_planning_drafts",
      referencedColumn: "id",
      deleteRule: "RESTRICT",
    },
    {
      column: "decision_id",
      referencedTable: "seo_opportunity_decisions",
      referencedColumn: "id",
      deleteRule: "RESTRICT",
    },
  ],
} as const;

export type LineageTableMetadata = {
  tableName: string;
  engine: string;
  tableCollation: string;
};

export type LineageColumnMetadata = {
  columnName: string;
  dataType: string;
  isNullable: "YES" | "NO" | string;
  columnKey?: string;
};

export type LineageIndexMetadata = {
  indexName: string;
  nonUnique: number | boolean;
  columnName: string;
  seqInIndex: number;
};

export type LineageForeignKeyMetadata = {
  constraintName: string;
  columnName: string;
  referencedTableName: string;
  referencedColumnName: string;
  deleteRule: string;
};

/**
 * Injected read-only metadata surface. Implementations must use allowlisted
 * INFORMATION_SCHEMA queries with bound parameters — never string-concatenated
 * untrusted identifiers.
 */
export type LineagePhysicalSchemaMetadataReader = {
  /** Trusted connection's current schema identity (DATABASE()). */
  getConnectedSchemaName: () => Promise<string | null>;
  /** Expected production/target database name for identity comparison. */
  getExpectedSchemaName: () => Promise<string | null>;
  getTable: () => Promise<LineageTableMetadata | null>;
  listColumns: () => Promise<LineageColumnMetadata[]>;
  listIndexes: () => Promise<LineageIndexMetadata[]>;
  listForeignKeys: () => Promise<LineageForeignKeyMetadata[]>;
};

export type LineagePhysicalReadinessResult = {
  status: LineagePhysicalReadinessStatus;
  tableName: typeof SEO_PLANNING_DECISION_LINKS_TABLE;
  schemaName: string | null;
  expectedSchemaName: string | null;
  mismatches: string[];
  /** Marker/DDL registration are informational — not readiness substitutes. */
  cmsSchemaMarker: number;
  ddlRegisteredWithEnsure: false;
  mayAuthorizeWriters: boolean;
  oneTimeProbeIsPermanentAuthorization: false;
};

function norm(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

function deleteRuleOk(rule: string): boolean {
  const r = norm(rule);
  return r === "restrict" || r === "no action";
}

/**
 * Evaluate injected metadata against the allowlisted lineage table contract.
 * Fail closed for every status except READY.
 */
export async function assessLineagePhysicalSchemaReadiness(
  reader: LineagePhysicalSchemaMetadataReader,
): Promise<LineagePhysicalReadinessResult> {
  void L4B_PLANNING_LINEAGE_DDL_REGISTERED_WITH_ENSURE;
  void L4B_LIVE_SCHEMA_VERSION_MUST_REMAIN;

  const base = {
    tableName: SEO_PLANNING_DECISION_LINKS_TABLE,
    cmsSchemaMarker: CURRENT_CMS_SCHEMA_VERSION,
    ddlRegisteredWithEnsure: false as const,
    oneTimeProbeIsPermanentAuthorization: false as const,
  };

  let schemaName: string | null = null;
  let expectedSchemaName: string | null = null;

  try {
    schemaName = (await reader.getConnectedSchemaName())?.trim() || null;
    expectedSchemaName = (await reader.getExpectedSchemaName())?.trim() || null;
  } catch {
    return {
      ...base,
      status: "UNKNOWN",
      schemaName: null,
      expectedSchemaName: null,
      mismatches: ["Metadata reader failed while resolving database identity."],
      mayAuthorizeWriters: false,
    };
  }

  if (!schemaName || !expectedSchemaName) {
    return {
      ...base,
      status: "UNKNOWN",
      schemaName,
      expectedSchemaName,
      mismatches: ["Connected or expected database identity is unavailable."],
      mayAuthorizeWriters: false,
    };
  }

  if (norm(schemaName) !== norm(expectedSchemaName)) {
    return {
      ...base,
      status: "MISMATCH",
      schemaName,
      expectedSchemaName,
      mismatches: [
        `Connected schema "${schemaName}" does not match expected "${expectedSchemaName}".`,
      ],
      mayAuthorizeWriters: false,
    };
  }

  let table: LineageTableMetadata | null;
  try {
    table = await reader.getTable();
  } catch {
    return {
      ...base,
      status: "UNKNOWN",
      schemaName,
      expectedSchemaName,
      mismatches: ["Metadata reader failed while loading table identity."],
      mayAuthorizeWriters: false,
    };
  }

  if (!table) {
    return {
      ...base,
      status: "MISSING",
      schemaName,
      expectedSchemaName,
      mismatches: [`Table ${SEO_PLANNING_DECISION_LINKS_TABLE} is absent.`],
      mayAuthorizeWriters: false,
    };
  }

  const mismatches: string[] = [];

  if (norm(table.tableName) !== norm(LINEAGE_PHYSICAL_SCHEMA_EXPECTATIONS.tableName)) {
    mismatches.push(`Unexpected table name "${table.tableName}".`);
  }
  if (norm(table.engine) !== norm(LINEAGE_PHYSICAL_SCHEMA_EXPECTATIONS.engine)) {
    mismatches.push(`Engine must be InnoDB (found "${table.engine}").`);
  }
  if (norm(table.tableCollation) !== norm(LINEAGE_PHYSICAL_SCHEMA_EXPECTATIONS.collation)) {
    mismatches.push(
      `Collation must be utf8mb4_unicode_ci (found "${table.tableCollation}").`,
    );
  }

  let columns: LineageColumnMetadata[] = [];
  let indexes: LineageIndexMetadata[] = [];
  let foreignKeys: LineageForeignKeyMetadata[] = [];
  try {
    columns = await reader.listColumns();
    indexes = await reader.listIndexes();
    foreignKeys = await reader.listForeignKeys();
  } catch {
    return {
      ...base,
      status: "UNKNOWN",
      schemaName,
      expectedSchemaName,
      mismatches: ["Metadata reader failed while loading columns/indexes/FKs."],
      mayAuthorizeWriters: false,
    };
  }

  const byName = new Map(columns.map((c) => [norm(c.columnName), c]));
  for (const expected of LINEAGE_PHYSICAL_SCHEMA_EXPECTATIONS.columns) {
    const col = byName.get(norm(expected.name));
    if (!col) {
      mismatches.push(`Missing column ${expected.name}.`);
      continue;
    }
    if (!norm(col.dataType).includes(norm(expected.dataType))) {
      mismatches.push(
        `Column ${expected.name} type mismatch (expected ${expected.dataType}, found ${col.dataType}).`,
      );
    }
    const nullable = norm(col.isNullable) === "yes";
    if (nullable !== expected.nullable) {
      mismatches.push(
        `Column ${expected.name} nullability mismatch (expected nullable=${expected.nullable}).`,
      );
    }
  }

  const pk = columns.find((c) => norm(c.columnKey) === "pri");
  if (!pk || norm(pk.columnName) !== norm(LINEAGE_PHYSICAL_SCHEMA_EXPECTATIONS.primaryKeyColumn)) {
    mismatches.push("Primary key must be column id.");
  }

  for (const uniqueCol of LINEAGE_PHYSICAL_SCHEMA_EXPECTATIONS.uniqueColumns) {
    const hasUnique = indexes.some(
      (idx) =>
        norm(idx.columnName) === norm(uniqueCol) &&
        (idx.nonUnique === 0 || idx.nonUnique === false),
    );
    const col = byName.get(norm(uniqueCol));
    const uniKey = col && norm(col.columnKey) === "uni";
    if (!hasUnique && !uniKey) {
      mismatches.push(`Missing UNIQUE constraint on ${uniqueCol}.`);
    }
  }

  const hasLinkedAtIndex = indexes.some(
    (idx) =>
      norm(idx.columnName) ===
      norm(LINEAGE_PHYSICAL_SCHEMA_EXPECTATIONS.supportingIndexColumn),
  );
  if (!hasLinkedAtIndex) {
    mismatches.push("Missing supporting index on linked_at.");
  }

  for (const expectedFk of LINEAGE_PHYSICAL_SCHEMA_EXPECTATIONS.foreignKeys) {
    const fk = foreignKeys.find((row) => norm(row.columnName) === norm(expectedFk.column));
    if (!fk) {
      mismatches.push(`Missing foreign key on ${expectedFk.column}.`);
      continue;
    }
    if (norm(fk.referencedTableName) !== norm(expectedFk.referencedTable)) {
      mismatches.push(
        `FK ${expectedFk.column} must reference ${expectedFk.referencedTable} (found ${fk.referencedTableName}).`,
      );
    }
    if (norm(fk.referencedColumnName) !== norm(expectedFk.referencedColumn)) {
      mismatches.push(
        `FK ${expectedFk.column} must reference column ${expectedFk.referencedColumn}.`,
      );
    }
    if (!deleteRuleOk(fk.deleteRule)) {
      mismatches.push(
        `FK ${expectedFk.column} delete rule must be RESTRICT (found ${fk.deleteRule}).`,
      );
    }
  }

  if (mismatches.length > 0) {
    return {
      ...base,
      status: "MISMATCH",
      schemaName,
      expectedSchemaName,
      mismatches,
      mayAuthorizeWriters: false,
    };
  }

  return {
    ...base,
    status: "READY",
    schemaName,
    expectedSchemaName,
    mismatches: [],
    mayAuthorizeWriters: true,
  };
}

/**
 * Documents when this probe may run. OFF production paths must not call it.
 */
export function lineagePhysicalReadinessInvocationPolicy(): {
  allowedOnImport: false;
  allowedOnBuild: false;
  allowedOnOrdinaryRender: false;
  allowedOnOffFacadeCall: false;
  requiredAtFutureWriterActivation: true;
  markerV6ImpliesTableMissing: false;
  ddlRegistrationFalseImpliesTableMissing: false;
} {
  return {
    allowedOnImport: false,
    allowedOnBuild: false,
    allowedOnOrdinaryRender: false,
    allowedOnOffFacadeCall: false,
    requiredAtFutureWriterActivation: true,
    // Physical table may already exist while marker stays 6 and ensure stays unregistered.
    markerV6ImpliesTableMissing: false,
    ddlRegistrationFalseImpliesTableMissing: false,
  };
}

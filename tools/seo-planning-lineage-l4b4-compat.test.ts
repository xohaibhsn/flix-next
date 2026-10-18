/**
 * L4B-4 — Pure schema compatibility asserts (no MySQL).
 * Complements real-MySQL integration in seo-planning-lineage-l4b4-mysql.integration.ts.
 * Updated for production schema v6 baseline (concurrency released).
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { CURRENT_CMS_SCHEMA_VERSION } from "../lib/db/schema";
import {
  L4B_PLANNING_LINEAGE_DDL_REGISTERED_WITH_ENSURE,
  L4B_PLANNING_LINEAGE_PROPOSED_NUMERIC_SLOT,
  L4B_PLANNING_LINEAGE_TARGET_SCHEMA_SLOT,
  SEO_PLANNING_DECISION_LINKS_DDL,
  SEO_PLANNING_DECISION_LINKS_TABLE,
} from "../lib/cms/seo-planning-lineage/schema-ddl";
import {
  L4B4_ACTIVE_SCHEMA_VERSION,
  L4B4_CONCURRENCY_RELEASED_SCHEMA_VERSION,
  L4B4_LINEAGE_MIGRATION_DEPENDENCY,
  L4B4_RECOMMENDED_MIGRATION_ORDER,
  L4B4_SCHEMA_COMPATIBILITY_MATRIX,
  assertL4b4SchemaActivationBoundaries,
} from "../lib/cms/seo-planning-lineage/schema-compatibility";

const root = path.join(__dirname, "..");

function read(rel: string) {
  return readFileSync(path.join(root, rel), "utf8");
}

test("L4B-4 activation boundaries remain disconnected from ensure/version bump", () => {
  assert.equal(CURRENT_CMS_SCHEMA_VERSION, 6);
  assert.equal(L4B4_ACTIVE_SCHEMA_VERSION, 6);
  assert.equal(L4B4_CONCURRENCY_RELEASED_SCHEMA_VERSION, 6);
  assert.equal(L4B4_LINEAGE_MIGRATION_DEPENDENCY, "PROVISIONAL_V7_POST_CONCURRENCY_V6");
  assert.equal(L4B_PLANNING_LINEAGE_TARGET_SCHEMA_SLOT, "PROVISIONAL_V7_POST_CONCURRENCY_V6");
  assert.equal(L4B_PLANNING_LINEAGE_PROPOSED_NUMERIC_SLOT, 7);
  assert.equal(L4B_PLANNING_LINEAGE_DDL_REGISTERED_WITH_ENSURE, false);
  assertL4b4SchemaActivationBoundaries({
    currentCmsSchemaVersion: CURRENT_CMS_SCHEMA_VERSION,
    ddlRegisteredWithEnsure: L4B_PLANNING_LINEAGE_DDL_REGISTERED_WITH_ENSURE,
    targetSlot: L4B_PLANNING_LINEAGE_TARGET_SCHEMA_SLOT,
    linksTable: SEO_PLANNING_DECISION_LINKS_TABLE,
    linksDdl: SEO_PLANNING_DECISION_LINKS_DDL,
  });
});

test("compatibility matrix records released v6 and approval-gated lineage slot", () => {
  const versionRow = L4B4_SCHEMA_COMPATIBILITY_MATRIX.find(
    (r) => r.surface === "CURRENT_CMS_SCHEMA_VERSION",
  );
  assert.equal(versionRow?.verdict, "APPROVAL_REQUIRED");
  const deleteRow = L4B4_SCHEMA_COMPATIBILITY_MATRIX.find(
    (r) => r.surface === "Planning permanent DELETE with active link",
  );
  assert.equal(deleteRow?.verdict, "COMPATIBLE");
  assert.match(String(deleteRow?.notes), /L4B-5|DENY_LINKED/i);
  const planningId = L4B4_SCHEMA_COMPATIBILITY_MATRIX.find(
    (r) => r.surface === "seo_planning_drafts identity (id PK)",
  );
  assert.equal(planningId?.verdict, "COMPATIBLE");
  assert.ok(L4B4_RECOMMENDED_MIGRATION_ORDER.length >= 4);
});

test("mysql-store is server-only and not barrel-exported from lineage index", () => {
  const store = read("lib/cms/seo-planning-lineage/mysql-store.ts");
  assert.match(store, /import ["']server-only["']/);
  assert.match(store, /createMysqlPlanningLineageStore/);
  assert.match(store, /withTransaction/);
  assert.match(store, /FOR UPDATE/);
  assert.doesNotMatch(store, /proceedSeoOpportunityToPlanningDraftAction/);
  assert.doesNotMatch(store, /ensureCmsSchemaCurrent/);

  const index = read("lib/cms/seo-planning-lineage/index.ts");
  assert.doesNotMatch(index, /mysql-store/);
  assert.doesNotMatch(index, /createMysqlPlanningLineageStore/);
});

test("live schema statements do not include lineage table", () => {
  const schema = read("lib/db/schema.ts");
  assert.match(schema, /CURRENT_CMS_SCHEMA_VERSION\s*=\s*6/);
  assert.match(schema, /content_revision INT NOT NULL DEFAULT 1/);
  assert.doesNotMatch(schema, /seo_planning_decision_links/);
});

test("proceed-integration and actions remain disconnected from mysql-store", () => {
  assert.doesNotMatch(
    read("lib/cms/seo-planning-lineage/proceed-integration.ts"),
    /createMysqlPlanningLineageStore|mysql-store/,
  );
  assert.doesNotMatch(
    read("lib/cms/seo-planning-actions.ts"),
    /createMysqlPlanningLineageStore|seo_planning_decision_links/,
  );
});

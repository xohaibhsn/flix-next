import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import {
  L4B_PLANNING_WRITE_FENCE_DDL_REGISTERED_WITH_ENSURE,
  describePlanningWriteFenceDdlPackage,
} from "../lib/cms/seo-planning-lineage/planning-write-fence-ddl";
import { describePlanningWriteFenceProductionOpsPackage } from "../lib/cms/seo-planning-lineage/planning-write-fence-ops";
import { L4B_TRANSACTIONAL_PRODUCTION_WRITERS_AUTHORIZED } from "../lib/cms/seo-planning-lineage/transactional-integration";
import { RESEARCH_PROCEED_DURABLE_LINK_AUTHORIZED } from "../lib/cms/seo-planning-lineage/proceed-integration";
import { SIDHU_TRANSACTIONAL_LIVE_WIRING_AUTHORIZED } from "../lib/cms/seo-planning-lineage/live-wiring-dispatch";
import { L4B_PLANNING_LINEAGE_DDL_REGISTERED_WITH_ENSURE } from "../lib/cms/seo-planning-lineage/schema-ddl";

const root = path.join(__dirname, "..");

function read(rel: string) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

test("fence DDL remains disconnected from ensure; writers OFF", () => {
  assert.equal(L4B_PLANNING_WRITE_FENCE_DDL_REGISTERED_WITH_ENSURE, false);
  assert.equal(L4B_PLANNING_LINEAGE_DDL_REGISTERED_WITH_ENSURE, false);
  assert.equal(L4B_TRANSACTIONAL_PRODUCTION_WRITERS_AUTHORIZED, false);
  assert.equal(RESEARCH_PROCEED_DURABLE_LINK_AUTHORIZED, false);
  assert.equal(SIDHU_TRANSACTIONAL_LIVE_WIRING_AUTHORIZED, false);

  const pkg = describePlanningWriteFenceDdlPackage();
  assert.equal(pkg.registeredWithEnsure, false);
  assert.equal(pkg.liveSchemaMustRemain, 6);
  assert.equal(pkg.updateTriggerInstalledByDefault, false);
});

test("ops package is non-executed and lists sequential approvals", () => {
  const ops = describePlanningWriteFenceProductionOpsPackage();
  assert.equal(ops.executed, false);
  assert.ok(ops.sequentialApprovals.length >= 4);
  assert.ok(ops.ddlInventory.insertTrigger.includes("FOR UPDATE"));
});

test("production actions and barrel do not import fence auth/executor", () => {
  const forbidden = [
    "planning-write-fence-auth",
    "transactional-execution",
  ];
  const surfaces = [
    "lib/cms/seo-planning-lineage/transactional-integration.ts",
    "lib/cms/seo-planning-lineage/live-wiring-dispatch.ts",
    "lib/cms/seo-planning-lineage/index.ts",
  ];
  for (const rel of surfaces) {
    const src = read(rel);
    for (const needle of forbidden) {
      assert.doesNotMatch(
        src,
        new RegExp(`from ["'].*${needle}`),
        `${rel} must not import ${needle}`,
      );
    }
  }
});

test("DDL SQL module is not on Sidhu error/production dispatch import path", () => {
  // Inert codes may be imported; executable DDL text module must not be.
  const errors = read("lib/cms/seo-planning-lineage/planning-write-fence-errors.ts");
  const dispatch = read("lib/cms/seo-planning-lineage/live-wiring-dispatch.ts");
  const actions = read("lib/cms/seo-planning-actions.ts");
  assert.match(errors, /planning-write-fence-codes/);
  assert.doesNotMatch(errors, /planning-write-fence-ddl/);
  assert.doesNotMatch(dispatch, /planning-write-fence-ddl/);
  assert.doesNotMatch(actions, /planning-write-fence-ddl/);
  assert.match(dispatch, /planning-write-fence-errors/);
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { runCmsReadyInitialization } from "../lib/cms/schema-ensure-freeze";
import {
  decideSchemaEnsureAction,
  runSchemaVersionGate,
} from "../lib/cms/schema-version";
import { CURRENT_CMS_SCHEMA_VERSION } from "../lib/db/schema";
import {
  assertCmsWritesAllowed,
  CMS_WRITE_FREEZE_CODE,
  CMS_WRITE_FREEZE_ENV,
  CmsWriteFreezeError,
  isCmsWriteFreezeActive,
  isCmsWriteFreezeError,
} from "../lib/cms/write-freeze";

const FREEZE_TRUTHY = ["1", "true", "yes", "on", "TRUE", "Yes", "ON"] as const;

test("ACTIVE + current schema: readiness is read-only; zero post-schema mutations", async () => {
  let ensureCalls = 0;
  let mutationCalls = 0;
  for (const value of FREEZE_TRUTHY) {
    ensureCalls = 0;
    mutationCalls = 0;
    const outcome = await runCmsReadyInitialization({
      isFreezeActive: () => isCmsWriteFreezeActive({ [CMS_WRITE_FREEZE_ENV]: value }),
      ensureSchemaCurrent: async () => {
        ensureCalls += 1;
        return runSchemaVersionGate({
          currentVersion: CURRENT_CMS_SCHEMA_VERSION,
          readLookup: async () => ({ status: "found", version: CURRENT_CMS_SCHEMA_VERSION }),
          ensureSchema: async () => {
            throw new Error("DDL must not run on fast-path");
          },
          assertMutationAllowed: () => assertCmsWritesAllowed({ [CMS_WRITE_FREEZE_ENV]: value }),
        });
      },
      runPostSchemaMutations: async () => {
        mutationCalls += 1;
      },
    });
    assert.equal(outcome, "ready-readonly");
    assert.equal(ensureCalls, 1);
    assert.equal(mutationCalls, 0, `seed/backfill must not run for freeze=${value}`);
  }
});

test("ACTIVE + missing schema: controlled rejection before any DDL or marker write", async () => {
  let ddl = 0;
  let marker = 0;
  await assert.rejects(
    () =>
      runSchemaVersionGate({
        currentVersion: 6,
        readLookup: async () => ({ status: "found", version: null }),
        ensureSchema: async () => {
          ddl += 1;
        },
        writeVersion: async () => {
          marker += 1;
        },
        assertMutationAllowed: () => assertCmsWritesAllowed({ [CMS_WRITE_FREEZE_ENV]: "1" }),
      }),
    (error: unknown) => {
      assert.equal(isCmsWriteFreezeError(error), true);
      assert.equal((error as { code?: string }).code, CMS_WRITE_FREEZE_CODE);
      return true;
    },
  );
  assert.equal(ddl, 0);
  assert.equal(marker, 0);
});

test("ACTIVE + outdated schema: controlled rejection before migration DDL", async () => {
  let ddl = 0;
  await assert.rejects(
    () =>
      runSchemaVersionGate({
        currentVersion: 6,
        readLookup: async () => ({ status: "found", version: 5 }),
        ensureSchema: async () => {
          ddl += 1;
        },
        writeVersion: async () => undefined,
        assertMutationAllowed: () => assertCmsWritesAllowed({ [CMS_WRITE_FREEZE_ENV]: "true" }),
      }),
    (error: unknown) => isCmsWriteFreezeError(error),
  );
  assert.equal(ddl, 0);
  assert.equal(decideSchemaEnsureAction({ status: "found", version: 5 }, 6).action, "full-ensure");
});

test("ACTIVE + unavailable schema marker: fail closed before repair DDL", async () => {
  let ddl = 0;
  await assert.rejects(
    () =>
      runSchemaVersionGate({
        currentVersion: 6,
        readLookup: async () => ({ status: "unavailable" }),
        ensureSchema: async () => {
          ddl += 1;
        },
        writeVersion: async () => undefined,
        assertMutationAllowed: () => assertCmsWritesAllowed({ [CMS_WRITE_FREEZE_ENV]: "yes" }),
      }),
    (error: unknown) => isCmsWriteFreezeError(error),
  );
  assert.equal(ddl, 0);
});

test("ACTIVE + seed/backfill required path: zero seed writes via ready orchestration", async () => {
  let seeds = 0;
  let backfills = 0;
  const outcome = await runCmsReadyInitialization({
    isFreezeActive: () => true,
    ensureSchemaCurrent: async () => "skipped",
    runPostSchemaMutations: async () => {
      seeds += 1;
      backfills += 1;
    },
  });
  assert.equal(outcome, "ready-readonly");
  assert.equal(seeds, 0);
  assert.equal(backfills, 0);
});

test("ACTIVE + concurrent readiness calls: only one schema check; zero mutations", async () => {
  let schemaChecks = 0;
  let mutations = 0;
  let inFlight: Promise<"ready-readonly" | "ready-full"> | null = null;

  async function ensureOnce() {
    if (!inFlight) {
      inFlight = runCmsReadyInitialization({
        isFreezeActive: () => true,
        ensureSchemaCurrent: async () => {
          schemaChecks += 1;
          await new Promise((r) => setTimeout(r, 5));
          return "skipped";
        },
        runPostSchemaMutations: async () => {
          mutations += 1;
        },
      }).catch((error) => {
        inFlight = null;
        throw error;
      });
    }
    return inFlight;
  }

  const results = await Promise.all([ensureOnce(), ensureOnce(), ensureOnce()]);
  assert.deepEqual(results, ["ready-readonly", "ready-readonly", "ready-readonly"]);
  assert.equal(schemaChecks, 1);
  assert.equal(mutations, 0);
});

test("ACTIVE + failed initialization: does not leave a successful readiness cache", async () => {
  let attempts = 0;
  let cached: Promise<unknown> | null = null;

  async function ensureWithCache() {
    if (!cached) {
      cached = (async () => {
        attempts += 1;
        await runSchemaVersionGate({
          currentVersion: 6,
          readLookup: async () => ({ status: "found", version: null }),
          ensureSchema: async () => undefined,
          writeVersion: async () => undefined,
          assertMutationAllowed: () => assertCmsWritesAllowed({ [CMS_WRITE_FREEZE_ENV]: "on" }),
        });
      })().catch((error) => {
        cached = null;
        throw error;
      });
    }
    return cached;
  }

  await assert.rejects(() => ensureWithCache(), (e: unknown) => isCmsWriteFreezeError(e));
  assert.equal(cached, null);
  await assert.rejects(() => ensureWithCache(), (e: unknown) => isCmsWriteFreezeError(e));
  assert.equal(attempts, 2);
});

test("INACTIVE + missing schema: initialization still runs", async () => {
  let ddl = 0;
  let marker: number | null = null;
  const outcome = await runSchemaVersionGate({
    currentVersion: 6,
    readLookup: async () => ({ status: "found", version: null }),
    ensureSchema: async () => {
      ddl += 1;
    },
    writeVersion: async (v) => {
      marker = v;
    },
    assertMutationAllowed: () => assertCmsWritesAllowed({ [CMS_WRITE_FREEZE_ENV]: "0" }),
  });
  assert.equal(outcome, "ensured");
  assert.equal(ddl, 1);
  assert.equal(marker, 6);
});

test("INACTIVE + outdated schema: migration behavior preserved", async () => {
  let ddl = 0;
  const outcome = await runSchemaVersionGate({
    currentVersion: 6,
    readLookup: async () => ({ status: "found", version: 5 }),
    ensureSchema: async () => {
      ddl += 1;
    },
    writeVersion: async () => undefined,
    assertMutationAllowed: () => assertCmsWritesAllowed({}),
  });
  assert.equal(outcome, "ensured");
  assert.equal(ddl, 1);
});

test("INACTIVE + seeds: post-schema mutations still run", async () => {
  let mutations = 0;
  const outcome = await runCmsReadyInitialization({
    isFreezeActive: () => false,
    ensureSchemaCurrent: async () => "skipped",
    runPostSchemaMutations: async () => {
      mutations += 1;
    },
  });
  assert.equal(outcome, "ready-full");
  assert.equal(mutations, 1);
});

test("assertMutationAllowed runs before ensureSchema (ordering)", async () => {
  const order: string[] = [];
  await assert.rejects(
    () =>
      runSchemaVersionGate({
        currentVersion: 6,
        readLookup: async () => {
          order.push("lookup");
          return { status: "found", version: null };
        },
        ensureSchema: async () => {
          order.push("ddl");
        },
        writeVersion: async () => {
          order.push("marker");
        },
        assertMutationAllowed: () => {
          order.push("assert");
          throw new CmsWriteFreezeError();
        },
      }),
    (e: unknown) => isCmsWriteFreezeError(e),
  );
  assert.deepEqual(order, ["lookup", "assert"]);
});

test("source wiring: ensureCmsSchemaCurrent and ensureReady use freeze guards", () => {
  const root = process.cwd();
  const migrate = readFileSync(path.join(root, "lib/cms/mysql-migrate.ts"), "utf8");
  const repo = readFileSync(path.join(root, "lib/cms/mysql-repository.ts"), "utf8");
  const admin = readFileSync(path.join(root, "lib/auth/admin-users.ts"), "utf8");
  const gate = readFileSync(path.join(root, "lib/cms/schema-version.ts"), "utf8");

  assert.match(migrate, /assertMutationAllowed:\s*\(\)\s*=>\s*assertCmsWritesAllowed\(\)/);
  assert.match(migrate, /export async function ensureCmsSchema\([\s\S]*?assertCmsWritesAllowed\(\)/);
  assert.match(repo, /runCmsReadyInitialization/);
  assert.match(repo, /isCmsWriteFreezeActive/);
  assert.match(repo, /isCmsWriteFreezeError\(error\)/);
  // Bootstrap seed path uses sink-level SCHEMA_SEED (covers CMS_WRITE_FREEZE).
  assert.match(admin, /assertMutationAllowed\("SCHEMA_SEED"\)/);
  assert.match(gate, /assertMutationAllowed\?\.\(\)/);
});

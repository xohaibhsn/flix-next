import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import {
  decideSchemaEnsureAction,
  isMissingRelationError,
  parseStoredSchemaVersion,
  runSchemaVersionGate,
} from "../lib/cms/schema-version";
import { CMS_SCHEMA_VERSION_KEY } from "../lib/cms/migration-flags";
import { CURRENT_CMS_SCHEMA_VERSION } from "../lib/db/schema";

test("parseStoredSchemaVersion accepts positive integer text only", () => {
  assert.equal(parseStoredSchemaVersion("1"), 1);
  assert.equal(parseStoredSchemaVersion(2), 2);
  assert.equal(parseStoredSchemaVersion(" 3 "), 3);
  assert.equal(parseStoredSchemaVersion(null), null);
  assert.equal(parseStoredSchemaVersion(""), null);
  assert.equal(parseStoredSchemaVersion("1.5"), null);
  assert.equal(parseStoredSchemaVersion("abc"), null);
  assert.equal(parseStoredSchemaVersion("0"), null);
  assert.equal(parseStoredSchemaVersion(-1), null);
});

test("no site_settings / unavailable → full schema ensure", () => {
  const d = decideSchemaEnsureAction({ status: "unavailable" }, 1);
  assert.equal(d.action, "full-ensure");
  if (d.action === "full-ensure") {
    assert.equal(d.writeVersionAfterSuccess, true);
    assert.equal(d.reason, "unavailable");
  }
});

test("site_settings exists but version absent → full schema ensure", () => {
  const d = decideSchemaEnsureAction({ status: "found", version: null }, 1);
  assert.equal(d.action, "full-ensure");
  if (d.action === "full-ensure") assert.equal(d.reason, "absent-or-malformed");
});

test("stored current version → full schema ensure skipped", () => {
  const d = decideSchemaEnsureAction({ status: "found", version: 1 }, 1);
  assert.equal(d.action, "fast-path");
});

test("stored older version → full schema ensure runs", () => {
  const d = decideSchemaEnsureAction({ status: "found", version: 1 }, 2);
  assert.equal(d.action, "full-ensure");
  if (d.action === "full-ensure") {
    assert.equal(d.writeVersionAfterSuccess, true);
    assert.equal(d.reason, "older");
  }
});

test("malformed version → full schema ensure runs", () => {
  assert.equal(parseStoredSchemaVersion("nope"), null);
  const d = decideSchemaEnsureAction({ status: "found", version: parseStoredSchemaVersion("nope") }, 1);
  assert.equal(d.action, "full-ensure");
});

test("full schema success → current version stored", async () => {
  let ensureCalls = 0;
  let written: number | null = null;
  const outcome = await runSchemaVersionGate({
    currentVersion: 1,
    readLookup: async () => ({ status: "found", version: null }),
    ensureSchema: async () => {
      ensureCalls += 1;
    },
    writeVersion: async (v) => {
      written = v;
    },
  });
  assert.equal(outcome, "ensured");
  assert.equal(ensureCalls, 1);
  assert.equal(written, 1);
});

test("full schema failure → version NOT stored", async () => {
  let written = false;
  await assert.rejects(
    () =>
      runSchemaVersionGate({
        currentVersion: 1,
        readLookup: async () => ({ status: "found", version: null }),
        ensureSchema: async () => {
          throw new Error("ddl failed");
        },
        writeVersion: async () => {
          written = true;
        },
      }),
    /ddl failed/,
  );
  assert.equal(written, false);
});

test("current version fast-path → ensureCmsSchema not called", async () => {
  let ensureCalls = 0;
  let writes = 0;
  const outcome = await runSchemaVersionGate({
    currentVersion: 5,
    readLookup: async () => ({ status: "found", version: 5 }),
    ensureSchema: async () => {
      ensureCalls += 1;
    },
    writeVersion: async () => {
      writes += 1;
    },
  });
  assert.equal(outcome, "skipped");
  assert.equal(ensureCalls, 0);
  assert.equal(writes, 0);
});

test("current version fast-path implies no CREATE / information_schema work", async () => {
  let createCalls = 0;
  let infoSchemaCalls = 0;
  await runSchemaVersionGate({
    currentVersion: CURRENT_CMS_SCHEMA_VERSION,
    readLookup: async () => ({ status: "found", version: CURRENT_CMS_SCHEMA_VERSION }),
    ensureSchema: async () => {
      createCalls += 12;
      infoSchemaCalls += 4;
    },
  });
  assert.equal(createCalls, 0);
  assert.equal(infoSchemaCalls, 0);
});

test("DB version N-1 runs ensure once then becomes N", async () => {
  const store = { version: 1 as number | null };
  let ensureCalls = 0;
  await runSchemaVersionGate({
    currentVersion: 2,
    readLookup: async () => ({ status: "found", version: store.version }),
    ensureSchema: async () => {
      ensureCalls += 1;
    },
    writeVersion: async (v) => {
      store.version = v;
    },
  });
  assert.equal(ensureCalls, 1);
  assert.equal(store.version, 2);

  ensureCalls = 0;
  const second = await runSchemaVersionGate({
    currentVersion: 2,
    readLookup: async () => ({ status: "found", version: store.version }),
    ensureSchema: async () => {
      ensureCalls += 1;
    },
    writeVersion: async (v) => {
      store.version = v;
    },
  });
  assert.equal(second, "skipped");
  assert.equal(ensureCalls, 0);
  assert.equal(store.version, 2);
});

test("rollback / newer DB version → no downgrade write", async () => {
  let written: number | null = null;
  let ensureCalls = 0;
  const outcome = await runSchemaVersionGate({
    currentVersion: 1,
    readLookup: async () => ({ status: "found", version: 2 }),
    ensureSchema: async () => {
      ensureCalls += 1;
    },
    writeVersion: async (v) => {
      written = v;
    },
  });
  assert.equal(outcome, "ensured");
  assert.equal(ensureCalls, 1);
  assert.equal(written, null);
  const decision = decideSchemaEnsureAction({ status: "found", version: 2 }, 1);
  assert.equal(decision.action, "full-ensure");
  if (decision.action === "full-ensure") {
    assert.equal(decision.writeVersionAfterSuccess, false);
    assert.equal(decision.reason, "newer-than-code");
  }
});

test("repeated process with current version → version lookup only", async () => {
  let lookups = 0;
  let ensureCalls = 0;
  const run = () =>
    runSchemaVersionGate({
      currentVersion: 1,
      readLookup: async () => {
        lookups += 1;
        return { status: "found", version: 1 };
      },
      ensureSchema: async () => {
        ensureCalls += 1;
      },
    });
  assert.equal(await run(), "skipped");
  assert.equal(await run(), "skipped");
  assert.equal(lookups, 2);
  assert.equal(ensureCalls, 0);
});

test("empty-DB style unavailable write version after success", async () => {
  let written: number | null = null;
  const outcome = await runSchemaVersionGate({
    currentVersion: 1,
    readLookup: async () => ({ status: "unavailable" }),
    ensureSchema: async () => {},
    writeVersion: async (v) => {
      written = v;
    },
  });
  assert.equal(outcome, "ensured");
  assert.equal(written, 1);
});

test("isMissingRelationError is narrow (ER_NO_SUCH_TABLE / 1146 only)", () => {
  assert.equal(isMissingRelationError({ code: "ER_NO_SUCH_TABLE", errno: 1146 }), true);
  assert.equal(isMissingRelationError({ code: "ER_ACCESS_DENIED_ERROR", errno: 1045 }), false);
  assert.equal(isMissingRelationError({ code: "ECONNREFUSED" }), false);
  assert.equal(isMissingRelationError({ code: "ER_PARSE_ERROR", errno: 1064 }), false);
  assert.equal(isMissingRelationError(new Error("boom")), false);
});

test("standalone admin bootstrap uses schema-version-aware entry", () => {
  const admin = readFileSync(path.join(process.cwd(), "lib/auth/admin-users.ts"), "utf8");
  const ifNeeded = admin.slice(admin.indexOf("export async function bootstrapAdminUsersIfNeeded"));
  assert.match(ifNeeded, /ensureCmsSchemaCurrent/);
  assert.doesNotMatch(ifNeeded, /ensureSchema:\s*ensureCmsSchema\b/);
});

test("ensureReady uses ensureCmsSchemaCurrent not raw ensureCmsSchema", () => {
  const repo = readFileSync(path.join(process.cwd(), "lib/cms/mysql-repository.ts"), "utf8");
  const ready = repo.slice(repo.indexOf("private async ensureReady"), repo.indexOf("ready()"));
  assert.match(ready, /ensureCmsSchemaCurrent\(\)/);
  assert.equal(ready.includes("ensureCmsSchema()"), false);
  assert.match(ready, /bootstrapAdminUsersAfterSchemaReady/);
});

test("mysql-migrate exports ensureCmsSchemaCurrent wrapping the version gate", () => {
  const migrate = readFileSync(path.join(process.cwd(), "lib/cms/mysql-migrate.ts"), "utf8");
  assert.match(migrate, /export async function ensureCmsSchemaCurrent/);
  assert.match(migrate, /runSchemaVersionGate/);
  assert.match(migrate, /CMS_SCHEMA_VERSION_KEY/);
});

test("schema version constant lives next to schema statements", () => {
  const schema = readFileSync(path.join(process.cwd(), "lib/db/schema.ts"), "utf8");
  assert.match(schema, /export const CURRENT_CMS_SCHEMA_VERSION\s*=\s*3/);
  assert.match(schema, /bump CURRENT_CMS_SCHEMA_VERSION/i);
  assert.equal(CMS_SCHEMA_VERSION_KEY, "cms_schema_version");
  assert.equal(CURRENT_CMS_SCHEMA_VERSION, 3);
});

test("BEFORE/AFTER cold-start operation counts (instrumented)", async () => {
  const counts = { versionLookup: 0, select1: 0, create: 0, infoSchema: 0, versionWrite: 0 };
  const ensureSchema = async () => {
    counts.select1 += 1;
    counts.create += 12;
    counts.infoSchema += 4;
  };
  const store = { version: null as number | null };

  // First process: no marker
  await runSchemaVersionGate({
    currentVersion: 1,
    readLookup: async () => {
      counts.versionLookup += 1;
      return store.version == null ? { status: "found", version: null } : { status: "found", version: store.version };
    },
    ensureSchema,
    writeVersion: async (v) => {
      counts.versionWrite += 1;
      store.version = v;
    },
  });
  assert.deepEqual(
    { ...counts },
    { versionLookup: 1, select1: 1, create: 12, infoSchema: 4, versionWrite: 1 },
  );

  // Later process: current marker
  const later = { versionLookup: 0, select1: 0, create: 0, infoSchema: 0, versionWrite: 0 };
  await runSchemaVersionGate({
    currentVersion: 1,
    readLookup: async () => {
      later.versionLookup += 1;
      return { status: "found", version: store.version };
    },
    ensureSchema: async () => {
      later.select1 += 1;
      later.create += 12;
      later.infoSchema += 4;
    },
    writeVersion: async () => {
      later.versionWrite += 1;
    },
  });
  assert.deepEqual(later, { versionLookup: 1, select1: 0, create: 0, infoSchema: 0, versionWrite: 0 });
});

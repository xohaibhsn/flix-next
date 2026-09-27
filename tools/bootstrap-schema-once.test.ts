import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { ensureSchemaThenBootstrap } from "../lib/auth/bootstrap-schema-gate";
import { envPasswordBootstrapAction } from "../lib/auth/bootstrap-policy";

test("ensureReady path performs schema ensure once, not twice", async () => {
  let schemaCalls = 0;
  let bootstrapCalls = 0;
  const result = await ensureSchemaThenBootstrap({
    schemaAlreadyEnsured: true,
    ensureSchema: async () => {
      schemaCalls += 1;
    },
    bootstrapAfterSchema: async () => {
      bootstrapCalls += 1;
    },
  });
  assert.equal(result, "bootstrap-only");
  assert.equal(schemaCalls, 0);
  assert.equal(bootstrapCalls, 1);
});

test("standalone bootstrap still ensures schema itself", async () => {
  let schemaCalls = 0;
  let bootstrapCalls = 0;
  const result = await ensureSchemaThenBootstrap({
    schemaAlreadyEnsured: false,
    ensureSchema: async () => {
      schemaCalls += 1;
    },
    bootstrapAfterSchema: async () => {
      bootstrapCalls += 1;
    },
  });
  assert.equal(result, "schema-then-bootstrap");
  assert.equal(schemaCalls, 1);
  assert.equal(bootstrapCalls, 1);
});

test("schema failure prevents bootstrap", async () => {
  let bootstrapCalls = 0;
  await assert.rejects(
    () =>
      ensureSchemaThenBootstrap({
        schemaAlreadyEnsured: false,
        ensureSchema: async () => {
          throw new Error("schema failed");
        },
        bootstrapAfterSchema: async () => {
          bootstrapCalls += 1;
        },
      }),
    /schema failed/,
  );
  assert.equal(bootstrapCalls, 0);
});

test("bootstrap failure still propagates after schema", async () => {
  let schemaCalls = 0;
  await assert.rejects(
    () =>
      ensureSchemaThenBootstrap({
        schemaAlreadyEnsured: false,
        ensureSchema: async () => {
          schemaCalls += 1;
        },
        bootstrapAfterSchema: async () => {
          throw new Error("bootstrap failed");
        },
      }),
    /bootstrap failed/,
  );
  assert.equal(schemaCalls, 1);
});

test("cold ensureReady removes duplicate schema work (1 vs 2)", async () => {
  let schemaCalls = 0;
  const ensureSchema = async () => {
    schemaCalls += 1;
  };
  const bootstrapAfterSchema = async () => {};

  // Simulate ensureReady: schema first, then schema-ready bootstrap.
  await ensureSchema();
  await ensureSchemaThenBootstrap({
    schemaAlreadyEnsured: true,
    ensureSchema,
    bootstrapAfterSchema,
  });
  assert.equal(schemaCalls, 1);

  schemaCalls = 0;
  // Old nested pattern would look like this:
  await ensureSchema();
  await ensureSchemaThenBootstrap({
    schemaAlreadyEnsured: false,
    ensureSchema,
    bootstrapAfterSchema,
  });
  assert.equal(schemaCalls, 2);
});

test("empty admin table still chooses insert bootstrap action", () => {
  assert.equal(
    envPasswordBootstrapAction({
      userCount: 0,
      allowEmergency: true,
      emergencyRecovery: false,
      activeSuperAdmins: 0,
      emergencyReset: false,
      emergencyResetAlreadyApplied: false,
    }),
    "insert",
  );
});

test("populated admin table is not overwritten without emergency flags", () => {
  assert.equal(
    envPasswordBootstrapAction({
      userCount: 2,
      allowEmergency: true,
      emergencyRecovery: false,
      activeSuperAdmins: 1,
      emergencyReset: false,
      emergencyResetAlreadyApplied: false,
    }),
    "none",
  );
});

test("emergency restore/reset policy remains unchanged", () => {
  assert.equal(
    envPasswordBootstrapAction({
      userCount: 1,
      allowEmergency: true,
      emergencyRecovery: true,
      activeSuperAdmins: 0,
      emergencyReset: false,
      emergencyResetAlreadyApplied: false,
    }),
    "emergency-restore",
  );
  assert.equal(
    envPasswordBootstrapAction({
      userCount: 1,
      allowEmergency: true,
      emergencyRecovery: false,
      activeSuperAdmins: 1,
      emergencyReset: true,
      emergencyResetAlreadyApplied: false,
    }),
    "emergency-reset",
  );
  assert.equal(
    envPasswordBootstrapAction({
      userCount: 1,
      allowEmergency: false,
      emergencyRecovery: true,
      activeSuperAdmins: 0,
      emergencyReset: true,
      emergencyResetAlreadyApplied: false,
    }),
    "none",
  );
});

test("repeated schema-ready bootstrap remains idempotent at the gate", async () => {
  let schemaCalls = 0;
  let bootstrapCalls = 0;
  const deps = {
    schemaAlreadyEnsured: true as const,
    ensureSchema: async () => {
      schemaCalls += 1;
    },
    bootstrapAfterSchema: async () => {
      bootstrapCalls += 1;
    },
  };
  await ensureSchemaThenBootstrap(deps);
  await ensureSchemaThenBootstrap(deps);
  assert.equal(schemaCalls, 0);
  assert.equal(bootstrapCalls, 2);
});

test("source wiring: ensureReady uses AfterSchemaReady; standalone IfNeeded still ensures schema", () => {
  const repo = readFileSync(path.join(process.cwd(), "lib/cms/mysql-repository.ts"), "utf8");
  const ready = repo.slice(repo.indexOf("private async ensureReady"), repo.indexOf("ready()"));
  assert.match(ready, /bootstrapAdminUsersAfterSchemaReady\(\{\s*allowEmergency:\s*true\s*\}\)/);
  assert.equal(ready.includes("bootstrapAdminUsersIfNeeded"), false);

  const admin = readFileSync(path.join(process.cwd(), "lib/auth/admin-users.ts"), "utf8");
  assert.match(admin, /export async function bootstrapAdminUsersAfterSchemaReady/);
  assert.match(admin, /export async function bootstrapAdminUsersIfNeeded/);
  assert.match(admin, /schemaAlreadyEnsured:\s*false/);
  assert.match(admin, /ensureCmsSchemaCurrent/);

  const auth = readFileSync(path.join(process.cwd(), "lib/auth/authenticate.ts"), "utf8");
  assert.match(auth, /bootstrapAdminUsersIfNeeded\(\)/);
});

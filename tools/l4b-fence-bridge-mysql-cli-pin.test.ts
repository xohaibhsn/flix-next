import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";

const require = createRequire(import.meta.url);
const {
  APPROVED_DB_NAME,
  APPROVED_PORT,
  buildPrivilegedMysqlCliArgs,
  parsePrivilegedCliIdentity,
  validatePrivilegedCliIdentity,
} = require("./l4b-fence-bridge-mysql-cli-pin.cjs") as {
  APPROVED_DB_NAME: string;
  APPROVED_PORT: string;
  buildPrivilegedMysqlCliArgs: (opts: {
    defaultsFile: string;
    host?: string;
    port?: string;
    database?: string;
  }) =>
    | { ok: true; args: string[]; host: string; port: string; database: string }
    | { ok: false; reason: string };
  parsePrivilegedCliIdentity: (stdout: string) =>
    | { ok: true; database: string; port: string; bindAddress: string; version: string }
    | { ok: false; reason: string };
  validatePrivilegedCliIdentity: (identity: {
    database: string;
    port: string;
    bindAddress: string;
    version: string;
  }) => { ok: true } | { ok: false; reason: string };
};

test("CLI pin args force TCP host/port/database after defaults-file", () => {
  const built = buildPrivilegedMysqlCliArgs({
    defaultsFile: "C:\\Users\\LENOVO\\.flix-mysql-disposable\\my.ini",
  });
  assert.equal(built.ok, true);
  if (!built.ok) return;
  assert.ok(built.args[0]?.startsWith("--defaults-file="));
  assert.ok(built.args.includes("--protocol=TCP"));
  assert.ok(built.args.includes("--host=127.0.0.1"));
  assert.ok(built.args.includes("--port=3310"));
  assert.equal(built.args[built.args.length - 1], APPROVED_DB_NAME);
  assert.ok(!built.args.some((a) => /password|pwd/i.test(a)));
});

test("CLI pin refuses wrong host/port/database and protected Ledger name", () => {
  assert.equal(
    buildPrivilegedMysqlCliArgs({
      defaultsFile: "x.ini",
      host: "srv123.hstgr.io",
    }).ok,
    false,
  );
  assert.equal(
    buildPrivilegedMysqlCliArgs({
      defaultsFile: "x.ini",
      port: "3306",
    }).ok,
    false,
  );
  assert.equal(
    buildPrivilegedMysqlCliArgs({
      defaultsFile: "x.ini",
      database: "flix_ledger_l1_disposable",
    }).ok,
    false,
  );
  assert.equal(
    buildPrivilegedMysqlCliArgs({
      defaultsFile: "x.ini",
      database: "something_else",
    }).ok,
    false,
  );
  assert.equal(buildPrivilegedMysqlCliArgs({ defaultsFile: "" }).ok, false);
});

test("CLI identity validation accepts only exact disposable loopback 8.0.46", () => {
  const parsed = parsePrivilegedCliIdentity(
    `${APPROVED_DB_NAME}\t${APPROVED_PORT}\t127.0.0.1\t8.0.46\n`,
  );
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.equal(validatePrivilegedCliIdentity(parsed).ok, true);

  assert.equal(
    validatePrivilegedCliIdentity({
      database: "flix_ledger_l1_disposable",
      port: APPROVED_PORT,
      bindAddress: "127.0.0.1",
      version: "8.0.46",
    }).ok,
    false,
  );
  assert.equal(
    validatePrivilegedCliIdentity({
      database: APPROVED_DB_NAME,
      port: "3307",
      bindAddress: "127.0.0.1",
      version: "8.0.46",
    }).ok,
    false,
  );
  assert.equal(
    validatePrivilegedCliIdentity({
      database: APPROVED_DB_NAME,
      port: APPROVED_PORT,
      bindAddress: "0.0.0.0",
      version: "8.0.46",
    }).ok,
    false,
  );
  assert.equal(
    validatePrivilegedCliIdentity({
      database: APPROVED_DB_NAME,
      port: APPROVED_PORT,
      bindAddress: "127.0.0.1",
      version: "8.4.0",
    }).ok,
    false,
  );
  assert.equal(parsePrivilegedCliIdentity("").ok, false);
});

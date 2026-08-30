import assert from "node:assert/strict";
import { test } from "node:test";
import { envPasswordBootstrapAction, envPasswordMayAuthenticate } from "../lib/auth/bootstrap-policy";
import { hashPassword, passwordPolicyError, verifyPassword } from "../lib/auth/password";

test("password policy rejects weak and short values", () => {
  assert.ok(passwordPolicyError("admin123"));
  assert.ok(passwordPolicyError("password"));
  assert.ok(passwordPolicyError("Password1"));
  assert.equal(passwordPolicyError("StrongPass12!"), null);
});

test("bcrypt hash then verify; old password fails after rotate", async () => {
  const original = "BootstrapPass1!";
  const next = "ChangedPass12!";
  const firstHash = await hashPassword(original);
  assert.match(firstHash, /^\$2[aby]?\$\d{2}\$/);
  assert.equal(await verifyPassword(original, firstHash), true);
  const secondHash = await hashPassword(next);
  assert.equal(await verifyPassword(original, secondHash), false);
  assert.equal(await verifyPassword(next, secondHash), true);
  assert.notEqual(firstHash, secondHash);
});

test("empty table bootstraps once; later boots do not overwrite from env", () => {
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
  assert.equal(
    envPasswordBootstrapAction({
      userCount: 1,
      allowEmergency: false,
      emergencyRecovery: false,
      activeSuperAdmins: 1,
      emergencyReset: false,
      emergencyResetAlreadyApplied: false,
    }),
    "none",
  );
  assert.equal(
    envPasswordBootstrapAction({
      userCount: 1,
      allowEmergency: true,
      emergencyRecovery: false,
      activeSuperAdmins: 1,
      emergencyReset: false,
      emergencyResetAlreadyApplied: false,
    }),
    "none",
  );
});

test("emergency overwrite is explicit only", () => {
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
      allowEmergency: true,
      emergencyRecovery: false,
      activeSuperAdmins: 1,
      emergencyReset: true,
      emergencyResetAlreadyApplied: true,
    }),
    "none",
  );
});

test("env password must not authenticate once MySQL admin_users exists", () => {
  assert.equal(envPasswordMayAuthenticate({ databaseConfigured: true, adminUserCount: 0 }), false);
  assert.equal(envPasswordMayAuthenticate({ databaseConfigured: true, adminUserCount: 1 }), false);
  assert.equal(envPasswordMayAuthenticate({ databaseConfigured: false, adminUserCount: 0 }), true);
});

test("in-memory user store: login, change password, reset other user, disable", async () => {
  const envPassword = "EnvBootstrap1!";
  const store = [
    {
      id: "adm_primary",
      username: "admin",
      passwordHash: await hashPassword(envPassword),
      active: true,
      sessionVersion: 1,
    },
    {
      id: "adm_editor",
      username: "editor",
      passwordHash: await hashPassword("EditorPass12!"),
      active: true,
      sessionVersion: 1,
    },
  ];

  async function login(username: string, password: string) {
    const user = store.find((item) => item.username === username);
    if (!user) return "invalid";
    if (!user.active) return "disabled";
    return (await verifyPassword(password, user.passwordHash)) ? "ok" : "invalid";
  }

  assert.equal(await login("admin", envPassword), "ok");

  const changed = "NewPrimary99!";
  const previousVersion = store[0].sessionVersion;
  store[0].passwordHash = await hashPassword(changed);
  store[0].sessionVersion += 1;
  assert.ok(store[0].sessionVersion > previousVersion);
  assert.equal(await login("admin", envPassword), "invalid");
  assert.equal(await login("admin", changed), "ok");

  const resetTo = "TempEditor12!";
  store[1].passwordHash = await hashPassword(resetTo);
  store[1].sessionVersion += 1;
  assert.equal(await login("editor", "EditorPass12!"), "invalid");
  assert.equal(await login("editor", resetTo), "ok");

  store[1].active = false;
  store[1].sessionVersion += 1;
  assert.equal(await login("editor", resetTo), "disabled");
  assert.equal(await login("nobody", envPassword), "invalid");
  assert.equal(envPasswordMayAuthenticate({ databaseConfigured: true, adminUserCount: store.length }), false);
});

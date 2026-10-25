/**
 * Offline unit + static tests for the CMS write-freeze diagnostic.
 * No production/lab DB, no network, no Hostinger.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  CMS_WRITE_FREEZE_DIAGNOSTIC_MESSAGES,
  evaluateCmsWriteFreezeGuard,
  runCmsWriteFreezeDiagnostic,
} from "../lib/cms/cms-write-freeze-diagnostic";
import {
  assertCmsWritesAllowed,
  CMS_WRITE_FREEZE_CODE,
  CMS_WRITE_FREEZE_ENV,
  isCmsWriteFreezeActive,
} from "../lib/cms/write-freeze";

const root = process.cwd();

function read(rel: string) {
  return readFileSync(path.join(root, rel), "utf8");
}

function allowSeo() {
  return async () => null;
}

function denyUnauthorized() {
  return async () => ({ ok: false as const, error: "Unauthorized" });
}

function denyAccess() {
  return async () => ({ ok: false as const, error: "Access denied." });
}

test("evaluateCmsWriteFreezeGuard: truthy env → ACTIVE", () => {
  for (const on of ["1", "true", "yes", "on", "TRUE", "Yes", "ON"]) {
    assert.equal(
      evaluateCmsWriteFreezeGuard({ [CMS_WRITE_FREEZE_ENV]: on }),
      "ACTIVE",
      `expected ACTIVE for ${on}`,
    );
  }
});

test("evaluateCmsWriteFreezeGuard: falsy/missing env → INACTIVE", () => {
  assert.equal(evaluateCmsWriteFreezeGuard({}), "INACTIVE");
  for (const off of ["", "0", "false", "no", "off", "maybe"]) {
    assert.equal(
      evaluateCmsWriteFreezeGuard({ [CMS_WRITE_FREEZE_ENV]: off }),
      "INACTIVE",
      `expected INACTIVE for ${off}`,
    );
  }
});

test("evaluateCmsWriteFreezeGuard matches existing assertCmsWritesAllowed semantics", () => {
  for (const on of ["1", "true", "yes", "on"]) {
    const env = { [CMS_WRITE_FREEZE_ENV]: on };
    assert.equal(isCmsWriteFreezeActive(env), true);
    assert.throws(() => assertCmsWritesAllowed(env));
    assert.equal(evaluateCmsWriteFreezeGuard(env), "ACTIVE");
  }
  for (const off of [undefined, "", "0", "false"]) {
    const env =
      off === undefined ? {} : ({ [CMS_WRITE_FREEZE_ENV]: off } as Record<string, string>);
    assert.equal(isCmsWriteFreezeActive(env), false);
    assert.doesNotThrow(() => assertCmsWritesAllowed(env));
    assert.equal(evaluateCmsWriteFreezeGuard(env), "INACTIVE");
  }
});

test("runCmsWriteFreezeDiagnostic: authorized + freeze ON → ACTIVE with guard code", async () => {
  const result = await runCmsWriteFreezeDiagnostic({
    requireAdmin: allowSeo(),
    env: { [CMS_WRITE_FREEZE_ENV]: "1" },
  });
  assert.equal(result.ok, true);
  assert.equal(result.status, "ACTIVE");
  if (result.ok && result.status === "ACTIVE") {
    assert.equal(result.code, CMS_WRITE_FREEZE_CODE);
    assert.equal(result.message, CMS_WRITE_FREEZE_DIAGNOSTIC_MESSAGES.ACTIVE);
  }
});

test("runCmsWriteFreezeDiagnostic: authorized + freeze OFF → INACTIVE", async () => {
  const result = await runCmsWriteFreezeDiagnostic({
    requireAdmin: allowSeo(),
    env: { [CMS_WRITE_FREEZE_ENV]: "0" },
  });
  assert.equal(result.ok, true);
  assert.equal(result.status, "INACTIVE");
  if (result.ok && result.status === "INACTIVE") {
    assert.equal(result.message, CMS_WRITE_FREEZE_DIAGNOSTIC_MESSAGES.INACTIVE);
  }
});

test("runCmsWriteFreezeDiagnostic: unauthenticated → UNKNOWN without freeze state", async () => {
  const result = await runCmsWriteFreezeDiagnostic({
    requireAdmin: denyUnauthorized(),
    env: { [CMS_WRITE_FREEZE_ENV]: "1" },
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, "UNKNOWN");
  if (!result.ok) {
    assert.equal(result.code, "unauthorized");
    assert.equal(result.error, CMS_WRITE_FREEZE_DIAGNOSTIC_MESSAGES.UNKNOWN);
  }
  assert.doesNotMatch(JSON.stringify(result), /ACTIVE|INACTIVE|cms_write_freeze/i);
});

test("runCmsWriteFreezeDiagnostic: access denied → UNKNOWN without freeze state", async () => {
  const result = await runCmsWriteFreezeDiagnostic({
    requireAdmin: denyAccess(),
    env: { [CMS_WRITE_FREEZE_ENV]: "1" },
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, "UNKNOWN");
  if (!result.ok) {
    assert.equal(result.code, "access_denied");
  }
  assert.doesNotMatch(JSON.stringify(result), /ACTIVE|INACTIVE|cms_write_freeze/i);
});

test("diagnostic core has no persistence / schema / AI / DB imports", () => {
  const core = read("lib/cms/cms-write-freeze-diagnostic.ts");
  assert.match(core, /assertCmsWritesAllowed/);
  assert.match(core, /requireAdmin\("seo"\)|requireAdminAction/);
  assert.doesNotMatch(core, /from ["']@\/lib\/cms\/repository/);
  assert.doesNotMatch(core, /getDbPool|ensureCmsSchema|saveRedirect|savePost|cloudinary/i);
  assert.doesNotMatch(core, /from ["']mysql2|from ["']@\/lib\/db\/pool/);
  assert.doesNotMatch(core, /from ["']@\/lib\/cms\/ai-seo|insertResearch|saveSeoHealth|openai|gemini/i);
  assert.doesNotMatch(core, /\bGSC\b|gsc_/);
  assert.doesNotMatch(core, /revalidatePath|revalidateSidhu|revalidateTag/i);
});

test("server action is click-only wrapper with no page-load side effects", () => {
  const action = read("lib/cms/cms-write-freeze-diagnostic-action.ts");
  assert.match(action, /"use server"/);
  assert.match(action, /export async function checkCmsWriteFreezeAction/);
  assert.match(action, /runCmsWriteFreezeDiagnostic\(\)/);
  assert.doesNotMatch(action, /cms\.|getDbPool|ensureCmsSchema|revalidate/i);
});

test("SEO overview wires panel without auto-invoking diagnostic on render", () => {
  const page = read("app/sidhu/(protected)/seo/page.tsx");
  assert.match(page, /CmsWriteFreezeDiagnosticPanel/);
  assert.doesNotMatch(page, /runCmsWriteFreezeDiagnostic|checkCmsWriteFreezeAction|evaluateCmsWriteFreezeGuard/);
});

test("UI panel: intentional submit, pending disable, no Save/Publish wiring", () => {
  const ui = read("components/sidhu/CmsWriteFreezeDiagnosticPanel.tsx");
  assert.match(ui, /"use client"/);
  assert.match(ui, /Check CMS Write Freeze/);
  assert.match(ui, /useActionState/);
  assert.match(ui, /checkCmsWriteFreezeAction/);
  assert.match(ui, /disabled=\{pending\}/);
  assert.match(ui, /WRITE_FREEZE_ACTIVE/);
  assert.match(ui, /WRITE_FREEZE_INACTIVE/);
  assert.match(ui, /WRITE_FREEZE_UNKNOWN/);
  assert.match(ui, /\{result\.message\}/);
  assert.match(ui, /\{result\.error\}/);
  assert.equal(
    CMS_WRITE_FREEZE_DIAGNOSTIC_MESSAGES.ACTIVE,
    "This server request was rejected by the CMS write-freeze guard.",
  );
  assert.equal(
    CMS_WRITE_FREEZE_DIAGNOSTIC_MESSAGES.INACTIVE,
    "This server request was not rejected by the CMS write-freeze guard.",
  );
  assert.equal(
    CMS_WRITE_FREEZE_DIAGNOSTIC_MESSAGES.UNKNOWN,
    "Could not verify the CMS write-freeze state.",
  );
  assert.doesNotMatch(ui, /saveRedirectAction|savePostAction|Research|Publish|Apply/);
  assert.doesNotMatch(ui, /useEffect\s*\(/);
});

test("existing write-freeze module unchanged in contract", () => {
  const src = read("lib/cms/write-freeze.ts");
  assert.match(src, /export function assertCmsWritesAllowed/);
  assert.match(src, /export function isCmsWriteFreezeActive/);
  assert.equal(isCmsWriteFreezeActive({ [CMS_WRITE_FREEZE_ENV]: "1" }), true);
  assert.equal(isCmsWriteFreezeActive({ [CMS_WRITE_FREEZE_ENV]: "0" }), false);
});

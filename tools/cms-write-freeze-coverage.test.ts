import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  CMS_WRITE_FREEZE_CODE,
  CMS_WRITE_FREEZE_ENV,
  CMS_WRITE_FREEZE_MESSAGE,
  cmsWriteFreezeBlockedResult,
  isCmsWriteFreezeActive,
} from "../lib/cms/write-freeze";

const root = process.cwd();

function src(rel: string) {
  return readFileSync(path.join(root, rel), "utf8");
}

function sliceAfterExport(file: string, name: string, chars = 700) {
  const idx = file.indexOf(`export async function ${name}`);
  assert.ok(idx >= 0, `missing export ${name}`);
  return file.slice(idx, idx + chars);
}

test("canonical freeze code is snake_case cms_write_freeze", () => {
  assert.equal(CMS_WRITE_FREEZE_CODE, "cms_write_freeze");
  const blocked = cmsWriteFreezeBlockedResult();
  assert.equal(blocked.code, "cms_write_freeze");
  assert.equal(blocked.error, CMS_WRITE_FREEZE_MESSAGE);
  assert.doesNotMatch(blocked.error, /password|mysql|stack|ECONN|secret/i);
});

test("result unions include cms_write_freeze for AI SEO and Planning contracts", () => {
  for (const rel of [
    "lib/cms/ai-seo/explain.ts",
    "lib/cms/ai-seo/draft.ts",
    "lib/cms/ai-seo/research.ts",
    "lib/cms/seo-planning/writing-prompt.ts",
    "lib/cms/seo-planning/image-prompt.ts",
    "lib/cms/seo-planning/article-generation.ts",
    "lib/cms/seo-planning/handoff.ts",
  ]) {
    assert.match(src(rel), /"cms_write_freeze"/, rel);
  }
});

test("AI SEO / Planning actions return CMS_WRITE_FREEZE_CODE not a mismatched literal", () => {
  const ai = src("lib/cms/ai-seo-actions.ts");
  const planning = src("lib/cms/seo-planning-actions.ts");
  assert.match(ai, /CMS_WRITE_FREEZE_CODE/);
  assert.match(planning, /CMS_WRITE_FREEZE_CODE/);
  assert.doesNotMatch(ai, /code:\s*"cms_write_freeze"/);
  assert.doesNotMatch(planning, /code:\s*"cms_write_freeze"/);
  assert.match(ai, /explainSeoHealthFindingAction[\s\S]*?rejectIfCmsWriteFrozen/);
  assert.match(ai, /draftSeoTitleMetaAction[\s\S]*?rejectIfCmsWriteFrozen/);
  assert.match(ai, /researchUkContentOpportunitiesAction[\s\S]*?rejectIfCmsWriteFrozen/);
  assert.match(planning, /generateNewBlogArticlePreviewAction[\s\S]*?rejectIfCmsWriteFrozen/);
  assert.match(planning, /handoffSeoPlanningToBlogAction[\s\S]*?rejectIfCmsWriteFrozen/);
});

test("SEO Health accept/reopen gate freeze before persistence", () => {
  const health = src("lib/cms/seo-health-actions.ts");
  for (const name of ["acceptSeoHealthFindingAction", "reopenSeoHealthFindingAction"]) {
    const slice = sliceAfterExport(health, name, 900);
    const freezeAt = slice.indexOf("assertCmsWritesAllowed");
    const saveAt = slice.indexOf("saveSeoHealthState");
    assert.ok(freezeAt >= 0, `${name} missing assertCmsWritesAllowed`);
    assert.ok(saveAt >= 0, `${name} missing saveSeoHealthState`);
    assert.ok(freezeAt < saveAt, `${name} must freeze before saveSeoHealthState`);
    assert.match(slice, /requireAdminAction\("seo"\)/);
  }
});

test("Auth user CRUD gates freeze after auth and before mutate; login stays open", () => {
  const auth = src("lib/auth/actions.ts");
  assert.match(auth, /from "@\/lib\/cms\/write-freeze"/);
  for (const name of ["createUserAction", "updateUserAction", "deleteUserAction"]) {
    const slice = sliceAfterExport(auth, name, 900);
    assert.match(slice, /rejectIfCmsWriteFrozen|assertCmsWritesAllowed/);
    assert.match(slice, /requireAdminActor\("users_security"\)/);
    const actorAt = slice.search(/requireAdminActor/);
    const freezeAt = slice.search(/rejectIfCmsWriteFrozen|assertCmsWritesAllowed/);
    assert.ok(actorAt >= 0 && freezeAt > actorAt, `${name} freeze after RBAC`);
  }
  const login = sliceAfterExport(auth, "loginAction", 500);
  assert.doesNotMatch(login, /rejectIfCmsWriteFrozen|assertCmsWritesAllowed/);
  const list = sliceAfterExport(auth, "listUsersAction", 400);
  assert.doesNotMatch(list, /rejectIfCmsWriteFrozen|assertCmsWritesAllowed/);
});

test("Auth setUserActive / resetPassword / changeOwnPassword freeze before persistence", () => {
  const auth = src("lib/auth/actions.ts");

  const setActive = sliceAfterExport(auth, "setUserActiveAction", 700);
  assert.match(setActive, /requireAdminActor\("users_security"\)/);
  assert.match(setActive, /rejectIfCmsWriteFrozen/);
  assert.ok(
    setActive.search(/rejectIfCmsWriteFrozen/) < setActive.indexOf("updateAdminUser"),
    "setUserActiveAction must freeze before updateAdminUser",
  );
  assert.match(setActive, /You cannot disable your own account/);

  const reset = sliceAfterExport(auth, "resetUserPasswordAction", 2200);
  assert.match(reset, /requireAdminActor\("users_security"\)/);
  assert.match(reset, /rejectIfCmsWriteFrozen/);
  const resetFreeze = reset.search(/rejectIfCmsWriteFrozen/);
  const resetMutate = reset.indexOf("updateAdminPassword");
  assert.ok(resetMutate >= 0, "resetUserPasswordAction slice must include updateAdminPassword");
  assert.ok(resetFreeze < resetMutate, "resetUserPasswordAction must freeze before updateAdminPassword");
  assert.match(reset, /Use My Account to change your own password/);

  const own = sliceAfterExport(auth, "changeOwnPasswordAction", 2200);
  assert.match(own, /requireAdminActor\(\)/);
  assert.match(own, /rejectIfCmsWriteFrozen/);
  const ownFreeze = own.search(/rejectIfCmsWriteFrozen/);
  const ownMutate = own.indexOf("updateAdminPassword");
  assert.ok(ownMutate >= 0, "changeOwnPasswordAction slice must include updateAdminPassword");
  assert.ok(ownFreeze < ownMutate, "changeOwnPasswordAction must freeze before updateAdminPassword");
  // Freeze response uses shared sanitized message — no password material in contract helper.
  assert.match(auth, /CMS_WRITE_FREEZE_MESSAGE/);
  assert.doesNotMatch(CMS_WRITE_FREEZE_MESSAGE, /hash|bcrypt|token|secret|mysql/i);
});

test("Auth mutating exports all wire freeze; logout remains ungated", () => {
  const auth = src("lib/auth/actions.ts");
  for (const name of [
    "createUserAction",
    "updateUserAction",
    "deleteUserAction",
    "setUserActiveAction",
    "resetUserPasswordAction",
    "changeOwnPasswordAction",
  ]) {
    const slice = sliceAfterExport(auth, name, 500);
    assert.match(slice, /rejectIfCmsWriteFrozen/, name);
  }
  const logout = sliceAfterExport(auth, "logoutAction", 300);
  assert.doesNotMatch(logout, /rejectIfCmsWriteFrozen|assertCmsWritesAllowed/);
});

test("freeze env truthy/falsy matrix (restore isolation)", () => {
  const previous = process.env[CMS_WRITE_FREEZE_ENV];
  try {
    for (const on of ["1", "true", "yes", "on", "TRUE", "Yes", "ON"]) {
      process.env[CMS_WRITE_FREEZE_ENV] = on;
      assert.equal(isCmsWriteFreezeActive(), true, `expected on for ${on}`);
    }
    for (const off of ["", "0", "false", "no", "off", "maybe", undefined]) {
      if (off === undefined) delete process.env[CMS_WRITE_FREEZE_ENV];
      else process.env[CMS_WRITE_FREEZE_ENV] = off;
      assert.equal(isCmsWriteFreezeActive(), false, `expected off for ${String(off)}`);
    }
  } finally {
    if (previous === undefined) delete process.env[CMS_WRITE_FREEZE_ENV];
    else process.env[CMS_WRITE_FREEZE_ENV] = previous;
  }
});

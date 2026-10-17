import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  assertCmsWritesAllowed,
  CMS_WRITE_FREEZE_CODE,
  CMS_WRITE_FREEZE_ENV,
  CMS_WRITE_FREEZE_MESSAGE,
  cmsWriteFreezeBlockedResult,
  isCmsWriteFreezeActive,
  isCmsWriteFreezeError,
} from "../lib/cms/write-freeze";

test("write-freeze env parsing is fail-open unless explicitly enabled", () => {
  assert.equal(isCmsWriteFreezeActive({}), false);
  assert.equal(isCmsWriteFreezeActive({ [CMS_WRITE_FREEZE_ENV]: "" }), false);
  assert.equal(isCmsWriteFreezeActive({ [CMS_WRITE_FREEZE_ENV]: "0" }), false);
  assert.equal(isCmsWriteFreezeActive({ [CMS_WRITE_FREEZE_ENV]: "false" }), false);
  assert.equal(isCmsWriteFreezeActive({ [CMS_WRITE_FREEZE_ENV]: "1" }), true);
  assert.equal(isCmsWriteFreezeActive({ [CMS_WRITE_FREEZE_ENV]: "TRUE" }), true);
  assert.equal(isCmsWriteFreezeActive({ [CMS_WRITE_FREEZE_ENV]: "yes" }), true);
  assert.equal(isCmsWriteFreezeActive({ [CMS_WRITE_FREEZE_ENV]: "on" }), true);
});

test("assertCmsWritesAllowed throws typed freeze error when active", () => {
  assert.doesNotThrow(() => assertCmsWritesAllowed({ [CMS_WRITE_FREEZE_ENV]: "0" }));
  assert.throws(
    () => assertCmsWritesAllowed({ [CMS_WRITE_FREEZE_ENV]: "1" }),
    (error: unknown) => {
      assert.equal(isCmsWriteFreezeError(error), true);
      assert.equal((error as { code?: string }).code, CMS_WRITE_FREEZE_CODE);
      assert.equal((error as Error).message, CMS_WRITE_FREEZE_MESSAGE);
      return true;
    },
  );
});

test("cmsWriteFreezeBlockedResult is stable for Server Action responses", () => {
  const blocked = cmsWriteFreezeBlockedResult();
  assert.equal(blocked.ok, false);
  assert.equal(blocked.code, CMS_WRITE_FREEZE_CODE);
  assert.equal(blocked.error, CMS_WRITE_FREEZE_MESSAGE);
});

test("mutating CMS Server Actions and media mutations wire the freeze gate", () => {
  const root = process.cwd();
  const actions = readFileSync(path.join(root, "lib/cms/actions.ts"), "utf8");
  const planning = readFileSync(path.join(root, "lib/cms/seo-planning-actions.ts"), "utf8");
  const media = readFileSync(path.join(root, "app/api/sidhu/media/route.ts"), "utf8");
  const health = readFileSync(path.join(root, "lib/cms/seo-health-actions.ts"), "utf8");
  const auth = readFileSync(path.join(root, "lib/auth/actions.ts"), "utf8");

  for (const name of [
    "savePageAction",
    "saveSettingsAction",
    "savePostAction",
    "deletePostAction",
    "saveRedirectAction",
    "submitContactAction",
  ]) {
    const idx = actions.indexOf(`export async function ${name}`);
    assert.ok(idx >= 0, `missing ${name}`);
    const slice = actions.slice(idx, idx + 450);
    assert.match(slice, /rejectIfCmsWriteFrozen/);
  }

  assert.match(planning, /rejectIfCmsWriteFrozen/);
  assert.match(planning, /proceedSeoOpportunityToPlanningDraftAction[\s\S]*?rejectIfCmsWriteFrozen/);
  assert.match(planning, /handoffSeoPlanningToBlogAction[\s\S]*?rejectIfCmsWriteFrozen/);
  assert.match(media, /export async function POST[\s\S]*?rejectIfCmsWriteFrozen/);
  assert.match(media, /export async function DELETE[\s\S]*?rejectIfCmsWriteFrozen/);
  assert.match(media, /export async function PATCH[\s\S]*?rejectIfCmsWriteFrozen/);
  assert.match(health, /acceptSeoHealthFindingAction[\s\S]*?assertCmsWritesAllowed/);
  assert.match(health, /reopenSeoHealthFindingAction[\s\S]*?assertCmsWritesAllowed/);
  assert.match(auth, /createUserAction[\s\S]*?rejectIfCmsWriteFrozen/);
  assert.match(auth, /updateUserAction[\s\S]*?rejectIfCmsWriteFrozen/);
  assert.match(auth, /deleteUserAction[\s\S]*?rejectIfCmsWriteFrozen/);
  assert.match(auth, /setUserActiveAction[\s\S]*?rejectIfCmsWriteFrozen/);
  assert.match(auth, /resetUserPasswordAction[\s\S]*?rejectIfCmsWriteFrozen/);
  assert.match(auth, /changeOwnPasswordAction[\s\S]*?rejectIfCmsWriteFrozen/);
});

test("write-freeze module documents old-worker limitation", () => {
  const src = readFileSync(path.join(process.cwd(), "lib/cms/write-freeze.ts"), "utf8");
  assert.match(src, /Already-running v5 workers ignore this module/i);
  assert.match(src, /stop Hostinger Node|revoke DB writes/i);
});

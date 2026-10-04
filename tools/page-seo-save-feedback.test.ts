import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

const panel = readFileSync(path.join(process.cwd(), "components/sidhu/PageSeoPanel.tsx"), "utf8");
const sticky = readFileSync(path.join(process.cwd(), "components/sidhu/ui/StickyEditorBar.tsx"), "utf8");

test("SEO save feedback Banner remains in the Page SEO panel", () => {
  assert.match(panel, /\{message \? <Banner tone=\{message\.tone\}>\{message\.text\}<\/Banner> : null\}/);
  assert.equal((panel.match(/\{message \? <Banner/g) || []).length, 1);
  assert.match(panel, /StickyEditorBar/);
  assert.match(panel, /saveLabel="Save SEO"/);
});

test("Save SEO keeps Saving… label, lock, and returned page SEO state", () => {
  assert.match(panel, /savingLock/);
  assert.match(sticky, /Saving…/);
  assert.match(panel, /Save SEO/);
  assert.match(panel, /SEO settings saved\. Public metadata will refresh\./);
  assert.match(panel, /setSeo\(next\)/);
  assert.match(panel, /setSaved\(next\)/);
  assert.match(panel, /Could not save SEO settings/);
  assert.match(panel, /onNotice=\{notice\}/);
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

const panel = readFileSync(path.join(process.cwd(), "components/sidhu/PageSeoPanel.tsx"), "utf8");

test("SEO save success/error Banner is rendered next to Save SEO, not above SeoPreview", () => {
  const previewIdx = panel.indexOf("<SeoPreview");
  const saveIdx = panel.indexOf('{saving ? "Saving…" : "Save SEO"}');
  const bannerIdx = panel.indexOf("{message ? <Banner tone={message.tone}>{message.text}</Banner> : null}");

  assert.ok(previewIdx > 0);
  assert.ok(saveIdx > previewIdx);
  assert.ok(bannerIdx > saveIdx);
  assert.equal(panel.includes("{message ? <Banner"), true);
  assert.equal((panel.match(/\{message \? <Banner/g) || []).length, 1);
});

test("Save SEO keeps Saving… label, lock, and returned page SEO state", () => {
  assert.match(panel, /savingLock/);
  assert.match(panel, /Saving…/);
  assert.match(panel, /Save SEO/);
  assert.match(panel, /SEO settings saved\. Public metadata will refresh\./);
  assert.match(panel, /setSeo\(result\.settings\.pageSeo\[pageKey\]\)/);
  assert.match(panel, /Could not save SEO settings/);
  assert.match(panel, /onNotice=\{notice\}/);
});

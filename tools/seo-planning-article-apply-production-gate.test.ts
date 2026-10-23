/**
 * A2-4 — production wiring gate. Compile-time OFF; env/cookie/body cannot activate.
 */

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import {
  evaluateArticleApplyProductionGate,
  isArticleApplyProductionWiringEnabled,
  SEO_AI_ARTICLE_APPLY_PRODUCTION_GATE_CODE,
  SEO_AI_ARTICLE_APPLY_PRODUCTION_WIRING_ENABLED,
  SEO_AI_ARTICLE_APPLY_PRODUCTION_WIRING_SPEC,
} from "../lib/cms/seo-planning/article-apply-production-gate";

const root = process.cwd();

test("GATE: production wiring compile-time OFF", () => {
  assert.equal(SEO_AI_ARTICLE_APPLY_PRODUCTION_WIRING_ENABLED, false);
  assert.equal(isArticleApplyProductionWiringEnabled(), false);
});

test("GATE: env / cookie / body / url flags cannot open Apply wiring", () => {
  const result = evaluateArticleApplyProductionGate({
    envFlag: "1",
    cookieFlag: true,
    bodyFlag: { applyEnabled: true },
    urlFlag: "apply=1",
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.spec, SEO_AI_ARTICLE_APPLY_PRODUCTION_WIRING_SPEC);
  assert.equal(result.code, SEO_AI_ARTICLE_APPLY_PRODUCTION_GATE_CODE);
  assert.equal(result.envOverrideIgnored, true);
});

test("GATE: controlled Apply Server Action is fail-closed; production wiring stays OFF", () => {
  const actions = readFileSync(path.join(root, "lib/cms/seo-planning-actions.ts"), "utf8");
  assert.match(actions, /export async function applyNewBlogArticlePreviewToPrivateDraftAction/);
  assert.match(actions, /executeControlledSidhuNewBlogArticleApply/);
  // Direct unguarded local/memory Apply must not be called from the Server Action surface.
  assert.doesNotMatch(actions, /applyPrivateNewBlogArticleLocal\s*\(/);
  assert.doesNotMatch(actions, /applyPrivateArticleViaCmsAdapter\s*\(/);
  assert.doesNotMatch(actions, /createMemoryCmsTrustStores/);
  assert.doesNotMatch(actions, /applyGeneratedArticleToNewBlogDraftAction/);
  assert.doesNotMatch(actions, /SEO_AI_ARTICLE_APPLY_PRODUCTION_WIRING_ENABLED\s*=\s*true/);

  const uiPath = path.join(root, "components/sidhu/SeoPlanningArticleGeneration.tsx");
  if (existsSync(uiPath)) {
    const ui = readFileSync(uiPath, "utf8");
    assert.doesNotMatch(ui, /Apply to Private Blog Draft/i);
    assert.doesNotMatch(ui, /applyNewBlogArticlePreviewToPrivateDraftAction/);
    assert.doesNotMatch(ui, /applyPrivateArticleViaCmsAdapter/);
    assert.doesNotMatch(ui, /applyPrivateNewBlogArticleLocal/);
  }

  // Legacy unscoped article-apply.ts remains unused; controlled module is the Sidhu entry.
  assert.equal(existsSync(path.join(root, "lib/cms/seo-planning/article-apply.ts")), false);
  assert.equal(
    existsSync(path.join(root, "lib/cms/seo-planning/article-apply-controlled.ts")),
    true,
  );
});

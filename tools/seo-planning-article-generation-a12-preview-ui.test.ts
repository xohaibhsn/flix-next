/**
 * A1.2 Preview-Only RC — Admin UI: Generate → private Preview wiring.
 * Component/helper + source guards. Actions mocked; zero live OpenAI/Gemini calls.
 *
 * Blog Apply is intentionally NOT shipped in this release candidate: there is no
 * Apply button, no applyGeneratedArticleToNewBlogDraftAction import, and no Apply
 * confirmation flow anywhere in this component.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { test } from "node:test";
import {
  isArticleGenerationUiEligible,
  mapArticleGenerationUiError,
  SEO_AI_ARTICLE_UI_DIRTY_MESSAGE,
  SEO_AI_ARTICLE_UI_EDITORIAL_WARNING,
  SEO_AI_ARTICLE_UI_GENERATE_FAILED_MESSAGE,
  SEO_AI_ARTICLE_UI_INELIGIBLE_MESSAGE,
  SEO_AI_ARTICLE_UI_NOT_CONFIGURED_MESSAGE,
  SEO_AI_ARTICLE_UI_NOT_PUBLICATION_READY,
  SEO_AI_ARTICLE_UI_PREVIEW_ONLY_NOTE,
  SEO_AI_ARTICLE_UI_STALE_MESSAGE,
  SeoPlanningArticleGeneration,
  shouldInvalidateArticlePreview,
  type PrivateArticlePreviewUi,
} from "../components/sidhu/SeoPlanningArticleGeneration";
import { SeoPlanningDetail } from "../components/sidhu/SeoPlanningDetail";
import { sanitizeHtml } from "../lib/cms/html";
import { buildWritingBrief } from "../lib/cms/seo-planning/writing-brief";
import { readSeoPlanningEditorialEvidence } from "../lib/cms/seo-planning/editorial-evidence";
import type { SeoPlanningDraft } from "../lib/cms/types";

const root = path.join(__dirname, "..");

function read(rel: string) {
  return readFileSync(path.join(root, rel), "utf8");
}

function draft(overrides: Partial<SeoPlanningDraft> = {}): SeoPlanningDraft {
  return {
    id: "seoplan_a12",
    recommendation: "NEW_BLOG",
    workflowStatus: "CONTENT_NEEDED",
    fingerprint: "NEW_BLOG:a12-demo",
    topic: "UK Firestick buffering checklist",
    workingTitle: "Fix Firestick buffering in the UK",
    proposedSlug: "uk-firestick-buffering-checklist",
    targetPostId: null,
    matchedPublicUrl: "",
    restorePath: "",
    searchIntent: "TROUBLESHOOTING",
    linkedPostId: null,
    createdBy: "admin_1",
    createdAt: "2026-10-06T00:00:00.000Z",
    updatedAt: "2026-10-06T01:00:00.000Z",
    payload: {
      opportunity: {
        whyNow: "Evening congestion reports.",
        webEvidence: "Support pages mention Wi-Fi checks.",
        confidence: "HIGH",
        suggestedAngle: "Practical home checks",
        nextStep: "Draft article",
        gscEvidence: [],
      },
      workspace: {
        contentAngle: "Practical UK home-network checks",
        nextStep: "Draft a troubleshooting article",
        humanNotes: "No invented speed claims.",
      },
      sources: [],
    },
    ...overrides,
  };
}

function previewFixture(
  overrides: Partial<PrivateArticlePreviewUi> = {},
): PrivateArticlePreviewUi {
  return {
    spec: "a1-1",
    planningDraftId: "seoplan_a12",
    planningUpdatedAt: "2026-10-06T01:00:00.000Z",
    recommendation: "NEW_BLOG",
    writingFingerprint: "fp_a12",
    model: "gpt-blog-article-test",
    article: {
      title: "Fix Firestick buffering in the UK",
      excerpt: "A private AI draft excerpt.",
      html: "<p>Safe body</p><script>alert(1)</script>",
    },
    evidenceTrust: {
      publicationReady: false,
      evidencePackComplete: false,
      aiProse: "ai_generated_untrusted",
    },
    requiresHumanFactualReview: true,
    publicationReady: false,
    privatePreview: true,
    ...overrides,
  };
}

function renderArticleUi(
  props: Partial<ComponentProps<typeof SeoPlanningArticleGeneration>> = {},
) {
  const d = props.draft || draft();
  const brief = props.writingBrief || buildWritingBrief(d);
  return renderToStaticMarkup(
    createElement(SeoPlanningArticleGeneration, {
      draft: d,
      writingBrief: brief,
      featureEnabled: true,
      providerConfigured: true,
      dirty: false,
      mutationPending: false,
      archived: false,
      ...props,
    }),
  );
}

test("1. feature disabled → no active controls", () => {
  const html = renderArticleUi({ featureEnabled: false });
  assert.equal(html, "");
  const detail = renderToStaticMarkup(
    createElement(SeoPlanningDetail, {
      draft: draft(),
      targetPostTitle: null,
      aiArticleGenerationEnabled: false,
      openaiBlogArticleConfigured: true,
    }),
  );
  assert.doesNotMatch(detail, /AI Article Generation|Generate Article|Apply to Private Blog Draft/);
});

test("2. feature enabled and eligible → Generate displayed (private preview only)", () => {
  const html = renderArticleUi({ featureEnabled: true, providerConfigured: true });
  assert.match(html, /AI Article Generation/);
  assert.match(html, /Provider/);
  assert.match(html, /OpenAI/);
  assert.match(html, /Generate Article/);
  assert.match(html, /private editorial preview/i);
  assert.match(html, /UK Firestick buffering checklist/);
  assert.match(html, /Fix Firestick buffering in the UK/);
  assert.doesNotMatch(html, /Apply to Private Blog Draft/i);
});

test("3. provider unconfigured → Generate disabled", () => {
  const html = renderArticleUi({ providerConfigured: false });
  assert.match(html, /Generate Article/);
  assert.match(html, /disabled/);
  assert.match(html, new RegExp(SEO_AI_ARTICLE_UI_NOT_CONFIGURED_MESSAGE));
  const gate = isArticleGenerationUiEligible({
    featureEnabled: true,
    providerConfigured: false,
    draft: draft(),
    writingBrief: buildWritingBrief(draft()),
    archived: false,
    dirty: false,
    mutationPending: false,
  });
  assert.equal(gate.eligible, false);
  assert.equal(gate.reason, SEO_AI_ARTICLE_UI_NOT_CONFIGURED_MESSAGE);
});

test("4. REFRESH/RESTORE/INTERNAL_LINK → unavailable", () => {
  for (const recommendation of [
    "REFRESH_EXISTING",
    "RESTORE_HISTORICAL",
    "INTERNAL_LINK_ONLY",
  ] as const) {
    const d = draft({
      recommendation,
      targetPostId: recommendation === "REFRESH_EXISTING" ? "post_1" : null,
      matchedPublicUrl: recommendation === "REFRESH_EXISTING" ? "/blogs/demo/" : "",
      restorePath: recommendation === "RESTORE_HISTORICAL" ? "/old-path/" : "",
    });
    const html = renderArticleUi({ draft: d, writingBrief: buildWritingBrief(d) });
    assert.match(html, new RegExp(SEO_AI_ARTICLE_UI_INELIGIBLE_MESSAGE));
    assert.match(html, /disabled/);
    const gate = isArticleGenerationUiEligible({
      featureEnabled: true,
      providerConfigured: true,
      draft: d,
      writingBrief: buildWritingBrief(d),
      archived: false,
      dirty: false,
      mutationPending: false,
    });
    assert.equal(gate.eligible, false);
  }
});

test("5. archived Planning → unavailable", () => {
  const d = draft({
    archivedAt: "2026-10-07T00:00:00.000Z",
  });
  const html = renderArticleUi({
    draft: d,
    writingBrief: buildWritingBrief(d),
    archived: true,
  });
  assert.match(html, new RegExp(SEO_AI_ARTICLE_UI_INELIGIBLE_MESSAGE));
  assert.equal(
    isArticleGenerationUiEligible({
      featureEnabled: true,
      providerConfigured: true,
      draft: d,
      writingBrief: buildWritingBrief(d),
      archived: true,
      dirty: false,
      mutationPending: false,
    }).eligible,
    false,
  );
});

test("6. dirty Planning → Generate blocked", () => {
  const html = renderArticleUi({ dirty: true });
  assert.match(html, new RegExp(SEO_AI_ARTICLE_UI_DIRTY_MESSAGE));
  assert.match(html, /disabled/);
  assert.equal(
    isArticleGenerationUiEligible({
      featureEnabled: true,
      providerConfigured: true,
      draft: draft(),
      writingBrief: buildWritingBrief(draft()),
      archived: false,
      dirty: true,
      mutationPending: false,
    }).eligible,
    false,
  );
});

test("7. Generate wiring: action imported; no Apply button or Apply action import anywhere", () => {
  const ui = read("components/sidhu/SeoPlanningArticleGeneration.tsx");
  assert.match(ui, /generateNewBlogArticlePreviewAction/);
  assert.match(ui, /result\.blogSaved/);
  assert.match(ui, /Generate Article/);
  assert.doesNotMatch(ui, /applyGeneratedArticleToNewBlogDraftAction/);
  assert.doesNotMatch(ui, /applyGeneratedArticleToPrivateBlogDraft/);
  assert.doesNotMatch(ui, /Apply to Private Blog Draft/i);
  assert.doesNotMatch(ui, /window\.confirm/);
});

test("8. invalid/failed generation maps to safe error (no Apply error codes remain)", () => {
  assert.equal(
    mapArticleGenerationUiError({ code: "not_configured", error: "raw" }),
    SEO_AI_ARTICLE_UI_NOT_CONFIGURED_MESSAGE,
  );
  assert.equal(
    mapArticleGenerationUiError({ code: "ineligible", error: "raw" }),
    SEO_AI_ARTICLE_UI_INELIGIBLE_MESSAGE,
  );
  assert.equal(
    mapArticleGenerationUiError({
      code: "timeout",
      error: "Article generation timed out. Please try again.",
    }),
    "Article generation timed out. Please try again.",
  );
  // Unknown/invalid_response codes with secret-shaped text fall back to the
  // generic Generate-failed message — there is no Apply-specific error mapping.
  assert.equal(
    mapArticleGenerationUiError({
      code: "invalid_response",
      error: "SQLSTATE stack api_key=sk-secret Bearer xyz",
    }),
    SEO_AI_ARTICLE_UI_GENERATE_FAILED_MESSAGE,
  );
  // Apply-only error codes (blog_content_conflict, published_blocked, apply_conflict)
  // have no special-cased mapping in this RC — they fall through to the same
  // generic sanitized-error path as any other unrecognized code.
  assert.equal(
    mapArticleGenerationUiError({ code: "blog_content_conflict", error: "Some safe text" }),
    "Some safe text",
  );
  assert.equal(
    mapArticleGenerationUiError({ code: "apply_conflict", error: "" }),
    SEO_AI_ARTICLE_UI_GENERATE_FAILED_MESSAGE,
  );
});

test("9. preview HTML is sanitized / escaped safely", () => {
  const dirty = '<p>Hello</p><script>alert("x")</script><img src=x onerror=alert(1)>';
  const clean = sanitizeHtml(dirty);
  assert.doesNotMatch(clean, /<script/i);
  assert.doesNotMatch(clean, /onerror/i);
  const ui = read("components/sidhu/SeoPlanningArticleGeneration.tsx");
  assert.match(ui, /sanitizeHtml\(preview\.article\.html\)/);
  assert.match(ui, /dangerouslySetInnerHTML=\{\{\s*__html:\s*safeHtml\s*\}\}/);
  assert.match(ui, /Show HTML source/);
  // Source view uses React text children (auto-escaped), not raw HTML injection.
  assert.match(ui, /showHtmlSource[\s\S]*?<pre[\s\S]*?\{safeHtml\}/);
});

test("10. Planning changes invalidate previous preview", () => {
  const p = previewFixture();
  assert.equal(
    shouldInvalidateArticlePreview({
      preview: p,
      draft: draft(),
      archived: false,
      dirty: false,
    }),
    false,
  );
  assert.equal(
    shouldInvalidateArticlePreview({
      preview: p,
      draft: draft(),
      archived: false,
      dirty: true,
    }),
    true,
  );
  assert.equal(
    shouldInvalidateArticlePreview({
      preview: p,
      draft: draft({ updatedAt: "2026-10-06T02:00:00.000Z" }),
      archived: false,
      dirty: false,
    }),
    true,
  );
  assert.equal(
    shouldInvalidateArticlePreview({
      preview: p,
      draft: draft({ workflowStatus: "PLANNING" }),
      archived: false,
      dirty: false,
    }),
    true,
  );
  assert.equal(
    shouldInvalidateArticlePreview({
      preview: p,
      draft: draft({ recommendation: "REFRESH_EXISTING", targetPostId: "post_1" }),
      archived: false,
      dirty: false,
    }),
    true,
  );
  const ui = read("components/sidhu/SeoPlanningArticleGeneration.tsx");
  assert.match(ui, /shouldInvalidateArticlePreview/);
  assert.match(ui, /setPreview\(null\)/);
  assert.match(ui, /SEO_AI_ARTICLE_UI_STALE_MESSAGE/);
  assert.equal(SEO_AI_ARTICLE_UI_STALE_MESSAGE.length > 0, true);
});

test("11. preview-only messaging: editorial warning, not-publication-ready, preview-only note all render", () => {
  const ui = read("components/sidhu/SeoPlanningArticleGeneration.tsx");
  assert.match(ui, new RegExp(SEO_AI_ARTICLE_UI_EDITORIAL_WARNING.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(ui, new RegExp(SEO_AI_ARTICLE_UI_NOT_PUBLICATION_READY));
  assert.match(
    ui,
    new RegExp(SEO_AI_ARTICLE_UI_PREVIEW_ONLY_NOTE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
  );
  assert.doesNotMatch(ui, /Ready to Publish|Mark published|status:\s*"published"/);
  assert.doesNotMatch(ui, /Apply to Private Blog Draft/i);
  assert.doesNotMatch(ui, /applyGeneratedArticleToNewBlogDraftAction/);
});

test("12. publicationReady:false warnings are present on the preview contract and in source", () => {
  const p = previewFixture();
  assert.equal(p.publicationReady, false);
  assert.equal(p.evidenceTrust.publicationReady, false);
  assert.equal(p.requiresHumanFactualReview, true);
  assert.equal(p.privatePreview, true);
  const ui = read("components/sidhu/SeoPlanningArticleGeneration.tsx");
  assert.match(ui, /publicationReady:\s*false/);
});

test("13. no provider calls on render; this suite never imports the OpenAI transport directly", () => {
  const ui = read("components/sidhu/SeoPlanningArticleGeneration.tsx");
  const detail = read("components/sidhu/SeoPlanningDetail.tsx");
  const page = read("app/sidhu/(protected)/seo/planning/[id]/page.tsx");
  for (const src of [ui, detail, page]) {
    assert.doesNotMatch(src, /requestOpenAiBlogArticle|requestGemini|fetch\s*\(/);
  }
  assert.match(page, /isSeoAiArticleGenerationEnabled\(\)/);
  assert.match(page, /isOpenAiBlogArticleConfigured\(\)/);
  assert.doesNotMatch(page, /OPENAI_API_KEY|apiKey|generateNewBlogArticlePreview\(/);
  assert.doesNotMatch(ui, /OPENAI_API_KEY|apiKey|sk-/);
  // This suite exercises UI helpers/actions only — no live provider transport import.
  const thisFile = read("tools/seo-planning-article-generation-a12-preview-ui.test.ts");
  assert.doesNotMatch(thisFile, /from ["'].*blog-article-openai["']/);
  assert.doesNotMatch(thisFile, /requestOpenAiBlogArticle\s*\(/);
});

test("14. existing Writing Prompt / Handoff UI remains wired (unaffected by Apply omission)", () => {
  const detail = read("components/sidhu/SeoPlanningDetail.tsx");
  assert.match(detail, /SeoPlanningWritingPrompt/);
  assert.match(detail, /SeoPlanningContentHandoff/);
  assert.match(detail, /SeoPlanningArticleGeneration/);
  const html = renderToStaticMarkup(
    createElement(SeoPlanningDetail, {
      draft: draft(),
      targetPostTitle: null,
      geminiBlogPromptConfigured: true,
      openaiBlogPromptConfigured: true,
      aiArticleGenerationEnabled: true,
      openaiBlogArticleConfigured: true,
    }),
  );
  assert.match(html, /ChatGPT Writing Prompt/);
  assert.match(html, /Content Handoff/);
  assert.match(html, /AI Article Generation/);
  assert.match(html, /Create Blog Draft|Open Blog Draft/);
  assert.doesNotMatch(html, /Apply to Private Blog Draft/i);
});

test("15. production feature activation remains closed by default", () => {
  const config = read("lib/cms/ai-seo/config.ts");
  assert.match(config, /SEO_AI_ARTICLE_GENERATION_ENABLED/);
  assert.match(config, /Feature closed unless/);
  assert.match(config, /\.trim\(\) === "1"/);
  const detail = read("components/sidhu/SeoPlanningDetail.tsx");
  assert.match(detail, /aiArticleGenerationEnabled = false/);
  const actions = read("lib/cms/seo-planning-actions.ts");
  assert.match(actions, /isSeoAiArticleGenerationEnabled/);
  assert.match(actions, /feature_disabled/);
});

test("CONTENT_NEEDED gate: PLANNING workflow is ineligible", () => {
  const d = draft({ workflowStatus: "PLANNING" });
  const brief = buildWritingBrief(d);
  assert.equal(brief.providerEligible, false);
  assert.equal(
    isArticleGenerationUiEligible({
      featureEnabled: true,
      providerConfigured: true,
      draft: d,
      writingBrief: brief,
      archived: false,
      dirty: false,
      mutationPending: false,
    }).eligible,
    false,
  );
});

test("source wiring: detail mounts A1.2 near writing brief; page passes boolean gates only", () => {
  const detail = read("components/sidhu/SeoPlanningDetail.tsx");
  const briefIdx = detail.indexOf("<SeoPlanningWritingBrief");
  const articleIdx = detail.indexOf("<SeoPlanningArticleGeneration");
  const promptIdx = detail.indexOf("<SeoPlanningWritingPrompt");
  assert.ok(briefIdx > 0 && articleIdx > briefIdx && promptIdx > articleIdx);
  assert.match(detail, /featureEnabled=\{aiArticleGenerationEnabled\}/);
  assert.match(detail, /providerConfigured=\{openaiBlogArticleConfigured\}/);
  assert.match(detail, /mutationPending=\{pending \|\| suggestionBusy\}/);
  const page = read("app/sidhu/(protected)/seo/planning/[id]/page.tsx");
  assert.match(page, /aiArticleGenerationEnabled=\{isSeoAiArticleGenerationEnabled\(\)\}/);
  assert.match(page, /openaiBlogArticleConfigured=\{isOpenAiBlogArticleConfigured\(\)\}/);
});

test("eligible gate helper requires NEW_BLOG + CONTENT_NEEDED + configured + saved", () => {
  const d = draft();
  const brief = buildWritingBrief(d);
  assert.equal(brief.providerEligible, true);
  assert.equal(brief.taskType, "NEW_BLOG");
  assert.deepEqual(
    isArticleGenerationUiEligible({
      featureEnabled: true,
      providerConfigured: true,
      draft: d,
      writingBrief: brief,
      archived: false,
      dirty: false,
      mutationPending: false,
    }),
    { eligible: true, reason: "" },
  );
  assert.equal(
    isArticleGenerationUiEligible({
      featureEnabled: true,
      providerConfigured: true,
      draft: d,
      writingBrief: brief,
      archived: false,
      dirty: false,
      mutationPending: true,
    }).eligible,
    false,
  );
});

test("editorial-evidence module is importable from the UI test surface too", () => {
  const evidence = readSeoPlanningEditorialEvidence(draft().payload);
  // This fixture has no editorialEvidenceV1 payload — must resolve to a safe empty value, not throw.
  assert.equal(Array.isArray(evidence.entries), true);
  assert.equal(evidence.entries.length, 0);
});

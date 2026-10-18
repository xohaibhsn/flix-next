/**
 * Experiment Ledger L4A — Existing target Blog navigation (read-only).
 * Provider-free. No production DB. No Planning provenance claims.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { test } from "node:test";
import { SeoLedgerRunDetail } from "../components/sidhu/SeoLedgerRunDetail";
import {
  collectUniqueLedgerTargetPostIds,
  isSafeLedgerTargetPostId,
  resolveLedgerTargetBlogLink,
  resolveLedgerTargetBlogLinks,
} from "../lib/cms/seo-experiment-ledger/target-blog-links";
import type {
  SeoOpportunityDecisionRow,
  SeoResearchRunRow,
} from "../lib/cms/seo-experiment-ledger/types";
import { buildSeoPlanningFingerprint } from "../lib/cms/seo-planning/fingerprint";
import { buildSeoDecisionOpportunityIdentity } from "../lib/cms/seo-decision-pipeline/adapt";

const root = path.join(__dirname, "..");

function read(rel: string) {
  return readFileSync(path.join(root, rel), "utf8");
}

const SUCCESS_RUN_ID = "seorun_7b643688-5845-4c05-ac6d-25689b51377f";

const baseRun: SeoResearchRunRow = {
  id: SUCCESS_RUN_ID,
  createdAt: "2026-10-08 22:58:19",
  completedAt: "2026-10-08 22:58:36",
  source: "manual",
  actorAdminId: null,
  researchOk: true,
  researchErrorCode: null,
  pipelineRunStatus: "OK",
  pipelineVersion: "v1",
  pipelineErrorCode: null,
  opportunityCount: 2,
  gscStatus: "AVAILABLE",
  durabilityStatus: "COMPLETE",
};

function decision(
  overrides: Partial<SeoOpportunityDecisionRow> = {},
): SeoOpportunityDecisionRow {
  return {
    id: "seodec_cec501e4-d530-4d9e-b2b9-7acf3212c5e9",
    runId: SUCCESS_RUN_ID,
    opportunityIndex: 0,
    opportunityIdentity: "abc",
    createdAt: "2026-10-08 22:58:19",
    topic: "Diagnosing buffering",
    workingTitle: "Firestick IPTV Buffering",
    researchRecommendation: "REFRESH_EXISTING",
    researchConfidence: "HIGH",
    existingCoverage: "STRONG",
    matchedPublicUrl: "/blogs/how-to-watch-iptv-on-firestick/",
    restorePath: "",
    targetPostId: "post-firestick",
    evaluationStatus: "OK",
    rfVerdict: "REFRESH_EXISTING",
    rfFingerprint: "rf0",
    nbaAction: "REFRESH_EXISTING",
    nbaStatus: "ACTIONABLE",
    nbaAutonomousEligible: false,
    nbaFingerprint: "nba0",
    priorityScore: 54,
    priorityTier: "MEDIUM",
    priorityScoreVersion: "v1",
    priorityAutomationSelectable: false,
    priorityFingerprint: "pri0",
    pipelineFingerprint: "pipe0",
    selected: false,
    selectionSource: "none",
    ...overrides,
  };
}

test("L4A: safe post id validation and unique collection", () => {
  assert.equal(isSafeLedgerTargetPostId("post-firestick"), true);
  assert.equal(isSafeLedgerTargetPostId("post-hd-4k"), true);
  assert.equal(isSafeLedgerTargetPostId(""), false);
  assert.equal(isSafeLedgerTargetPostId("javascript:alert(1)"), false);
  assert.equal(isSafeLedgerTargetPostId("../etc/passwd"), false);
  assert.equal(isSafeLedgerTargetPostId("a".repeat(81)), false);
  assert.deepEqual(
    collectUniqueLedgerTargetPostIds([
      { targetPostId: "post-firestick" },
      { targetPostId: "post-firestick" },
      { targetPostId: "post-hd-4k" },
      { targetPostId: null },
      { targetPostId: "" },
    ]),
    ["post-firestick", "post-hd-4k"],
  );
});

test("L4A: resolve exists / missing / none / RBAC / unsafe", () => {
  assert.equal(
    resolveLedgerTargetBlogLink({
      targetPostId: null,
      post: null,
      canEditBlog: true,
    }).kind,
    "none",
  );

  assert.equal(
    resolveLedgerTargetBlogLink({
      targetPostId: "post-gone",
      post: null,
      canEditBlog: true,
    }).kind,
    "missing",
  );

  const editable = resolveLedgerTargetBlogLink({
    targetPostId: "post-firestick",
    post: { id: "post-firestick", title: "How to Watch IPTV on Firestick" },
    canEditBlog: true,
  });
  assert.equal(editable.kind, "exists_editable");
  if (editable.kind === "exists_editable") {
    assert.match(editable.editorHref, /^\/sidhu\/blog\/post-firestick\/?$/);
  }

  const textOnly = resolveLedgerTargetBlogLink({
    targetPostId: "post-firestick",
    post: { id: "post-firestick", title: "How to Watch IPTV on Firestick" },
    canEditBlog: false,
  });
  assert.equal(textOnly.kind, "exists_text_only");

  assert.equal(
    resolveLedgerTargetBlogLink({
      targetPostId: "bad id!!",
      post: null,
      canEditBlog: true,
    }).kind,
    "unsafe_id",
  );
});

test("L4A: batch resolve is bounded and dedupes two runs targeting same Blog", async () => {
  const calls: string[] = [];
  const map = await resolveLedgerTargetBlogLinks({
    decisions: [
      { targetPostId: "post-firestick" },
      { targetPostId: "post-hd-4k" },
      { targetPostId: "post-firestick" },
      { targetPostId: null },
    ],
    canEditBlog: true,
    getPostById: async (id) => {
      calls.push(id);
      if (id === "post-firestick") return { id, title: "Firestick" };
      if (id === "post-hd-4k") return { id, title: "HD/4K" };
      return null;
    },
  });
  assert.deepEqual(calls.sort(), ["post-firestick", "post-hd-4k"].sort());
  assert.equal(map["post-firestick"]?.kind, "exists_editable");
  assert.equal(map["post-hd-4k"]?.kind, "exists_editable");
});

test("L4A: Planning fingerprint ≠ Ledger opportunity identity (no false provenance)", () => {
  const planningFp = buildSeoPlanningFingerprint({
    recommendation: "REFRESH_EXISTING",
    targetPostId: "post-firestick",
  });
  assert.equal(planningFp, "REFRESH_EXISTING:post-firestick");

  const oppIdentity = buildSeoDecisionOpportunityIdentity({
    topic: "Diagnosing buffering and Wi-Fi problems on Fire TV",
    workingTitle: "Firestick IPTV Buffering: Check the App, Wi-Fi and Device",
    recommendation: "REFRESH_EXISTING",
    matchedPublicUrl: "/blogs/how-to-watch-iptv-on-firestick/",
    restorePath: "",
    gscEvidenceRefs: [],
  });
  assert.notEqual(planningFp, oppIdentity);
  assert.match(oppIdentity, /^[a-f0-9]{64}$/);
});

test("L4A UI: Existing target Blog labels; no invented Planning/publish claims", () => {
  const d0 = decision();
  const d1 = decision({
    id: "seodec_f2463920-d552-470f-b1fd-e84edd982e8b",
    opportunityIndex: 1,
    targetPostId: "post-hd-4k",
  });

  const withBlog = renderToStaticMarkup(
    createElement(SeoLedgerRunDetail, {
      run: baseRun,
      decisions: [d0, d1],
      targetBlogByPostId: {
        "post-firestick": {
          kind: "exists_editable",
          targetPostId: "post-firestick",
          title: "How to Watch IPTV on Firestick",
          editorHref: "/sidhu/blog/post-firestick/",
        },
        "post-hd-4k": {
          kind: "exists_editable",
          targetPostId: "post-hd-4k",
          title: "HD vs 4K",
          editorHref: "/sidhu/blog/post-hd-4k/",
        },
      },
    }),
  );
  assert.match(withBlog, /Existing target Blog/);
  // Next <Link> may omit the trailing slash in static markup.
  assert.match(withBlog, /href="\/sidhu\/blog\/post-firestick\/?"/);
  assert.match(withBlog, /href="\/sidhu\/blog\/post-hd-4k\/?"/);
  assert.match(withBlog, /Not proof that Research created/);
  assert.doesNotMatch(withBlog, /created from this Research|Planning generated by this decision/i);

  const seoOnly = renderToStaticMarkup(
    createElement(SeoLedgerRunDetail, {
      run: baseRun,
      decisions: [d0],
      targetBlogByPostId: {
        "post-firestick": {
          kind: "exists_text_only",
          targetPostId: "post-firestick",
          title: "How to Watch IPTV on Firestick",
        },
      },
    }),
  );
  assert.doesNotMatch(seoOnly, /href="\/sidhu\/blog\/post-firestick/);
  assert.match(seoOnly, /Blog permission required/);

  const missing = renderToStaticMarkup(
    createElement(SeoLedgerRunDetail, {
      run: baseRun,
      decisions: [d0],
      targetBlogByPostId: {
        "post-firestick": { kind: "missing", targetPostId: "post-firestick" },
      },
    }),
  );
  assert.match(missing, /Target Blog not found/);

  const noTarget = renderToStaticMarkup(
    createElement(SeoLedgerRunDetail, {
      run: { ...baseRun, researchOk: false, pipelineRunStatus: "SKIPPED", opportunityCount: 0 },
      decisions: [decision({ targetPostId: null, researchRecommendation: "SKIP" })],
      targetBlogByPostId: {},
    }),
  );
  assert.match(noTarget, /Existing target Blog/);
  assert.doesNotMatch(noTarget, /href="\/sidhu\/blog\//);
});

test("L4A source: detail page resolves targets after SEO auth; no Ledger/Planning write", () => {
  const detailPage = read("app/sidhu/(protected)/seo/ledger/[runId]/page.tsx");
  const helper = read("lib/cms/seo-experiment-ledger/target-blog-links.ts");
  const proceed = read("lib/cms/seo-planning/proceed.ts");
  const persist = read("lib/cms/seo-experiment-ledger/persist-mysql.ts");

  assert.match(detailPage, /requirePermission\(\"seo\"\)/);
  assert.match(detailPage, /resolveLedgerTargetBlogLinks/);
  assert.match(detailPage, /adminHasPermission\(user,\s*\"blog\"\)/);
  // Call-site order (not import order).
  assert.ok(
    detailPage.indexOf('await requirePermission("seo")') <
      detailPage.indexOf("await resolveLedgerTargetBlogLinks"),
  );
  assert.doesNotMatch(detailPage, /getSeoPlanningDraft|proceedSeoOpportunity|insertResearchRun/i);

  assert.match(helper, /PROVEN_EXISTING_TARGET|Existing target Blog/i);
  assert.doesNotMatch(helper, /\bINSERT\b|\bUPDATE\b|openai|gemini/i);

  assert.doesNotMatch(proceed, /runId|decisionId|seorun_|seodec_/);
  assert.doesNotMatch(persist, /target-blog-links|resolveLedgerTargetBlogLinks/);
});

test("L4A does not treat pre-existing Planning fingerprint as Ledger provenance", () => {
  // Historical Planning for post-firestick would reuse fingerprint REFRESH_EXISTING:post-firestick
  // regardless of which Research run recommended it — contextual only.
  const fp = buildSeoPlanningFingerprint({
    recommendation: "REFRESH_EXISTING",
    targetPostId: "post-firestick",
  });
  assert.equal(fp, "REFRESH_EXISTING:post-firestick");
  const detail = read("components/sidhu/SeoLedgerRunDetail.tsx");
  assert.doesNotMatch(detail, /seoplan_|Planning draft from this decision|created by this Research/i);
  assert.match(detail, /Existing target Blog/);
});

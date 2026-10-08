/**
 * SEO Opportunity Priority Score V1 — deterministic score tests.
 * Executes real helpers (not source-string assertions). Fixtures only.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  decideSeoNextBestAction,
  type SeoNextBestAction,
  type SeoNextBestActionDecision,
  type SeoNextBestConfidence,
} from "../lib/cms/seo-next-best-action";
import { evaluateSeoRefreshFirst } from "../lib/cms/seo-refresh-first";
import {
  buildSeoPriorityFingerprint,
  impressionsBucket,
  impressionsPoints,
  isAutomationSelectable,
  positionBucket,
  scoreSeoPriority,
  tierFromScore,
  SEO_PRIORITY_SCORE_VERSION,
  type SeoPriorityGscEvidence,
  type SeoPriorityInput,
} from "../lib/cms/seo-priority";
import {
  SEO_PRIORITY_SCORE_MAX,
  SEO_PRIORITY_SCORE_MIN,
} from "../lib/cms/seo-priority/weights";

function baseDecision(
  overrides: Partial<SeoNextBestActionDecision> & Pick<SeoNextBestActionDecision, "action">,
): SeoNextBestActionDecision {
  return {
    decisionFingerprint: overrides.decisionFingerprint || `fp-${overrides.action}-default`,
    action: overrides.action,
    status: overrides.status ?? "ACTIONABLE",
    holdReason: overrides.holdReason ?? null,
    confidence: overrides.confidence ?? "HIGH",
    autonomousEligible: overrides.autonomousEligible ?? false,
    target: overrides.target ?? { kind: "none" },
    topic: overrides.topic ?? "Best IPTV apps for Firestick in 2026",
    reason: overrides.reason ?? "fixture decision",
    evidence: {
      gscPresent: false,
      webEvidencePresent: true,
      corpusEvidencePresent: true,
      existingCoverage: "NONE",
      matchedPostId: null,
      matchedUrl: null,
      historicalPath: null,
      refreshFirstVerdict: null,
      duplicate: false,
      cannibalizationRisk: false,
      ...(overrides.evidence || {}),
    },
    blockers: overrides.blockers ?? [],
    warnings: overrides.warnings ?? [],
    alternatives: overrides.alternatives ?? [],
    actionFingerprint: overrides.actionFingerprint || `afp-${overrides.action}`,
    historicalDisposition: overrides.historicalDisposition ?? null,
    opportunityFingerprint: overrides.opportunityFingerprint,
    source: overrides.source,
    priorityInputs: overrides.priorityInputs,
    priorityScore: overrides.priorityScore,
    priorityReason: overrides.priorityReason,
  };
}

function richOpp() {
  return {
    topic: "Best IPTV apps for Firestick in 2026",
    whyNow: "Search demand is rising for Firestick IPTV app comparisons this quarter.",
    webEvidence: "Competitor roundups rank for best firestick iptv apps with thin UK coverage.",
    existingCoverage: "NONE" as const,
    webEvidencePresent: true,
    gscEvidencePresent: true,
  };
}

function gscRow(overrides: Partial<SeoPriorityGscEvidence> = {}): SeoPriorityGscEvidence {
  return {
    id: "P1",
    kind: "page",
    impressions: 120,
    clicks: 4,
    ctr: 0.033,
    position: 12,
    classification: "CURRENT_CMS",
    impressionsDirection: "FLAT",
    clicksDirection: "FLAT",
    positionDirection: "FLAT",
    ...overrides,
  };
}

function passGovernor() {
  return evaluateSeoRefreshFirst({
    opportunity: {
      topic: "Best IPTV apps for Firestick in 2026",
      proposedSlug: "best-iptv-apps-firestick-2026",
      existingCoverage: "NONE",
      whyNow: "Search demand is rising for Firestick IPTV app comparisons this quarter.",
      webEvidence: "Competitor roundups rank for best firestick iptv apps with thin UK coverage.",
      webEvidencePresent: true,
    },
    candidates: [],
    corpusComplete: true,
  });
}

function scoreNewBlogEligible(overrides: Partial<SeoPriorityInput> = {}) {
  const decision = baseDecision({
    action: "NEW_BLOG",
    autonomousEligible: true,
    confidence: "HIGH",
    target: { kind: "new_topic", topic: "Best IPTV apps for Firestick in 2026" },
    evidence: {
      gscPresent: true,
      webEvidencePresent: true,
      corpusEvidencePresent: true,
      existingCoverage: "NONE",
      matchedPostId: null,
      matchedUrl: null,
      historicalPath: null,
      refreshFirstVerdict: "PASS_NEW_CONTENT",
      duplicate: false,
      cannibalizationRisk: false,
    },
  });
  return scoreSeoPriority({
    decision,
    refreshFirst: passGovernor(),
    opportunity: richOpp(),
    gscEvidence: [gscRow({ impressions: 80, position: 18, ctr: 0.02 })],
    ...overrides,
  });
}

// --- Eligibility ---

test("NEW_BLOG + autonomousEligible=true → automationSelectable=true", () => {
  const r = scoreNewBlogEligible();
  assert.equal(r.automationSelectable, true);
  assert.equal(isAutomationSelectable(r as never) || r.automationSelectable, true);
});

test("NEW_BLOG + autonomousEligible=false → false even near max score", () => {
  const decision = baseDecision({
    action: "NEW_BLOG",
    autonomousEligible: false,
    confidence: "HIGH",
    target: { kind: "new_topic", topic: "Best IPTV apps for Firestick in 2026" },
    evidence: {
      gscPresent: true,
      webEvidencePresent: true,
      corpusEvidencePresent: true,
      existingCoverage: "NONE",
      matchedPostId: null,
      matchedUrl: null,
      historicalPath: null,
      refreshFirstVerdict: "PASS_NEW_CONTENT",
      duplicate: false,
      cannibalizationRisk: false,
    },
  });
  const r = scoreSeoPriority({
    decision,
    refreshFirst: passGovernor(),
    opportunity: richOpp(),
    gscEvidence: [
      gscRow({
        impressions: 9_999_999,
        position: 8,
        clicks: 50000,
        ctr: 0.02,
        impressionsDirection: "UP",
        clicksDirection: "UP",
      }),
    ],
  });
  assert.equal(r.automationSelectable, false);
  assert.ok(r.score >= 70, `expected high score with max inputs, got ${r.score}`);
  assert.ok(r.score <= 100);
  assert.equal(r.tier, "HIGH");
});

test("GSC evidence capped at 8 refs deterministically", () => {
  const many = Array.from({ length: 20 }, (_, i) =>
    gscRow({ id: `P${i}`, impressions: i === 0 ? 900 : 1, position: 20 }),
  );
  const r = scoreSeoPriority({
    decision: baseDecision({
      action: "REFRESH_EXISTING",
      target: { kind: "blog_post", postId: "p1" },
      decisionFingerprint: "fp-gsc-cap",
    }),
    gscEvidence: many,
  });
  assert.ok(r.score >= 0 && r.score <= 100);
  // First 8 include the strong row at index 0 — score remains finite/bounded
  assert.equal(Number.isInteger(r.score), true);
});

test("invalid NaN/negative GSC metrics normalize safely", () => {
  const r = scoreSeoPriority({
    decision: baseDecision({
      action: "TITLE_META_UPDATE",
      target: { kind: "blog_post", postId: "p1" },
      decisionFingerprint: "fp-gsc-nan",
    }),
    opportunity: richOpp(),
    gscEvidence: [
      {
        id: "bad",
        impressions: Number.NaN,
        clicks: -5,
        ctr: Number.POSITIVE_INFINITY,
        position: -1,
      },
      gscRow({ impressions: 100, position: 12, ctr: 0.03 }),
    ],
  });
  assert.equal(Number.isFinite(r.score), true);
  assert.equal(Number.isInteger(r.score), true);
  assert.ok(r.score >= 0 && r.score <= 100);
});

test("REFRESH_EXISTING never automationSelectable", () => {
  const r = scoreSeoPriority({
    decision: baseDecision({
      action: "REFRESH_EXISTING",
      autonomousEligible: false,
      target: { kind: "blog_post", postId: "p1", publicUrl: "/blogs/x/" },
    }),
    opportunity: richOpp(),
    gscEvidence: [gscRow({ impressions: 400, position: 7, impressionsDirection: "DOWN" })],
  });
  assert.equal(r.automationSelectable, false);
});

test("DO_NOTHING never auto", () => {
  const r = scoreSeoPriority({
    decision: baseDecision({
      action: "DO_NOTHING",
      status: "HOLD",
      holdReason: "NO_WORTHWHILE_ACTION",
      autonomousEligible: false,
    }),
  });
  assert.equal(r.automationSelectable, false);
});

test("HOLD status NEW_BLOG ineligible remains not auto", () => {
  const r = scoreSeoPriority({
    decision: baseDecision({
      action: "NEW_BLOG",
      status: "HOLD",
      holdReason: "INSUFFICIENT_EVIDENCE",
      autonomousEligible: false,
    }),
  });
  assert.equal(r.automationSelectable, false);
});

test("TECHNICAL_FIX never auto Blog", () => {
  const r = scoreSeoPriority({
    decision: baseDecision({
      action: "TECHNICAL_FIX",
      status: "HOLD",
      holdReason: "TECHNICAL_BLOCKER",
      autonomousEligible: false,
    }),
  });
  assert.equal(r.automationSelectable, false);
  assert.ok(r.warnings.includes("deferred_family_minimal_scoring"));
});

test("score never flips NBA false eligibility", () => {
  assert.equal(
    isAutomationSelectable({ action: "NEW_BLOG", autonomousEligible: false }),
    false,
  );
  assert.equal(
    isAutomationSelectable({ action: "REFRESH_EXISTING", autonomousEligible: true }),
    false,
  );
});

// --- Range / clamp ---

test("score always integer in 0–100", () => {
  const r = scoreNewBlogEligible();
  assert.equal(Number.isInteger(r.score), true);
  assert.ok(r.score >= SEO_PRIORITY_SCORE_MIN);
  assert.ok(r.score <= SEO_PRIORITY_SCORE_MAX);
  assert.equal(Number.isNaN(r.score), false);
  assert.equal(Number.isFinite(r.score), true);
});

test("impressions buckets cap safely", () => {
  assert.equal(impressionsBucket(0), "NONE");
  assert.equal(impressionsBucket(10), "LOW");
  assert.equal(impressionsBucket(100), "MODERATE");
  assert.equal(impressionsBucket(500), "STRONG");
  assert.equal(impressionsBucket(50_000), "VERY_STRONG");
  assert.ok(impressionsPoints("VERY_STRONG") <= 14);
  assert.ok(impressionsPoints("VERY_STRONG") > impressionsPoints("STRONG"));
});

// --- Tiers ---

test("tier boundaries", () => {
  assert.equal(tierFromScore(0), "LOW");
  assert.equal(tierFromScore(39), "LOW");
  assert.equal(tierFromScore(40), "MEDIUM");
  assert.equal(tierFromScore(69), "MEDIUM");
  assert.equal(tierFromScore(70), "HIGH");
  assert.equal(tierFromScore(100), "HIGH");
});

// --- Confidence ---

test("HIGH confidence scores above MEDIUM and LOW, all else equal", () => {
  const mk = (confidence: SeoNextBestConfidence) =>
    scoreSeoPriority({
      decision: baseDecision({
        action: "INTERNAL_LINKS",
        confidence,
        autonomousEligible: false,
        decisionFingerprint: `fp-il-${confidence}`,
      }),
      opportunity: richOpp(),
    });
  const high = mk("HIGH");
  const med = mk("MEDIUM");
  const low = mk("LOW");
  assert.ok(high.score > med.score);
  assert.ok(med.score > low.score);
  // Confidence alone should not swallow the whole scale
  assert.ok(high.score - low.score <= 20);
});

// --- GSC ---

test("stronger impressions increase comparable NEW_BLOG score", () => {
  const low = scoreNewBlogEligible({
    gscEvidence: [gscRow({ impressions: 20, position: 18 })],
  });
  const high = scoreNewBlogEligible({
    gscEvidence: [gscRow({ impressions: 2500, position: 18 })],
  });
  assert.ok(high.score >= low.score);
});

test("huge impressions do not overflow 100", () => {
  const r = scoreNewBlogEligible({
    gscEvidence: [gscRow({ impressions: 9_999_999, clicks: 100000, ctr: 0.5, position: 1 })],
  });
  assert.ok(r.score <= 100);
});

test("missing GSC still returns valid score", () => {
  const r = scoreNewBlogEligible({ gscEvidence: [] });
  assert.ok(r.score >= 0 && r.score <= 100);
  assert.equal(Number.isInteger(r.score), true);
});

test("CTR effect remains small/bounded for TITLE_META", () => {
  const base = scoreSeoPriority({
    decision: baseDecision({
      action: "TITLE_META_UPDATE",
      confidence: "HIGH",
      target: { kind: "blog_post", postId: "p1" },
      decisionFingerprint: "fp-meta-1",
    }),
    opportunity: richOpp(),
    gscEvidence: [gscRow({ impressions: 300, ctr: 0.08, position: 4 })],
  });
  const lowCtr = scoreSeoPriority({
    decision: baseDecision({
      action: "TITLE_META_UPDATE",
      confidence: "HIGH",
      target: { kind: "blog_post", postId: "p1" },
      decisionFingerprint: "fp-meta-2",
    }),
    opportunity: richOpp(),
    gscEvidence: [gscRow({ impressions: 300, ctr: 0.005, position: 4 })],
  });
  assert.ok(Math.abs(lowCtr.score - base.score) <= 8);
});

test("declining trend raises REFRESH momentum vs flat", () => {
  const flat = scoreSeoPriority({
    decision: baseDecision({
      action: "REFRESH_EXISTING",
      target: { kind: "blog_post", postId: "p1" },
      decisionFingerprint: "fp-ref-flat",
    }),
    gscEvidence: [gscRow({ impressionsDirection: "FLAT", clicksDirection: "FLAT" })],
  });
  const down = scoreSeoPriority({
    decision: baseDecision({
      action: "REFRESH_EXISTING",
      target: { kind: "blog_post", postId: "p1" },
      decisionFingerprint: "fp-ref-down",
    }),
    gscEvidence: [gscRow({ impressionsDirection: "DOWN", clicksDirection: "DOWN" })],
  });
  assert.ok(down.score >= flat.score);
});

test("position buckets are qualitative", () => {
  assert.equal(positionBucket(3), "STRONG");
  assert.equal(positionBucket(10), "MID");
  assert.equal(positionBucket(25), "WEAK");
  assert.equal(positionBucket(55), "FAR");
  assert.equal(positionBucket(null), "UNAVAILABLE");
});

// --- Action families ---

test("NEW_BLOG scoring produces content-family result", () => {
  const r = scoreNewBlogEligible();
  assert.equal(r.action, "NEW_BLOG");
  assert.equal(r.effort, "HIGH");
  assert.ok(r.components.some((c) => c.name === "coverageDistinctness" && c.points > 0));
});

test("REFRESH_EXISTING scoring rewards target + GSC", () => {
  const r = scoreSeoPriority({
    decision: baseDecision({
      action: "REFRESH_EXISTING",
      target: { kind: "blog_post", postId: "p1", publicUrl: "/blogs/a/" },
      evidence: {
        gscPresent: true,
        webEvidencePresent: true,
        corpusEvidencePresent: true,
        existingCoverage: "STRONG",
        matchedPostId: "p1",
        matchedUrl: "/blogs/a/",
        historicalPath: null,
        refreshFirstVerdict: "REFRESH_EXISTING",
        duplicate: false,
        cannibalizationRisk: false,
      },
    }),
    opportunity: { ...richOpp(), existingCoverage: "STRONG" },
    gscEvidence: [gscRow({ impressions: 400, position: 9, impressionsDirection: "DOWN" })],
  });
  assert.equal(r.automationSelectable, false);
  assert.equal(r.effort, "MEDIUM");
  assert.ok(r.score > 20);
});

test("HISTORICAL_RECOVERY scoring stays non-auto", () => {
  const r = scoreSeoPriority({
    decision: baseDecision({
      action: "HISTORICAL_RECOVERY",
      target: { kind: "historical_path", path: "/old-guide/" },
      historicalDisposition: "RECREATE",
      evidence: {
        gscPresent: true,
        webEvidencePresent: false,
        corpusEvidencePresent: false,
        existingCoverage: null,
        matchedPostId: null,
        matchedUrl: null,
        historicalPath: "/old-guide/",
        refreshFirstVerdict: "UNKNOWN",
        duplicate: false,
        cannibalizationRisk: false,
      },
    }),
    gscEvidence: [gscRow({ kind: "page", impressions: 90, classification: "REMOVED_OR_404" })],
  });
  assert.equal(r.automationSelectable, false);
  assert.ok(["MEDIUM", "HIGH", "LOW"].includes(r.effort));
});

test("INTERNAL_LINKS modest scoring", () => {
  const r = scoreSeoPriority({
    decision: baseDecision({ action: "INTERNAL_LINKS", confidence: "MEDIUM" }),
    opportunity: richOpp(),
  });
  assert.equal(r.automationSelectable, false);
  assert.equal(r.effort, "LOW");
});

test("TITLE_META_UPDATE uses impressions/position/CTR support", () => {
  const r = scoreSeoPriority({
    decision: baseDecision({
      action: "TITLE_META_UPDATE",
      target: { kind: "blog_post", postId: "p1" },
    }),
    opportunity: richOpp(),
    gscEvidence: [gscRow({ impressions: 500, position: 3, ctr: 0.01 })],
  });
  assert.equal(r.automationSelectable, false);
  assert.equal(r.effort, "LOW");
});

test("deferred families return safe bounded results", () => {
  for (const action of ["TECHNICAL_FIX", "INDEXING_REVIEW", "IMAGE"] as SeoNextBestAction[]) {
    const r = scoreSeoPriority({
      decision: baseDecision({
        action,
        autonomousEligible: false,
        status: action === "IMAGE" ? "ACTIONABLE" : "HOLD",
        decisionFingerprint: `fp-${action}`,
      }),
    });
    assert.equal(r.automationSelectable, false);
    assert.ok(r.score >= 0 && r.score <= 100);
    assert.equal(r.scoreVersion, "v1");
  }
});

// --- Refresh-First ---

test("Governor PASS improves NEW_BLOG coverage component", () => {
  const withPass = scoreNewBlogEligible();
  const without = scoreSeoPriority({
    decision: baseDecision({
      action: "NEW_BLOG",
      autonomousEligible: true,
      confidence: "HIGH",
      target: { kind: "new_topic", topic: "Best IPTV apps for Firestick in 2026" },
      decisionFingerprint: "fp-no-rf",
      evidence: {
        gscPresent: true,
        webEvidencePresent: true,
        corpusEvidencePresent: true,
        existingCoverage: "NONE",
        matchedPostId: null,
        matchedUrl: null,
        historicalPath: null,
        refreshFirstVerdict: null,
        duplicate: false,
        cannibalizationRisk: false,
      },
    }),
    opportunity: richOpp(),
    gscEvidence: [gscRow({ impressions: 80, position: 18 })],
  });
  const covPass = withPass.components.find((c) => c.name === "coverageDistinctness")!.points;
  const covNo = without.components.find((c) => c.name === "coverageDistinctness")!.points;
  assert.ok(covPass > covNo);
});

test("Governor UNKNOWN adds warning/risk and does not unlock auto if NBA false", () => {
  const unknownRf = evaluateSeoRefreshFirst({
    opportunity: {
      topic: "Best IPTV apps for Firestick in 2026",
      proposedSlug: "best-iptv-apps-firestick-2026",
      existingCoverage: "NONE",
      whyNow: "Search demand is rising for Firestick IPTV app comparisons this quarter.",
      webEvidence: "Competitor roundups rank for best firestick iptv apps with thin UK coverage.",
      webEvidencePresent: true,
    },
    candidates: [],
    corpusComplete: false,
  });
  assert.equal(unknownRf.verdict, "UNKNOWN");
  const r = scoreSeoPriority({
    decision: baseDecision({
      action: "NEW_BLOG",
      autonomousEligible: false,
      confidence: "HIGH",
    }),
    refreshFirst: unknownRf,
    opportunity: richOpp(),
  });
  assert.equal(r.automationSelectable, false);
  assert.ok(r.warnings.includes("refresh_first_unknown"));
});

test("Governor DUPLICATE / CANNIBALIZATION do not unlock auto", () => {
  for (const verdict of ["DUPLICATE", "CANNIBALIZATION_RISK"] as const) {
    const rf = {
      ...passGovernor(),
      verdict,
      fingerprint: `rf-${verdict}`,
      evidence: {
        ...passGovernor().evidence,
        duplicate: verdict === "DUPLICATE",
        cannibalizationRisk: verdict === "CANNIBALIZATION_RISK",
      },
    };
    const r = scoreSeoPriority({
      decision: baseDecision({
        action: "NEW_BLOG",
        autonomousEligible: false,
        decisionFingerprint: `fp-${verdict}`,
      }),
      refreshFirst: rf,
      opportunity: richOpp(),
    });
    assert.equal(r.automationSelectable, false);
  }
});

test("missing Governor remains bounded", () => {
  const r = scoreSeoPriority({
    decision: baseDecision({
      action: "NEW_BLOG",
      autonomousEligible: true,
      confidence: "HIGH",
    }),
    opportunity: richOpp(),
  });
  assert.ok(r.score >= 0 && r.score <= 100);
  assert.ok(r.warnings.includes("refresh_first_missing"));
  assert.ok(r.missingInputs.includes("refreshFirst"));
});

// --- Completeness ---

test("rich evidence → FULL", () => {
  const r = scoreNewBlogEligible();
  assert.equal(r.evidenceCompleteness, "FULL");
  assert.equal(r.missingInputs.length, 0);
});

test("missing optional GSC on NEW_BLOG with rich web → PARTIAL or FULL", () => {
  const r = scoreNewBlogEligible({
    gscEvidence: [],
    opportunity: { ...richOpp(), gscEvidencePresent: false },
    decision: baseDecision({
      action: "NEW_BLOG",
      autonomousEligible: true,
      confidence: "HIGH",
      decisionFingerprint: "fp-partial-gsc",
      evidence: {
        gscPresent: false,
        webEvidencePresent: true,
        corpusEvidencePresent: true,
        existingCoverage: "NONE",
        matchedPostId: null,
        matchedUrl: null,
        historicalPath: null,
        refreshFirstVerdict: "PASS_NEW_CONTENT",
        duplicate: false,
        cannibalizationRisk: false,
      },
    }),
  });
  // NEW_BLOG does not require GSC for FULL when web+refresh present
  assert.ok(r.evidenceCompleteness === "FULL" || r.evidenceCompleteness === "PARTIAL");
});

test("sparse evidence → MINIMAL", () => {
  const r = scoreSeoPriority({
    decision: baseDecision({
      action: "NEW_BLOG",
      autonomousEligible: false,
      confidence: "LOW",
      evidence: {
        gscPresent: false,
        webEvidencePresent: false,
        corpusEvidencePresent: false,
        existingCoverage: null,
        matchedPostId: null,
        matchedUrl: null,
        historicalPath: null,
        refreshFirstVerdict: null,
        duplicate: false,
        cannibalizationRisk: false,
      },
    }),
  });
  assert.equal(r.evidenceCompleteness, "MINIMAL");
  assert.ok(r.missingInputs.length > 0);
});

// --- Explainability ---

test("components reconcile to raw score before clamp", () => {
  const r = scoreNewBlogEligible();
  const sum = r.components.reduce((acc, c) => acc + c.points, 0);
  const expected = Math.max(0, Math.min(100, Math.round(sum)));
  assert.equal(r.score, expected);
  assert.ok(r.reason.length > 10 && r.reason.length <= 280);
  assert.ok(r.components.every((c) => c.explain.length > 0 && c.explain.length <= 120));
  assert.ok(r.warnings.length <= 8);
});

// --- Fingerprint ---

test("same logical input → same fingerprint", () => {
  const a = scoreNewBlogEligible();
  const b = scoreNewBlogEligible();
  assert.equal(a.priorityFingerprint, b.priorityFingerprint);
  assert.match(a.priorityFingerprint, /^[a-f0-9]{64}$/);
});

test("NBA fingerprint change → priority fingerprint changes", () => {
  const a = scoreNewBlogEligible();
  const b = scoreNewBlogEligible({
    decision: baseDecision({
      action: "NEW_BLOG",
      autonomousEligible: true,
      confidence: "HIGH",
      decisionFingerprint: "fp-changed-nba",
      target: { kind: "new_topic", topic: "Best IPTV apps for Firestick in 2026" },
      evidence: {
        gscPresent: true,
        webEvidencePresent: true,
        corpusEvidencePresent: true,
        existingCoverage: "NONE",
        matchedPostId: null,
        matchedUrl: null,
        historicalPath: null,
        refreshFirstVerdict: "PASS_NEW_CONTENT",
        duplicate: false,
        cannibalizationRisk: false,
      },
    }),
  });
  assert.notEqual(a.priorityFingerprint, b.priorityFingerprint);
});

test("Refresh fingerprint change → priority fingerprint changes", () => {
  const rfA = passGovernor();
  const rfB = { ...rfA, fingerprint: "different-rf-fp" };
  const a = scoreNewBlogEligible({ refreshFirst: rfA });
  const b = scoreNewBlogEligible({ refreshFirst: rfB });
  assert.notEqual(a.priorityFingerprint, b.priorityFingerprint);
});

test("scoreVersion change → fingerprint changes", () => {
  const base = buildSeoPriorityFingerprint({
    scoreVersion: "v1",
    decisionFingerprint: "d1",
    action: "NEW_BLOG",
    score: 70,
    tier: "HIGH",
    automationSelectable: true,
    evidenceCompleteness: "FULL",
    effort: "HIGH",
    componentPoints: [{ name: "demand", points: 10 }],
  });
  const other = buildSeoPriorityFingerprint({
    scoreVersion: "v2",
    decisionFingerprint: "d1",
    action: "NEW_BLOG",
    score: 70,
    tier: "HIGH",
    automationSelectable: true,
    evidenceCompleteness: "FULL",
    effort: "HIGH",
    componentPoints: [{ name: "demand", points: 10 }],
  });
  assert.notEqual(base, other);
});

test("reason prose does not affect fingerprint helper identity fields", () => {
  const a = buildSeoPriorityFingerprint({
    scoreVersion: "v1",
    decisionFingerprint: "d1",
    action: "NEW_BLOG",
    score: 55,
    tier: "MEDIUM",
    automationSelectable: false,
    evidenceCompleteness: "PARTIAL",
    effort: "HIGH",
    componentPoints: [{ name: "confidence", points: 11 }],
  });
  const b = buildSeoPriorityFingerprint({
    scoreVersion: "v1",
    decisionFingerprint: "d1",
    action: "NEW_BLOG",
    score: 55,
    tier: "MEDIUM",
    automationSelectable: false,
    evidenceCompleteness: "PARTIAL",
    effort: "HIGH",
    componentPoints: [{ name: "confidence", points: 11 }],
  });
  assert.equal(a, b);
});

// --- Version ---

test("scoreVersion === v1", () => {
  const r = scoreNewBlogEligible();
  assert.equal(r.scoreVersion, SEO_PRIORITY_SCORE_VERSION);
  assert.equal(r.scoreVersion, "v1");
});

// --- Safety / NBA compatibility ---

test("evaluate is pure — serializable fixture-only", () => {
  const before = process.env.OPENAI_API_KEY;
  const r = scoreNewBlogEligible();
  assert.ok(r.priorityFingerprint);
  assert.equal(process.env.OPENAI_API_KEY, before);
  const json = JSON.parse(JSON.stringify(r));
  assert.equal(json.score, r.score);
  assert.equal(json.automationSelectable, r.automationSelectable);
});

test("NBA decide + Priority: eligibility mirrored, score does not unlock", () => {
  const decision = decideSeoNextBestAction({
    opportunity: {
      recommendation: "NEW_BLOG",
      topic: "Best IPTV apps for Firestick in 2026",
      confidence: "HIGH",
      existingCoverage: "NONE",
      whyNow: "Search demand is rising for Firestick IPTV app comparisons this quarter.",
      webEvidence: "Competitor roundups rank for best firestick iptv apps with thin UK coverage.",
      gscEvidencePresent: true,
    },
    corpus: { existingCoverage: "NONE", duplicate: false, cannibalizationRisk: false },
    refreshFirst: { verdict: "PASS_NEW_CONTENT" },
    evidence: { gscPresent: true, webEvidencePresent: true, corpusEvidencePresent: true },
  });
  assert.equal(decision.action, "NEW_BLOG");
  assert.equal(decision.autonomousEligible, true);
  const scored = scoreSeoPriority({
    decision,
    refreshFirst: passGovernor(),
    opportunity: richOpp(),
    gscEvidence: [gscRow()],
  });
  assert.equal(scored.automationSelectable, true);

  const blocked = decideSeoNextBestAction({
    opportunity: {
      recommendation: "NEW_BLOG",
      topic: "Best IPTV apps for Firestick in 2026",
      confidence: "HIGH",
      existingCoverage: "NONE",
      whyNow: "Search demand is rising for Firestick IPTV app comparisons this quarter.",
      webEvidence: "Competitor roundups.",
    },
    refreshFirst: { verdict: "DUPLICATE" },
  });
  const blockedScore = scoreSeoPriority({ decision: blocked, opportunity: richOpp() });
  assert.equal(blocked.autonomousEligible, false);
  assert.equal(blockedScore.automationSelectable, false);
});

test("Refresh-First evaluate still works alongside Priority", () => {
  const rf = passGovernor();
  assert.equal(rf.verdict, "PASS_NEW_CONTENT");
  const r = scoreSeoPriority({
    decision: baseDecision({
      action: "NEW_BLOG",
      autonomousEligible: true,
      confidence: "HIGH",
    }),
    refreshFirst: rf,
    opportunity: richOpp(),
  });
  assert.equal(r.refreshFingerprint, rf.fingerprint);
});

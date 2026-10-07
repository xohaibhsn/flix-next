/**
 * SEO Next-Best-Action Engine V1 — deterministic decide + Planning map tests.
 * Executes real helper logic (not source-string assertions).
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import {
  buildSeoNextBestActionFingerprint,
  decideSeoNextBestAction,
  mapSeoNextBestActionToPlanningRecommendation,
  mapSeoNextBestDecisionToPlanningRecommendation,
  type SeoNextBestActionInput,
} from "../lib/cms/seo-next-best-action";

const MODULE_DIR = path.join(process.cwd(), "lib", "cms", "seo-next-best-action");

function baseNewBlogInput(overrides: Partial<SeoNextBestActionInput> = {}): SeoNextBestActionInput {
  return {
    opportunity: {
      recommendation: "NEW_BLOG",
      topic: "Best IPTV apps for Firestick in 2026",
      workingTitle: "Best IPTV Apps for Firestick in 2026",
      confidence: "HIGH",
      existingCoverage: "NONE",
      whyNow: "Search demand is rising for Firestick IPTV app comparisons this quarter.",
      webEvidence: "Competitor roundups rank for best firestick iptv apps with thin UK coverage.",
      gscEvidencePresent: true,
    },
    corpus: {
      existingCoverage: "NONE",
      duplicate: false,
      cannibalizationRisk: false,
    },
    refreshFirst: { verdict: "PASS_NEW_CONTENT" },
    technical: {},
    evidence: {
      gscPresent: true,
      webEvidencePresent: true,
      corpusEvidencePresent: true,
    },
    ...overrides,
  };
}

// --- Technical precedence ---

test("technical blocker outranks NEW_BLOG", () => {
  const d = decideSeoNextBestAction(
    baseNewBlogInput({
      technical: { technicalBlocker: true },
    }),
  );
  assert.equal(d.action, "TECHNICAL_FIX");
  assert.equal(d.status, "HOLD");
  assert.equal(d.holdReason, "TECHNICAL_BLOCKER");
  assert.equal(d.autonomousEligible, false);
  assert.ok(d.alternatives.some((a) => a.action === "NEW_BLOG"));
});

test("indexing blocker outranks NEW_BLOG", () => {
  const d = decideSeoNextBestAction(
    baseNewBlogInput({
      technical: { indexingBlocker: true },
    }),
  );
  assert.equal(d.action, "INDEXING_REVIEW");
  assert.equal(d.status, "HOLD");
  assert.equal(d.holdReason, "TECHNICAL_BLOCKER");
  assert.equal(d.autonomousEligible, false);
});

test("image + technical blocker → technical wins", () => {
  const d = decideSeoNextBestAction(
    baseNewBlogInput({
      technical: { technicalBlocker: true, imageOnly: true },
    }),
  );
  assert.equal(d.action, "TECHNICAL_FIX");
});

// --- Existing coverage / Refresh-First ---

test("exact existing article → REFRESH_EXISTING", () => {
  const d = decideSeoNextBestAction(
    baseNewBlogInput({
      corpus: {
        matchedPostId: "post_abc",
        matchedUrl: "/blogs/best-iptv-apps/",
        existingCoverage: "STRONG",
      },
      opportunity: {
        ...baseNewBlogInput().opportunity!,
        existingCoverage: "STRONG",
        matchedPublicUrl: "/blogs/best-iptv-apps/",
      },
      refreshFirst: { verdict: "UNKNOWN" },
    }),
  );
  assert.equal(d.action, "REFRESH_EXISTING");
  assert.equal(d.target.kind, "blog_post");
  if (d.target.kind === "blog_post") assert.equal(d.target.postId, "post_abc");
  assert.equal(d.autonomousEligible, false);
});

test("exact matchedPostId outranks NEW_BLOG even with PASS_NEW_CONTENT + coverage NONE", () => {
  const d = decideSeoNextBestAction(
    baseNewBlogInput({
      corpus: {
        matchedPostId: "post_exact_id",
        matchedUrl: "/blogs/existing-exact/",
        existingCoverage: "NONE",
        duplicate: false,
        cannibalizationRisk: false,
      },
      refreshFirst: { verdict: "PASS_NEW_CONTENT" },
    }),
  );
  assert.equal(d.action, "REFRESH_EXISTING");
  assert.equal(d.autonomousEligible, false);
  if (d.target.kind === "blog_post") assert.equal(d.target.postId, "post_exact_id");
});

test("Refresh-First refresh verdict → REFRESH_EXISTING", () => {
  const d = decideSeoNextBestAction(
    baseNewBlogInput({
      refreshFirst: { verdict: "REFRESH_EXISTING" },
      corpus: {
        matchedPostId: "post_refresh",
        matchedUrl: "/blogs/existing/",
        existingCoverage: "PARTIAL",
      },
    }),
  );
  assert.equal(d.action, "REFRESH_EXISTING");
  assert.equal(d.evidence.refreshFirstVerdict, "REFRESH_EXISTING");
});

test("duplicate with target → REFRESH_EXISTING", () => {
  const d = decideSeoNextBestAction(
    baseNewBlogInput({
      corpus: {
        duplicate: true,
        matchedPostId: "post_dup",
        matchedUrl: "/blogs/dup/",
        existingCoverage: "PARTIAL",
      },
      refreshFirst: { verdict: "DUPLICATE" },
    }),
  );
  assert.equal(d.action, "REFRESH_EXISTING");
  assert.ok(d.warnings.includes("duplicate"));
  assert.equal(d.autonomousEligible, false);
});

test("duplicate without target → DO_NOTHING/HOLD", () => {
  const d = decideSeoNextBestAction(
    baseNewBlogInput({
      corpus: {
        duplicate: true,
        existingCoverage: "NONE",
      },
      refreshFirst: { verdict: "DUPLICATE" },
      opportunity: {
        ...baseNewBlogInput().opportunity!,
        matchedPublicUrl: null,
      },
    }),
  );
  assert.equal(d.action, "DO_NOTHING");
  assert.equal(d.status, "HOLD");
  assert.equal(d.holdReason, "DUPLICATE");
  assert.equal(d.autonomousEligible, false);
});

test("cannibalization risk → no autonomous NEW_BLOG", () => {
  const withTarget = decideSeoNextBestAction(
    baseNewBlogInput({
      corpus: {
        cannibalizationRisk: true,
        matchedPostId: "post_can",
        matchedUrl: "/blogs/can/",
        existingCoverage: "PARTIAL",
      },
      refreshFirst: { verdict: "CANNIBALIZATION_RISK" },
    }),
  );
  assert.notEqual(withTarget.action, "NEW_BLOG");
  assert.equal(withTarget.autonomousEligible, false);

  const withoutTarget = decideSeoNextBestAction(
    baseNewBlogInput({
      corpus: { cannibalizationRisk: true, existingCoverage: "NONE" },
      refreshFirst: { verdict: "CANNIBALIZATION_RISK" },
    }),
  );
  assert.equal(withoutTarget.action, "DO_NOTHING");
  assert.equal(withoutTarget.holdReason, "CANNIBALIZATION_RISK");
  assert.equal(withoutTarget.autonomousEligible, false);
});

test("metadata + strong existing refresh → REFRESH wins (higher precedence)", () => {
  const d = decideSeoNextBestAction(
    baseNewBlogInput({
      technical: { metadataOnly: true },
      corpus: {
        matchedPostId: "post_meta",
        matchedUrl: "/blogs/meta/",
        existingCoverage: "STRONG",
      },
      refreshFirst: { verdict: "REFRESH_EXISTING" },
    }),
  );
  assert.equal(d.action, "REFRESH_EXISTING");
});

test("NEW_BLOG suggestion + exact existing target → REFRESH wins", () => {
  const d = decideSeoNextBestAction(
    baseNewBlogInput({
      opportunity: {
        ...baseNewBlogInput().opportunity!,
        recommendation: "NEW_BLOG",
        existingCoverage: "STRONG",
        matchedPublicUrl: "/blogs/exact/",
      },
      corpus: {
        matchedPostId: "post_exact",
        matchedUrl: "/blogs/exact/",
        existingCoverage: "STRONG",
      },
      refreshFirst: { verdict: "UNKNOWN" },
    }),
  );
  assert.equal(d.action, "REFRESH_EXISTING");
});

// --- Historical ---

test("valid historical candidate → HISTORICAL_RECOVERY", () => {
  const d = decideSeoNextBestAction(
    baseNewBlogInput({
      historical: {
        registryMatch: true,
        classificationEligible: true,
        restoreEligible: true,
        path: "/blogs/old-guide/",
        preferredDisposition: "RECREATE",
      },
      corpus: { existingCoverage: "NONE" },
      refreshFirst: { verdict: "PASS_NEW_CONTENT" },
    }),
  );
  assert.equal(d.action, "HISTORICAL_RECOVERY");
  assert.equal(d.historicalDisposition, "RECREATE");
  assert.equal(d.target.kind, "historical_path");
  assert.equal(d.autonomousEligible, false);
});

test("invalid/unqualified historical candidate does not restore", () => {
  const d = decideSeoNextBestAction(
    baseNewBlogInput({
      historical: {
        registryMatch: true,
        classificationEligible: false,
        restoreEligible: false,
        path: "/blogs/old-guide/",
      },
    }),
  );
  assert.notEqual(d.action, "HISTORICAL_RECOVERY");
});

test("strong current coverage blocks historical recovery", () => {
  const d = decideSeoNextBestAction(
    baseNewBlogInput({
      historical: {
        registryMatch: true,
        classificationEligible: true,
        restoreEligible: true,
        path: "/blogs/old-guide/",
      },
      corpus: {
        matchedPostId: "post_now",
        matchedUrl: "/blogs/current/",
        existingCoverage: "STRONG",
      },
      refreshFirst: { verdict: "REFRESH_EXISTING" },
    }),
  );
  assert.equal(d.action, "REFRESH_EXISTING");
});

// --- Metadata / links / image ---

test("metadata-only → TITLE_META_UPDATE", () => {
  // No matchedPostId: exact BlogPost match outranks metadata by design (precedence §3 > §5).
  const d = decideSeoNextBestAction(
    baseNewBlogInput({
      technical: { metadataOnly: true },
      corpus: { existingCoverage: "PARTIAL", matchedUrl: "/blogs/m/" },
      refreshFirst: { verdict: "PASS_NEW_CONTENT" },
    }),
  );
  assert.equal(d.action, "TITLE_META_UPDATE");
  assert.equal(mapSeoNextBestDecisionToPlanningRecommendation(d), null);
});

test("internal-link-only → INTERNAL_LINKS and maps to INTERNAL_LINK_ONLY when requested", () => {
  const d = decideSeoNextBestAction(
    baseNewBlogInput({
      technical: { internalLinkOnly: true },
      corpus: { existingCoverage: "PARTIAL", matchedUrl: "/blogs/il/" },
      refreshFirst: { verdict: "PASS_NEW_CONTENT" },
    }),
  );
  assert.equal(d.action, "INTERNAL_LINKS");
  assert.equal(mapSeoNextBestActionToPlanningRecommendation("INTERNAL_LINKS"), null);
  assert.equal(
    mapSeoNextBestActionToPlanningRecommendation("INTERNAL_LINKS", {
      requestPlanningArtifact: true,
    }),
    "INTERNAL_LINK_ONLY",
  );
});

test("image-only → IMAGE with null Planning mapping", () => {
  const d = decideSeoNextBestAction(
    baseNewBlogInput({
      technical: { imageOnly: true },
      corpus: { existingCoverage: "PARTIAL", matchedUrl: "/blogs/img/" },
      refreshFirst: { verdict: "PASS_NEW_CONTENT" },
    }),
  );
  assert.equal(d.action, "IMAGE");
  assert.equal(mapSeoNextBestDecisionToPlanningRecommendation(d), null);
});

// --- NEW_BLOG ---

test("no coverage + HIGH + material evidence + Refresh pass → NEW_BLOG autonomous", () => {
  const d = decideSeoNextBestAction(baseNewBlogInput());
  assert.equal(d.action, "NEW_BLOG");
  assert.equal(d.status, "ACTIONABLE");
  assert.equal(d.confidence, "HIGH");
  assert.equal(d.autonomousEligible, true);
  assert.equal(d.evidence.existingCoverage, "NONE");
  assert.equal(d.target.kind, "new_topic");
});

test("MEDIUM NEW_BLOG → autonomousEligible=false", () => {
  const d = decideSeoNextBestAction(
    baseNewBlogInput({
      opportunity: {
        ...baseNewBlogInput().opportunity!,
        confidence: "MEDIUM",
      },
    }),
  );
  assert.equal(d.action, "NEW_BLOG");
  assert.equal(d.confidence, "MEDIUM");
  assert.equal(d.autonomousEligible, false);
});

test("LOW NEW_BLOG → autonomousEligible=false", () => {
  const d = decideSeoNextBestAction(
    baseNewBlogInput({
      opportunity: {
        ...baseNewBlogInput().opportunity!,
        confidence: "LOW",
      },
    }),
  );
  assert.equal(d.action, "NEW_BLOG");
  assert.equal(d.confidence, "LOW");
  assert.equal(d.autonomousEligible, false);
});

test("weak evidence → DO_NOTHING/HOLD", () => {
  const d = decideSeoNextBestAction(
    baseNewBlogInput({
      opportunity: {
        recommendation: "NEW_BLOG",
        topic: "Thin topic",
        workingTitle: "Thin topic",
        confidence: "HIGH",
        existingCoverage: "NONE",
        whyNow: "",
        webEvidence: "",
        gscEvidencePresent: false,
      },
      evidence: {
        gscPresent: false,
        webEvidencePresent: false,
        corpusEvidencePresent: false,
      },
    }),
  );
  assert.equal(d.action, "DO_NOTHING");
  assert.equal(d.status, "HOLD");
  assert.equal(d.holdReason, "INSUFFICIENT_EVIDENCE");
  assert.equal(d.autonomousEligible, false);
});

test("Refresh verdict UNKNOWN → not autonomously eligible", () => {
  const d = decideSeoNextBestAction(
    baseNewBlogInput({
      refreshFirst: { verdict: "UNKNOWN" },
    }),
  );
  assert.equal(d.action, "NEW_BLOG");
  assert.equal(d.autonomousEligible, false);
  assert.ok(d.blockers.includes("refresh_first_not_pass") || d.warnings.includes("refresh_first_unknown"));
});

test("existingCoverage non-NONE → not autonomous", () => {
  // PARTIAL without refresh-forcing path still cannot be autonomous NEW_BLOG
  const d = decideSeoNextBestAction(
    baseNewBlogInput({
      opportunity: {
        ...baseNewBlogInput().opportunity!,
        existingCoverage: "PARTIAL",
        matchedPublicUrl: null,
      },
      corpus: {
        existingCoverage: "PARTIAL",
        duplicate: false,
        cannibalizationRisk: false,
      },
      refreshFirst: { verdict: "PASS_NEW_CONTENT" },
    }),
  );
  assert.equal(d.autonomousEligible, false);
  if (d.action === "NEW_BLOG") {
    assert.ok(d.blockers.includes("existing_coverage"));
  }
});

// --- DO_NOTHING ---

test("no worthwhile signal → DO_NOTHING", () => {
  const d = decideSeoNextBestAction({
    opportunity: { topic: "", confidence: "LOW" },
    refreshFirst: { verdict: "UNKNOWN" },
    evidence: { gscPresent: false, webEvidencePresent: false },
  });
  assert.equal(d.action, "DO_NOTHING");
  assert.equal(d.autonomousEligible, false);
  assert.ok(d.holdReason === "NO_WORTHWHILE_ACTION" || d.holdReason === "INSUFFICIENT_EVIDENCE");
});

test("insufficient evidence → HOLD healthy result (not exception)", () => {
  const d = decideSeoNextBestAction({
    opportunity: {
      recommendation: "SKIP",
      topic: "Maybe something",
      confidence: "LOW",
      existingCoverage: "NONE",
    },
    refreshFirst: { verdict: "UNKNOWN" },
    evidence: { gscPresent: false, webEvidencePresent: false },
  });
  assert.equal(d.action, "DO_NOTHING");
  assert.equal(d.status, "HOLD");
  assert.equal(d.holdReason, "INSUFFICIENT_EVIDENCE");
});

// --- Fingerprint ---

test("same logical input → same fingerprint", () => {
  const a = decideSeoNextBestAction(baseNewBlogInput());
  const b = decideSeoNextBestAction(baseNewBlogInput());
  assert.equal(a.decisionFingerprint, b.decisionFingerprint);
  assert.equal(a.actionFingerprint, b.actionFingerprint);
});

test("target change → fingerprint changes", () => {
  const a = decideSeoNextBestAction(
    baseNewBlogInput({
      corpus: {
        matchedPostId: "post_a",
        matchedUrl: "/blogs/a/",
        existingCoverage: "STRONG",
      },
      refreshFirst: { verdict: "REFRESH_EXISTING" },
    }),
  );
  const b = decideSeoNextBestAction(
    baseNewBlogInput({
      corpus: {
        matchedPostId: "post_b",
        matchedUrl: "/blogs/b/",
        existingCoverage: "STRONG",
      },
      refreshFirst: { verdict: "REFRESH_EXISTING" },
    }),
  );
  assert.equal(a.action, "REFRESH_EXISTING");
  assert.equal(b.action, "REFRESH_EXISTING");
  assert.notEqual(a.decisionFingerprint, b.decisionFingerprint);
});

test("topic/slug change → fingerprint changes for NEW_BLOG", () => {
  const a = decideSeoNextBestAction(baseNewBlogInput());
  const b = decideSeoNextBestAction(
    baseNewBlogInput({
      opportunity: {
        ...baseNewBlogInput().opportunity!,
        topic: "Completely different IPTV topic for Android boxes",
        workingTitle: "Completely Different IPTV Topic for Android Boxes",
      },
    }),
  );
  assert.equal(a.action, "NEW_BLOG");
  assert.equal(b.action, "NEW_BLOG");
  assert.notEqual(a.decisionFingerprint, b.decisionFingerprint);
});

test("timestamp/presentation reason does not alter fingerprint identity", () => {
  const fp1 = buildSeoNextBestActionFingerprint({
    action: "NEW_BLOG",
    target: { kind: "new_topic", topic: "Topic A", proposedSlug: "topic-a" },
    topic: "Topic A",
    refreshFirstVerdict: "PASS_NEW_CONTENT",
  });
  const fp2 = buildSeoNextBestActionFingerprint({
    action: "NEW_BLOG",
    target: { kind: "new_topic", topic: "Topic A", proposedSlug: "topic-a" },
    topic: "Topic A",
    refreshFirstVerdict: "PASS_NEW_CONTENT",
  });
  assert.equal(fp1, fp2);
  // Reason text is not part of fingerprint helper inputs
  assert.match(fp1, /^[a-f0-9]{64}$/);
});

// --- Planning mapping ---

test("Planning mappings for Planning-eligible actions", () => {
  assert.equal(mapSeoNextBestActionToPlanningRecommendation("NEW_BLOG"), "NEW_BLOG");
  assert.equal(mapSeoNextBestActionToPlanningRecommendation("REFRESH_EXISTING"), "REFRESH_EXISTING");
  assert.equal(
    mapSeoNextBestActionToPlanningRecommendation("INTERNAL_LINKS", {
      requestPlanningArtifact: true,
    }),
    "INTERNAL_LINK_ONLY",
  );
  assert.equal(
    mapSeoNextBestActionToPlanningRecommendation(
      "HISTORICAL_RECOVERY",
      { historicalContentRecovery: true },
      { historicalDisposition: "RECREATE" },
    ),
    "RESTORE_HISTORICAL",
  );
  assert.equal(
    mapSeoNextBestActionToPlanningRecommendation(
      "HISTORICAL_RECOVERY",
      {},
      { historicalDisposition: "REDIRECT" },
    ),
    null,
  );
});

test("non-Planning actions return null", () => {
  for (const action of [
    "TITLE_META_UPDATE",
    "IMAGE",
    "INDEXING_REVIEW",
    "TECHNICAL_FIX",
    "DO_NOTHING",
  ] as const) {
    assert.equal(mapSeoNextBestActionToPlanningRecommendation(action), null);
  }
});

// --- Safety: no writes / no providers in module source ---

test("module source is write/provider-free (static safety)", () => {
  const files = ["decide.ts", "map-to-planning.ts", "types.ts", "index.ts"];
  const banned = [
    /openai/i,
    /gemini/i,
    /fetch\s*\(/,
    /createPlanning|savePlanning|writeFile|mysql|prisma/i,
    /import\s+.*from\s+["']openai/,
    /@google\/generative/,
    /searchconsole|googleapis/i,
  ];
  for (const file of files) {
    const src = readFileSync(path.join(MODULE_DIR, file), "utf8");
    for (const re of banned) {
      assert.equal(re.test(src), false, `${file} matched banned pattern ${re}`);
    }
  }
  // decide must not import Planning proceed / CMS store
  const decideSrc = readFileSync(path.join(MODULE_DIR, "decide.ts"), "utf8");
  assert.equal(decideSrc.includes("proceedSeoOpportunity"), false);
  assert.equal(decideSrc.includes("seo-planning/proceed"), false);
});

test("decide is pure across repeated calls (no mutation of input)", () => {
  const input = baseNewBlogInput();
  const freeze = JSON.stringify(input);
  decideSeoNextBestAction(input);
  decideSeoNextBestAction(input);
  assert.equal(JSON.stringify(input), freeze);
});

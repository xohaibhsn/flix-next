/**
 * RESTORE Phase 1 failure hardening — fail-closed drop + safe diagnostics.
 * Mocks only. No Google / OpenAI / CMS writes.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import {
  DEFAULT_OPENAI_SEO_MODEL,
  type OpenAiSeoConfig,
} from "../lib/cms/ai-seo/config";
import {
  inspectOpenAiResearchResponsesPayload,
  requestOpenAiUkOpportunityResearch,
} from "../lib/cms/ai-seo/provider";
import { resetAiSeoResearchRateLimitForTests } from "../lib/cms/ai-seo/rate-limit";
import { researchUkContentOpportunities } from "../lib/cms/ai-seo/research";
import { buildSeoResearchInventory } from "../lib/cms/ai-seo/research-inventory";
import {
  normalizeSeoResearchResult,
  SEO_RESEARCH_INVALID_DIAGNOSTICS,
} from "../lib/cms/ai-seo/research-schemas";
import { classifyGscPageUrls } from "../lib/cms/gsc/classify-url";
import type { GscUkEvidencePack } from "../lib/cms/gsc/evidence-types";
import { GSC_KNOWN_HISTORICAL_URLS } from "../lib/cms/gsc/historical-registry";
import { GSC_EVIDENCE_MAX_GOOGLE_CALLS } from "../lib/cms/gsc/request-plan";
import {
  buildGscResearchFusionContext,
  collectGscPackPageUrls,
} from "../lib/cms/gsc/research-fusion";
import { gscRestorationPathAllowlist } from "../lib/cms/gsc/restore-eligibility";
import { buildGscSiteUrlIndex } from "../lib/cms/gsc/site-url-index";
import type { GscSearchAnalyticsRow } from "../lib/cms/gsc/types";
import type { BlogCategory, BlogPost, SiteSettings } from "../lib/cms/types";

const root = process.cwd();
const BUFFERING = "/how-to-fix-buffering-issues-on-iptv/";
const POST_URL = "/blogs/getting-started-with-the-flixiptv/";

function read(rel: string) {
  return readFileSync(path.join(root, rel), "utf8");
}

function row(
  keys: string[],
  clicks: number,
  impressions: number,
  ctr: number,
  position: number,
): GscSearchAnalyticsRow {
  return { keys, clicks, impressions, ctr, position };
}

function packWith(overrides: Partial<GscUkEvidencePack> = {}): GscUkEvidencePack {
  return {
    status: "AVAILABLE",
    window: {
      recentStart: "2026-09-05",
      recentEnd: "2026-10-02",
      previousStart: "2026-08-08",
      previousEnd: "2026-09-04",
      reportingLagDays: 3,
    },
    country: { code: "GB", expression: "gbr" },
    recentQueries: [],
    recentPages: [row([`https://theflixiptv.com${BUFFERING}`], 0, 40, 0, 18)],
    recentQueryPages: [],
    previousPages: [],
    ...overrides,
  };
}

function fusionForPack(pack = packWith()) {
  const index = buildGscSiteUrlIndex({
    pages: [],
    posts: [],
    categories: [],
    redirects: [],
    knownHistorical: GSC_KNOWN_HISTORICAL_URLS,
  });
  return buildGscResearchFusionContext({
    pack,
    classifications: classifyGscPageUrls(collectGscPackPageUrls(pack), index),
  });
}

function restoreOpp(overrides: Record<string, unknown> = {}) {
  return {
    topic: "Historical buffering guide",
    workingTitle: "Restore IPTV buffering troubleshooting guide",
    searchIntent: "TROUBLESHOOTING",
    whyNow: "Historical GSC evidence still shows UK interest in buffering help.",
    webEvidence: "Current UK help pages still discuss IPTV buffering and Wi-Fi checks.",
    existingCoverage: "NONE",
    matchedTitle: "",
    matchedPublicUrl: "",
    recommendation: "RESTORE_HISTORICAL",
    restorePath: BUFFERING,
    suggestedAngle: "Restore the historical buffering URL as a focused troubleshooting guide.",
    nextStep: "Review server GSC evidence and decide whether to restore editorially.",
    confidence: "MEDIUM",
    gscEvidenceRefs: ["P1"],
    ...overrides,
  };
}

function refreshOpp(overrides: Record<string, unknown> = {}) {
  return {
    topic: "Firestick buffering fixes",
    workingTitle: "How to Fix IPTV Buffering on Firestick",
    searchIntent: "TROUBLESHOOTING",
    whyNow: "Recent UK guides discuss buffering during peak evening use.",
    webEvidence: "Current web coverage suggests Firestick buffering remains a common UK help topic.",
    existingCoverage: "PARTIAL",
    matchedTitle: "Getting Started with The FlixIPTV",
    matchedPublicUrl: POST_URL,
    recommendation: "REFRESH_EXISTING",
    restorePath: "",
    suggestedAngle: "Add a focused buffering checklist.",
    nextStep: "Review the existing setup guide.",
    confidence: "MEDIUM",
    gscEvidenceRefs: [],
    ...overrides,
  };
}

function newBlogOpp(overrides: Record<string, unknown> = {}) {
  return {
    topic: "Best IPTV apps for Smart TV",
    workingTitle: "Best IPTV Apps for UK Smart TVs",
    searchIntent: "COMPARISON",
    whyNow: "Device buyers still look for compatible player apps.",
    webEvidence: "Recent sources discuss Smart TV player choices.",
    existingCoverage: "NONE",
    matchedTitle: "",
    matchedPublicUrl: "",
    recommendation: "NEW_BLOG",
    restorePath: "",
    suggestedAngle: "Compare legitimate player options.",
    nextStep: "Draft an outline for editorial review only.",
    confidence: "HIGH",
    gscEvidenceRefs: [],
    ...overrides,
  };
}

function normalize(opportunities: unknown[], fusion = fusionForPack()) {
  return normalizeSeoResearchResult(
    { opportunities },
    new Set([POST_URL]),
    {
      gscEvidenceById: fusion.byId,
      gscMeta: fusion.meta,
      restorationPathAllowlist: gscRestorationPathAllowlist(fusion.restorationCandidates),
    },
  );
}

function testConfig(): OpenAiSeoConfig {
  return {
    configured: true,
    apiKey: "test-key",
    model: DEFAULT_OPENAI_SEO_MODEL,
    endpoint: "https://api.openai.com/v1/responses",
    timeoutMs: 30_000,
    maxOutputTokens: 2200,
  };
}

function sampleInventory() {
  const settings = {
    siteName: "Flix IPTV",
    pageSeo: {
      home: { title: "Welcome", description: "Home" },
      subscriptions: { title: "IPTV Subscription", description: "Plans" },
      contact: { title: "Contact", description: "Help" },
      blog: { title: "Blog", description: "Guides" },
      "about-us": { title: "About Us", description: "About" },
    },
  } as unknown as SiteSettings;
  const posts = [
    {
      id: "post-1",
      title: "Getting Started with The FlixIPTV: A Complete Setup Guide",
      slug: "getting-started-with-the-flixiptv",
      excerpt: "Set up",
      content: "<p>body</p>",
      status: "published",
      categoryId: "cat-setup",
      seoTitle: "Getting Started",
      seoDescription: "Learn",
      updatedAt: "2026-07-20T10:00:00.000Z",
      publishedAt: "2026-07-20T10:00:00.000Z",
    },
  ] as unknown as BlogPost[];
  const categories = [
    {
      id: "cat-setup",
      name: "Setup",
      slug: "setup",
      description: "Setup",
      active: true,
      seoTitle: "Setup",
      seoDescription: "Setup",
    },
  ] as unknown as BlogCategory[];
  return buildSeoResearchInventory({ settings, posts, categories });
}

function mockJsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function responsesPayload(opportunityJson: unknown, extras: Record<string, unknown> = {}) {
  return {
    status: "completed",
    output: [
      {
        type: "message",
        content: [{ type: "output_text", text: JSON.stringify(opportunityJson) }],
      },
    ],
    ...extras,
  };
}

test("hardening: diagnostic code set is closed and safe", () => {
  assert.deepEqual([...SEO_RESEARCH_INVALID_DIAGNOSTICS], [
    "RESPONSE_JSON_INVALID",
    "OUTPUT_TEXT_MISSING",
    "OUTPUT_JSON_INVALID",
    "SEMANTIC_PAYLOAD_INVALID",
    "RESPONSE_INCOMPLETE",
    "RESPONSE_REFUSAL",
  ]);
});

test("7. valid REFRESH + unsafe RESTORE → REFRESH survives; RESTORE absent", () => {
  const result = normalize([
    refreshOpp(),
    restoreOpp({ restorePath: "/become-an-iptv-reseller-in-uk/" }),
  ]);
  assert.ok(result);
  assert.equal(result?.opportunities.length, 1);
  assert.equal(result?.opportunities[0]?.recommendation, "REFRESH_EXISTING");
  assert.equal(result?.opportunities[0]?.restorePath, "");
});

test("8. valid NEW_BLOG + unsafe RESTORE → NEW_BLOG survives", () => {
  const result = normalize([
    newBlogOpp(),
    restoreOpp({ existingCoverage: "STRONG" }),
  ]);
  assert.ok(result);
  assert.equal(result?.opportunities.length, 1);
  assert.equal(result?.opportunities[0]?.recommendation, "NEW_BLOG");
});

test("9. all opportunities unsafe RESTORE → normalized empty array (not null)", () => {
  const result = normalize([
    restoreOpp({ restorePath: "/downloads/" }),
    restoreOpp({ gscEvidenceRefs: ["Q1"] }),
  ]);
  assert.ok(result);
  assert.equal(result?.opportunities.length, 0);
  assert.equal(result?.gsc?.status, "AVAILABLE");
});

test("10–11. non-RESTORE noisy restorePath canonicalized; no RESTORE recommendation", () => {
  const result = normalize([
    newBlogOpp({ restorePath: BUFFERING }),
    refreshOpp({ restorePath: "/welcome/" }),
  ]);
  assert.ok(result);
  assert.equal(result?.opportunities.length, 2);
  for (const item of result?.opportunities || []) {
    assert.equal(item.restorePath, "");
    assert.notEqual(item.recommendation, "RESTORE_HISTORICAL");
  }
});

test("12. malformed top-level payload still fails", () => {
  assert.equal(normalizeSeoResearchResult(null, new Set()), null);
  assert.equal(normalizeSeoResearchResult({ opportunities: [], extra: true }, new Set()), null);
  assert.equal(
    normalizeSeoResearchResult(
      { opportunities: [{ ...newBlogOpp(), monthlySearches: 10 }] },
      new Set(),
    ),
    null,
  );
});

test("13. bad REFRESH allowlist mapping still rejects whole payload", () => {
  assert.equal(
    normalize([refreshOpp({ matchedPublicUrl: "/blogs/invented/" })]),
    null,
  );
});

test("inspect: incomplete status → RESPONSE_INCOMPLETE", () => {
  const result = inspectOpenAiResearchResponsesPayload({
    status: "incomplete",
    incomplete_details: { reason: "max_output_tokens" },
    output: [],
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.diagnostic, "RESPONSE_INCOMPLETE");
});

test("inspect: refusal → RESPONSE_REFUSAL without leaking text", () => {
  const result = inspectOpenAiResearchResponsesPayload({
    status: "completed",
    output: [{ type: "refusal", refusal: "SECRET_REFUSAL_BODY_MUST_NOT_LEAK" }],
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.diagnostic, "RESPONSE_REFUSAL");
  assert.doesNotMatch(JSON.stringify(result), /SECRET_REFUSAL/);
});

test("14–17. provider maps incomplete/refusal/missing text/invalid JSON to diagnostics", async () => {
  resetAiSeoResearchRateLimitForTests();
  const inventory = sampleInventory();

  const incomplete = await requestOpenAiUkOpportunityResearch(inventory, {
    config: testConfig(),
    fetchImpl: async () =>
      mockJsonResponse({ status: "incomplete", incomplete_details: { reason: "max_output_tokens" }, output: [] }),
  });
  assert.equal(incomplete.ok, false);
  if (!incomplete.ok) {
    assert.equal(incomplete.code, "invalid_response");
    assert.equal(incomplete.diagnostic, "RESPONSE_INCOMPLETE");
    assert.equal(incomplete.message, "AI returned an unusable response. Please try again.");
    assert.doesNotMatch(incomplete.message, /max_output_tokens|SECRET|Bearer/i);
  }

  const refusal = await requestOpenAiUkOpportunityResearch(inventory, {
    config: testConfig(),
    fetchImpl: async () =>
      mockJsonResponse({
        status: "completed",
        output: [{ type: "refusal", refusal: "RAW_REFUSAL_TEXT" }],
      }),
  });
  assert.equal(refusal.ok, false);
  if (!refusal.ok) {
    assert.equal(refusal.diagnostic, "RESPONSE_REFUSAL");
    assert.doesNotMatch(JSON.stringify(refusal), /RAW_REFUSAL_TEXT/);
  }

  const missingText = await requestOpenAiUkOpportunityResearch(inventory, {
    config: testConfig(),
    fetchImpl: async () => mockJsonResponse({ status: "completed", output: [{ type: "message", content: [] }] }),
  });
  assert.equal(missingText.ok, false);
  if (!missingText.ok) assert.equal(missingText.diagnostic, "OUTPUT_TEXT_MISSING");

  const badJson = await requestOpenAiUkOpportunityResearch(inventory, {
    config: testConfig(),
    fetchImpl: async () =>
      mockJsonResponse({
        status: "completed",
        output: [{ type: "message", content: [{ type: "output_text", text: "{not-json" }] }],
      }),
  });
  assert.equal(badJson.ok, false);
  if (!badJson.ok) assert.equal(badJson.diagnostic, "OUTPUT_JSON_INVALID");

  const semantic = await requestOpenAiUkOpportunityResearch(inventory, {
    config: testConfig(),
    fetchImpl: async () =>
      mockJsonResponse(
        responsesPayload({
          opportunities: [{ ...newBlogOpp(), searchIntent: "NOT_A_REAL_INTENT" }],
        }),
      ),
  });
  assert.equal(semantic.ok, false);
  if (!semantic.ok) assert.equal(semantic.diagnostic, "SEMANTIC_PAYLOAD_INVALID");
});

test("empty after fail-closed RESTORE uses calm empty code not unusable", async () => {
  resetAiSeoResearchRateLimitForTests();
  const inventory = sampleInventory();
  const fusion = fusionForPack();
  const result = await researchUkContentOpportunities({
    adminId: "harden-empty",
    ip: "8.8.8.8",
    inventory,
    config: testConfig(),
    gscFusion: fusion,
    fetchImpl: async () =>
      mockJsonResponse(
        responsesPayload({
          opportunities: [restoreOpp({ restorePath: "/become-an-iptv-reseller-in-uk/" })],
        }),
      ),
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.code, "empty");
    assert.match(result.error, /No useful UK content opportunities/i);
    assert.equal(result.diagnostic, undefined);
  }
});

test("18. UI surfaces diagnostic without mutation actions or secrets", () => {
  const panel = read("components/sidhu/SeoOpportunitiesPanel.tsx");
  assert.match(panel, /Diagnostic: \{diagnostic\}/);
  assert.doesNotMatch(panel, /Create Blog|Save opportunity|Publish|onRestore/);
  assert.doesNotMatch(panel, /output_text|GSC_PRIVATE_KEY|access_token|Bearer /);
});

test("19. resource bounds unchanged", () => {
  assert.equal(GSC_EVIDENCE_MAX_GOOGLE_CALLS, 4);
  const research = read("lib/cms/ai-seo/research.ts");
  const provider = read("lib/cms/ai-seo/provider.ts");
  assert.equal((research.match(/await requestOpenAiUkOpportunityResearch/g) || []).length, 1);
  assert.doesNotMatch(provider, /retry|for \(.*attempts/);
  assert.match(provider, /tool_choice: "required"/);
  assert.match(provider, /web_search/);
});

/**
 * Phase D1 — privacy-safe Research semantic rejection diagnostics.
 * Mock/static fixtures only — no provider or database calls.
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
import { researchUkContentOpportunities } from "../lib/cms/ai-seo/research";
import {
  buildSeoResearchInventory,
} from "../lib/cms/ai-seo/research-inventory";
import {
  classifyOpenAiIncompleteReason,
  evaluateSeoResearchResult,
  normalizeSeoResearchResult,
  SEO_RESEARCH_INCOMPLETE_REASON_CODES,
  SEO_RESEARCH_SEMANTIC_ISSUE_CODES,
  type SeoResearchGscEvidence,
  type SeoResearchSemanticIssueCode,
} from "../lib/cms/ai-seo/research-schemas";
import {
  resetAiSeoResearchRateLimitForTests,
} from "../lib/cms/ai-seo/rate-limit";
import type { BlogCategory, BlogPost, SiteSettings } from "../lib/cms/types";

const root = process.cwd();
const FIRESTICK = "/blogs/how-to-watch-iptv-on-firestick/";
const BUFFERING = "/how-to-fix-buffering-issues-on-iptv/";

function read(rel: string) {
  return readFileSync(path.join(root, rel), "utf8");
}

function testConfig(overrides: Partial<OpenAiSeoConfig> = {}): OpenAiSeoConfig {
  return {
    configured: true,
    apiKey: "test-key",
    model: DEFAULT_OPENAI_SEO_MODEL,
    endpoint: "https://api.openai.com/v1/responses",
    timeoutMs: 30_000,
    maxOutputTokens: 2200,
    ...overrides,
  };
}

function mockJsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function sampleInventory() {
  const settings = {
    siteName: "Flix IPTV",
    pageSeo: {
      home: { title: "Welcome", description: "Home desc" },
      subscriptions: { title: "IPTV Subscription", description: "Plans" },
      contact: { title: "Contact", description: "Help" },
      blog: { title: "Blog", description: "Guides" },
      "about-us": { title: "About Us", description: "About" },
    },
  } as unknown as SiteSettings;

  const posts = [
    {
      id: "post-firestick",
      title: "How to Watch IPTV on Firestick: Complete Setup Guide",
      slug: "how-to-watch-iptv-on-firestick",
      excerpt: "Firestick setup.",
      content: "<p>body</p>",
      status: "published",
      categoryId: "cat-setup",
      seoTitle: "Firestick IPTV Guide",
      seoDescription: "Setup on Firestick.",
      updatedAt: "2026-08-30T10:00:00.000Z",
      publishedAt: "2026-08-30T10:00:00.000Z",
    },
  ] as unknown as BlogPost[];

  const categories = [
    {
      id: "cat-setup",
      name: "Setup",
      slug: "setup",
      description: "Setup guides.",
      active: true,
      seoTitle: "Setup",
      seoDescription: "Setup guides.",
    },
  ] as unknown as BlogCategory[];

  return buildSeoResearchInventory({ settings, posts, categories });
}

function baseOpp(overrides: Record<string, unknown> = {}) {
  return {
    topic: "Firestick IPTV setup",
    workingTitle: "How to Watch IPTV on Firestick",
    searchIntent: "SETUP",
    whyNow: "UK viewers still search for Firestick setup steps.",
    webEvidence: "Current guides emphasize app sideload and network checks.",
    existingCoverage: "NONE",
    matchedTitle: "",
    matchedPublicUrl: "",
    recommendation: "NEW_BLOG",
    restorePath: "",
    suggestedAngle: "Practical Firestick setup without unsupported claims.",
    nextStep: "Draft a refresh checklist for editorial review.",
    confidence: "MEDIUM",
    gscEvidenceRefs: [] as string[],
    ...overrides,
  };
}

function allowSet() {
  return new Set(sampleInventory().allowlistedPublicUrls);
}

function pageEvidence(pathValue: string): SeoResearchGscEvidence {
  return {
    id: "P1",
    kind: "page",
    pageUrl: `https://theflixiptv.com${pathValue}`,
    normalizedPath: pathValue,
    classification: "REMOVED_OR_404",
    clicks: 12,
    impressions: 400,
    ctr: 0.03,
    position: 18,
  };
}

function assertNoRawLeak(payload: unknown, banned: RegExp) {
  assert.doesNotMatch(JSON.stringify(payload), banned);
}

test("semantic issue code set is closed and privacy-safe", () => {
  assert.deepEqual([...SEO_RESEARCH_SEMANTIC_ISSUE_CODES], [
    "INVALID_TOP_LEVEL",
    "UNEXPECTED_TOP_LEVEL_FIELD",
    "INVALID_OPPORTUNITY_OBJECT",
    "UNEXPECTED_OPPORTUNITY_FIELD",
    "MISSING_REQUIRED_TEXT",
    "INVALID_SEARCH_INTENT",
    "INVALID_COVERAGE",
    "INVALID_RECOMMENDATION",
    "INVALID_CONFIDENCE",
    "INVALID_RESTORE_PATH_TYPE",
    "REFRESH_TARGET_NOT_ALLOWLISTED",
    "INTERNAL_LINK_TARGET_NOT_ALLOWLISTED",
  ]);
  assert.deepEqual([...SEO_RESEARCH_INCOMPLETE_REASON_CODES], [
    "MAX_OUTPUT_TOKENS",
    "CONTENT_FILTER",
    "UNKNOWN",
  ]);
});

test("evaluate: each rejection category identifies the correct rule", () => {
  const allow = allowSet();
  const cases: Array<{
    label: string;
    raw: unknown;
    issueCode: SeoResearchSemanticIssueCode;
    opportunityIndex?: number;
  }> = [
    { label: "null", raw: null, issueCode: "INVALID_TOP_LEVEL" },
    { label: "array", raw: [], issueCode: "INVALID_TOP_LEVEL" },
    {
      label: "missing opportunities",
      raw: { notOpportunities: [] },
      issueCode: "INVALID_TOP_LEVEL",
    },
    {
      label: "extra top-level",
      raw: { opportunities: [], sources: [] },
      issueCode: "UNEXPECTED_TOP_LEVEL_FIELD",
    },
    {
      label: "bad opportunity object",
      raw: { opportunities: [null] },
      issueCode: "INVALID_OPPORTUNITY_OBJECT",
      opportunityIndex: 0,
    },
    {
      label: "unexpected field",
      raw: { opportunities: [baseOpp({ monthlySearches: 100 })] },
      issueCode: "UNEXPECTED_OPPORTUNITY_FIELD",
      opportunityIndex: 0,
    },
    {
      label: "missing text",
      raw: { opportunities: [baseOpp({ topic: "   " })] },
      issueCode: "MISSING_REQUIRED_TEXT",
      opportunityIndex: 0,
    },
    {
      label: "bad intent",
      raw: { opportunities: [baseOpp({ searchIntent: "NOT_REAL" })] },
      issueCode: "INVALID_SEARCH_INTENT",
      opportunityIndex: 0,
    },
    {
      label: "bad coverage",
      raw: { opportunities: [baseOpp({ existingCoverage: "FULL" })] },
      issueCode: "INVALID_COVERAGE",
      opportunityIndex: 0,
    },
    {
      label: "bad recommendation",
      raw: { opportunities: [baseOpp({ recommendation: "REWRITE" })] },
      issueCode: "INVALID_RECOMMENDATION",
      opportunityIndex: 0,
    },
    {
      label: "bad confidence",
      raw: { opportunities: [baseOpp({ confidence: "ABSOLUTE" })] },
      issueCode: "INVALID_CONFIDENCE",
      opportunityIndex: 0,
    },
    {
      label: "restorePath type",
      raw: { opportunities: [baseOpp({ restorePath: 12 })] },
      issueCode: "INVALID_RESTORE_PATH_TYPE",
      opportunityIndex: 0,
    },
    {
      label: "refresh not allowlisted",
      raw: {
        opportunities: [
          baseOpp({
            recommendation: "REFRESH_EXISTING",
            matchedPublicUrl: "/blogs/invented-slug/",
            existingCoverage: "PARTIAL",
          }),
        ],
      },
      issueCode: "REFRESH_TARGET_NOT_ALLOWLISTED",
      opportunityIndex: 0,
    },
    {
      label: "internal link not allowlisted",
      raw: {
        opportunities: [
          baseOpp({
            recommendation: "INTERNAL_LINK_ONLY",
            matchedPublicUrl: "/blogs/invented-slug/",
            existingCoverage: "STRONG",
          }),
        ],
      },
      issueCode: "INTERNAL_LINK_TARGET_NOT_ALLOWLISTED",
      opportunityIndex: 0,
    },
  ];

  for (const item of cases) {
    const evaluated = evaluateSeoResearchResult(item.raw, allow);
    assert.equal(evaluated.ok, false, item.label);
    if (!evaluated.ok) {
      assert.equal(evaluated.issueCode, item.issueCode, item.label);
      if (item.opportunityIndex !== undefined) {
        assert.equal(evaluated.opportunityIndex, item.opportunityIndex, item.label);
      } else {
        assert.equal(evaluated.opportunityIndex, undefined, item.label);
      }
      assertNoRawLeak(evaluated, /monthlySearches|invented-slug|NOT_REAL|ABSOLUTE|REWRITE|FULL|100/);
    }
    assert.equal(normalizeSeoResearchResult(item.raw, allow), null, item.label);
  }
});

test("evaluate: opportunity index points at the failing item among mixed valid rows", () => {
  const allow = allowSet();
  const raw = {
    opportunities: [
      baseOpp({ topic: "Valid first opportunity topic" }),
      baseOpp({ searchIntent: "BOGUS_INTENT", topic: "Second row fails intent" }),
      baseOpp({ topic: "Third would be fine" }),
    ],
  };
  const evaluated = evaluateSeoResearchResult(raw, allow);
  assert.equal(evaluated.ok, false);
  if (!evaluated.ok) {
    assert.equal(evaluated.issueCode, "INVALID_SEARCH_INTENT");
    assert.equal(evaluated.opportunityIndex, 1);
    assertNoRawLeak(evaluated, /BOGUS_INTENT|Second row fails/);
  }
  assert.equal(normalizeSeoResearchResult(raw, allow), null);
});

test("normalize and evaluate agree on valid NEW_BLOG / REFRESH / INTERNAL_LINK", () => {
  const allow = allowSet();
  const payloads = [
    { opportunities: [baseOpp()] },
    {
      opportunities: [
        baseOpp({
          recommendation: "REFRESH_EXISTING",
          matchedPublicUrl: FIRESTICK,
          matchedTitle: "Firestick guide",
          existingCoverage: "PARTIAL",
        }),
      ],
    },
    {
      opportunities: [
        baseOpp({
          recommendation: "INTERNAL_LINK_ONLY",
          matchedPublicUrl: FIRESTICK,
          matchedTitle: "Firestick guide",
          existingCoverage: "STRONG",
        }),
      ],
    },
    { opportunities: [] },
  ];

  for (const payload of payloads) {
    const normalized = normalizeSeoResearchResult(payload, allow);
    const evaluated = evaluateSeoResearchResult(payload, allow);
    assert.ok(normalized);
    assert.equal(evaluated.ok, true);
    if (evaluated.ok) {
      assert.deepEqual(evaluated.research, normalized);
    }
  }
});

test("RESTORE_HISTORICAL: invalid candidates dropped; valid kept; no whole-payload fail", () => {
  const allow = allowSet();
  const byId = new Map<string, SeoResearchGscEvidence>([[ "P1", pageEvidence(BUFFERING) ]]);
  const options = {
    gscEvidenceById: byId,
    restorationPathAllowlist: new Set([BUFFERING]),
    gscMeta: {
      status: "AVAILABLE" as const,
      statusLabel: "GSC available",
      helperText: "ok",
    },
  };

  const mixed = {
    opportunities: [
      baseOpp(),
      baseOpp({
        recommendation: "RESTORE_HISTORICAL",
        restorePath: "/become-an-iptv-reseller-in-uk/",
        existingCoverage: "NONE",
        gscEvidenceRefs: ["P1"],
      }),
      baseOpp({
        recommendation: "RESTORE_HISTORICAL",
        restorePath: BUFFERING,
        existingCoverage: "NONE",
        gscEvidenceRefs: ["P1"],
      }),
    ],
  };

  const normalized = normalizeSeoResearchResult(mixed, allow, options);
  const evaluated = evaluateSeoResearchResult(mixed, allow, options);
  assert.ok(normalized);
  assert.equal(evaluated.ok, true);
  assert.equal(normalized?.opportunities.length, 2);
  assert.equal(normalized?.opportunities[0]?.recommendation, "NEW_BLOG");
  assert.equal(normalized?.opportunities[1]?.recommendation, "RESTORE_HISTORICAL");
  assert.equal(normalized?.opportunities[1]?.restorePath, BUFFERING);
});

test("RESTORE_HISTORICAL with STRONG coverage is dropped, not coerced", () => {
  const allow = allowSet();
  const byId = new Map<string, SeoResearchGscEvidence>([[ "P1", pageEvidence(BUFFERING) ]]);
  const options = {
    gscEvidenceById: byId,
    restorationPathAllowlist: new Set([BUFFERING]),
  };
  const raw = {
    opportunities: [
      baseOpp({
        recommendation: "RESTORE_HISTORICAL",
        restorePath: BUFFERING,
        existingCoverage: "STRONG",
        gscEvidenceRefs: ["P1"],
      }),
    ],
  };
  const normalized = normalizeSeoResearchResult(raw, allow, options);
  assert.ok(normalized);
  assert.equal(normalized?.opportunities.length, 0);
  assert.equal(evaluateSeoResearchResult(raw, allow, options).ok, true);
});

test("REFRESH/INTERNAL_LINK targeting restrictions still reject whole payload", () => {
  const allow = allowSet();
  assert.equal(
    normalizeSeoResearchResult(
      {
        opportunities: [
          baseOpp({
            recommendation: "REFRESH_EXISTING",
            matchedPublicUrl: "/blogs/not-in-cms/",
            existingCoverage: "PARTIAL",
          }),
        ],
      },
      allow,
    ),
    null,
  );
  const evaluated = evaluateSeoResearchResult(
    {
      opportunities: [
        baseOpp({
          recommendation: "INTERNAL_LINK_ONLY",
          matchedPublicUrl: "/blogs/not-in-cms/",
          existingCoverage: "STRONG",
        }),
      ],
    },
    allow,
  );
  assert.equal(evaluated.ok, false);
  if (!evaluated.ok) {
    assert.equal(evaluated.issueCode, "INTERNAL_LINK_TARGET_NOT_ALLOWLISTED");
  }
});

test("classifyOpenAiIncompleteReason allowlists known values", () => {
  assert.equal(classifyOpenAiIncompleteReason("max_output_tokens"), "MAX_OUTPUT_TOKENS");
  assert.equal(classifyOpenAiIncompleteReason("content_filter"), "CONTENT_FILTER");
  assert.equal(classifyOpenAiIncompleteReason("something_new"), "UNKNOWN");
  assert.equal(classifyOpenAiIncompleteReason(null), "UNKNOWN");
  assert.equal(classifyOpenAiIncompleteReason({ reason: "max_output_tokens" }), "UNKNOWN");
});

test("inspect incomplete exposes bounded incompleteReasonCode without raw text", () => {
  const result = inspectOpenAiResearchResponsesPayload({
    status: "incomplete",
    incomplete_details: { reason: "max_output_tokens" },
    output: [],
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.diagnostic, "RESPONSE_INCOMPLETE");
    assert.equal(result.incompleteReasonCode, "MAX_OUTPUT_TOKENS");
    assertNoRawLeak(result, /max_output_tokens/);
  }

  const unknown = inspectOpenAiResearchResponsesPayload({
    status: "incomplete",
    incomplete_details: { reason: "provider_secret_reason" },
  });
  assert.equal(unknown.ok, false);
  if (!unknown.ok) {
    assert.equal(unknown.incompleteReasonCode, "UNKNOWN");
    assertNoRawLeak(unknown, /provider_secret_reason/);
  }
});

test("provider/research surface semanticIssueCode while preserving invalid_response + SEMANTIC_PAYLOAD_INVALID", async () => {
  resetAiSeoResearchRateLimitForTests();
  const inventory = sampleInventory();

  const provider = await requestOpenAiUkOpportunityResearch(inventory, {
    config: testConfig(),
    fetchImpl: async () =>
      mockJsonResponse({
        status: "completed",
        output: [
          {
            type: "message",
            content: [
              {
                type: "output_text",
                text: JSON.stringify({
                  opportunities: [baseOpp({ searchIntent: "NOT_A_REAL_INTENT" })],
                }),
              },
            ],
          },
        ],
      }),
  });

  assert.equal(provider.ok, false);
  if (!provider.ok) {
    assert.equal(provider.code, "invalid_response");
    assert.equal(provider.diagnostic, "SEMANTIC_PAYLOAD_INVALID");
    assert.equal(provider.semanticIssueCode, "INVALID_SEARCH_INTENT");
    assert.equal(provider.semanticOpportunityIndex, 0);
    assertNoRawLeak(provider, /NOT_A_REAL_INTENT|Bearer|test-key/);
  }

  resetAiSeoResearchRateLimitForTests();
  const research = await researchUkContentOpportunities({
    adminId: "diag-admin",
    ip: "127.0.0.1",
    inventory,
    config: testConfig(),
    fetchImpl: async () =>
      mockJsonResponse({
        status: "completed",
        output: [
          {
            type: "message",
            content: [
              {
                type: "output_text",
                text: JSON.stringify({
                  opportunities: [
                    baseOpp({
                      recommendation: "REFRESH_EXISTING",
                      matchedPublicUrl: "/blogs/missing/",
                      existingCoverage: "PARTIAL",
                    }),
                  ],
                }),
              },
            ],
          },
        ],
      }),
  });

  assert.equal(research.ok, false);
  if (!research.ok) {
    assert.equal(research.code, "invalid_response");
    assert.equal(research.diagnostic, "SEMANTIC_PAYLOAD_INVALID");
    assert.equal(research.semanticIssueCode, "REFRESH_TARGET_NOT_ALLOWLISTED");
    assert.equal(research.semanticOpportunityIndex, 0);
  }
});

test("provider surfaces incompleteReasonCode with RESPONSE_INCOMPLETE", async () => {
  resetAiSeoResearchRateLimitForTests();
  const inventory = sampleInventory();
  const result = await requestOpenAiUkOpportunityResearch(inventory, {
    config: testConfig(),
    fetchImpl: async () =>
      mockJsonResponse({
        status: "incomplete",
        incomplete_details: { reason: "max_output_tokens" },
        output: [],
      }),
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.diagnostic, "RESPONSE_INCOMPLETE");
    assert.equal(result.incompleteReasonCode, "MAX_OUTPUT_TOKENS");
    assert.equal(result.semanticIssueCode, undefined);
  }
});

test("UI panel surfaces semantic and incomplete diagnostic fields without redesign", () => {
  const panel = read("components/sidhu/SeoOpportunitiesPanel.tsx");
  assert.match(panel, /Diagnostic: \{diagnostic\}/);
  assert.match(panel, /semanticIssueCode/);
  assert.match(panel, /semanticOpportunityIndex/);
  assert.match(panel, /incompleteReasonCode/);
  assert.match(panel, /Semantic: \$\{semanticIssueCode\}/);
  assert.doesNotMatch(panel, /Create Blog|Publish opportunity|rawPayload|output_text/);
});

test("Ledger bridge snapshot still omits semanticIssueCode from persisted research contract", () => {
  const attach = read("lib/cms/seo-experiment-ledger/attach-research-durability.ts");
  assert.match(attach, /bridgeResultToLedgerSnapshot/);
  assert.doesNotMatch(attach, /semanticIssueCode/);
  assert.doesNotMatch(attach, /incompleteReasonCode/);
});

test("review: first rejection is deterministic when one row has multiple faults", () => {
  const allow = allowSet();
  // unexpected field is checked before missing text / bad enum
  const raw = {
    opportunities: [
      baseOpp({
        monthlySearches: 999,
        topic: "   ",
        searchIntent: "NOT_REAL",
      }),
    ],
  };
  const evaluated = evaluateSeoResearchResult(raw, allow);
  assert.equal(evaluated.ok, false);
  if (!evaluated.ok) {
    assert.equal(evaluated.issueCode, "UNEXPECTED_OPPORTUNITY_FIELD");
    assert.equal(evaluated.opportunityIndex, 0);
    assertNoRawLeak(evaluated, /monthlySearches|999|NOT_REAL/);
  }
  assert.equal(normalizeSeoResearchResult(raw, allow), null);
});

test("review: valid empty opportunities is success; invalid top-level remains failure", () => {
  const allow = allowSet();
  const emptyOk = evaluateSeoResearchResult({ opportunities: [] }, allow);
  assert.equal(emptyOk.ok, true);
  if (emptyOk.ok) {
    assert.equal(emptyOk.research.opportunities.length, 0);
  }
  assert.deepEqual(normalizeSeoResearchResult({ opportunities: [] }, allow)?.opportunities, []);

  const invalid = evaluateSeoResearchResult({ opportunities: "nope" }, allow);
  assert.equal(invalid.ok, false);
  if (!invalid.ok) {
    assert.equal(invalid.issueCode, "INVALID_TOP_LEVEL");
    assert.equal(invalid.opportunityIndex, undefined);
  }
  assert.equal(normalizeSeoResearchResult({ opportunities: "nope" }, allow), null);
});

test("review: timeout/incomplete stay distinct from SEMANTIC_PAYLOAD_INVALID", async () => {
  resetAiSeoResearchRateLimitForTests();
  const inventory = sampleInventory();

  const timedOut = await requestOpenAiUkOpportunityResearch(inventory, {
    config: testConfig(),
    fetchImpl: async () => {
      const err = new Error("The operation was aborted");
      err.name = "AbortError";
      throw err;
    },
  });
  assert.equal(timedOut.ok, false);
  if (!timedOut.ok) {
    assert.equal(timedOut.code, "timeout");
    assert.equal(timedOut.diagnostic, undefined);
    assert.equal(timedOut.semanticIssueCode, undefined);
    assert.equal(timedOut.incompleteReasonCode, undefined);
  }

  resetAiSeoResearchRateLimitForTests();
  const incomplete = await requestOpenAiUkOpportunityResearch(inventory, {
    config: testConfig(),
    fetchImpl: async () =>
      mockJsonResponse({
        status: "incomplete",
        incomplete_details: { reason: "content_filter" },
        output: [],
      }),
  });
  assert.equal(incomplete.ok, false);
  if (!incomplete.ok) {
    assert.equal(incomplete.diagnostic, "RESPONSE_INCOMPLETE");
    assert.equal(incomplete.incompleteReasonCode, "CONTENT_FILTER");
    assert.equal(incomplete.semanticIssueCode, undefined);
  }
});

test("review: normalize wrapper is the only public accept/reject path over evaluate", () => {
  const schemas = read("lib/cms/ai-seo/research-schemas.ts");
  assert.match(
    schemas,
    /export function normalizeSeoResearchResult[\s\S]*evaluateSeoResearchResult\(raw/,
  );
  // Provider must call evaluate (authoritative), not a second independent validator.
  const provider = read("lib/cms/ai-seo/provider.ts");
  assert.match(provider, /evaluateSeoResearchResult\(/);
  assert.doesNotMatch(provider, /normalizeSeoResearchResult\(/);
});

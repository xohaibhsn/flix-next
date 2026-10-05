/**
 * GSC-4: Opportunities research fusion — bounded GSC AI payload + evidence ID safety.
 * Mocks Google and OpenAI. No real provider calls.
 */

import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import {
  DEFAULT_OPENAI_SEO_MODEL,
  type OpenAiSeoConfig,
} from "../lib/cms/ai-seo/config";
import {
  buildOpenAiUkOpportunityResearchRequestBody,
  requestOpenAiUkOpportunityResearch,
} from "../lib/cms/ai-seo/provider";
import {
  AI_SEO_RESEARCH_RATE_LIMITS,
  checkAiSeoResearchRateLimit,
  resetAiSeoResearchRateLimitForTests,
} from "../lib/cms/ai-seo/rate-limit";
import { researchUkContentOpportunities } from "../lib/cms/ai-seo/research";
import { buildSeoResearchInventory } from "../lib/cms/ai-seo/research-inventory";
import {
  normalizeSeoResearchResult,
  SEO_RESEARCH_RECOMMENDATIONS,
} from "../lib/cms/ai-seo/research-schemas";
import { SeoOpportunitiesPanel } from "../components/sidhu/SeoOpportunitiesPanel";
import { classifyGscPageUrls } from "../lib/cms/gsc/classify-url";
import type { GscUkEvidencePack } from "../lib/cms/gsc/evidence-types";
import {
  buildGscResearchFusionContext,
  collectGscPackPageUrls,
  emptyGscResearchFusionContext,
  GSC_AI_MAX_REFS_PER_OPPORTUNITY,
  GSC_AI_PAGE_LIMIT,
  GSC_AI_QUERY_LIMIT,
  GSC_AI_QUERY_PAGE_LIMIT,
  resolveGscEvidenceRefs,
} from "../lib/cms/gsc/research-fusion";
import { buildGscSiteUrlIndex } from "../lib/cms/gsc/site-url-index";
import type { GscSearchAnalyticsRow } from "../lib/cms/gsc/types";
import type { BlogCategory, BlogPost, SiteSettings } from "../lib/cms/types";

const root = process.cwd();

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

function samplePack(overrides: Partial<GscUkEvidencePack> = {}): GscUkEvidencePack {
  const queries = Array.from({ length: 30 }, (_, i) =>
    row([`query ${i + 1}`], i, 100 + i, 0.01, 10 + i * 0.1),
  );
  const pages = Array.from({ length: 30 }, (_, i) =>
    row([`https://theflixiptv.com/blogs/post-${i + 1}/`], i, 200 + i, 0.02, 8 + i * 0.1),
  );
  const queryPages = Array.from({ length: 50 }, (_, i) =>
    row(
      [`qp query ${i + 1}`, `https://theflixiptv.com/blogs/post-${(i % 10) + 1}/`],
      i,
      50 + i,
      0.03,
      12,
    ),
  );
  const previous = pages.slice(0, 10).map((p, i) =>
    row(p.keys, Math.max(0, p.clicks - 1), p.impressions - 10, 0.015, p.position + 0.5),
  );

  return {
    status: "AVAILABLE",
    window: {
      recentStart: "2026-08-01",
      recentEnd: "2026-08-28",
      previousStart: "2026-07-04",
      previousEnd: "2026-07-31",
      reportingLagDays: 3,
    },
    country: { code: "GB", expression: "gbr" },
    recentQueries: queries,
    recentPages: pages,
    recentQueryPages: queryPages,
    previousPages: previous,
    ...overrides,
  };
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
      id: "post-1",
      title: "Getting Started with The FlixIPTV: A Complete Setup Guide",
      slug: "getting-started-with-the-flixiptv",
      excerpt: "Set up The Flix on your device.",
      content: "<p>body</p>",
      status: "published",
      categoryId: "cat-setup",
      seoTitle: "Getting Started with FlixIPTV",
      seoDescription: "Learn how to get started.",
      updatedAt: "2026-07-20T10:00:00.000Z",
      publishedAt: "2026-07-20T10:00:00.000Z",
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
      seoDescription: "Setup",
    },
  ] as unknown as BlogCategory[];

  return buildSeoResearchInventory({ settings, posts, categories });
}

function opportunityBase(overrides: Record<string, unknown> = {}) {
  return {
    topic: "Firestick buffering fixes",
    workingTitle: "How to Fix IPTV Buffering on Firestick",
    searchIntent: "TROUBLESHOOTING",
    whyNow: "Recent UK guides discuss buffering during peak evening use.",
    webEvidence: "Current web coverage suggests Firestick buffering remains a common UK help topic.",
    existingCoverage: "NONE",
    matchedTitle: "",
    matchedPublicUrl: "",
    recommendation: "NEW_BLOG",
    suggestedAngle: "Add a focused buffering checklist.",
    nextStep: "Draft an outline for editorial review only.",
    confidence: "MEDIUM",
    gscEvidenceRefs: [],
    ...overrides,
  };
}

function responsesPayload(opportunityJson: unknown) {
  return {
    output: [
      {
        type: "web_search_call",
        action: {
          type: "search",
          sources: [{ type: "url", url: "https://example.com/a", title: "A" }],
        },
      },
      {
        type: "message",
        content: [{ type: "output_text", text: JSON.stringify(opportunityJson) }],
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Bounded AI payload + IDs
// ---------------------------------------------------------------------------

test("GSC-4 AI payload is bounded and assigns deterministic evidence IDs", () => {
  const pack = samplePack();
  const fusion = buildGscResearchFusionContext({ pack });
  const evidence = fusion.aiPayload.evidence;

  assert.equal(evidence.filter((e) => e.kind === "query").length, GSC_AI_QUERY_LIMIT);
  assert.equal(evidence.filter((e) => e.kind === "page").length, GSC_AI_PAGE_LIMIT);
  assert.equal(evidence.filter((e) => e.kind === "query_page").length, GSC_AI_QUERY_PAGE_LIMIT);
  assert.ok(evidence.length <= GSC_AI_QUERY_LIMIT + GSC_AI_PAGE_LIMIT + GSC_AI_QUERY_PAGE_LIMIT);

  assert.equal(evidence[0]?.id, "Q1");
  assert.equal(evidence.find((e) => e.kind === "page")?.id, "P1");
  assert.equal(evidence.find((e) => e.kind === "query_page")?.id, "QP1");
  assert.equal(fusion.byId.get("Q1")?.query, "query 1");
  assert.equal(fusion.byId.get("P1")?.clicks, pack.recentPages[0]?.clicks);

  const serialized = JSON.stringify(fusion.aiPayload);
  assert.doesNotMatch(serialized, /PRIVATE KEY|access_token|Bearer |client_email|GSC_PRIVATE/i);
  assert.doesNotMatch(serialized, /raw Google|stack|ECONNREFUSED/i);
  assert.ok(!("previousPages" in fusion.aiPayload));
  assert.ok(fusion.aiPayload.evidence.length < pack.recentQueries.length + pack.recentPages.length + pack.recentQueryPages.length);
});

test("GSC-4 URL classification attaches to page-related evidence only", () => {
  const pack = samplePack({
    recentPages: [
      row(["https://theflixiptv.com/blogs/getting-started-with-the-flixiptv/"], 5, 100, 0.05, 8),
      row(["https://theflixiptv.com/"], 2, 50, 0.04, 3),
    ],
    recentQueryPages: [
      row(["iptv setup", "https://theflixiptv.com/blogs/getting-started-with-the-flixiptv/"], 1, 20, 0.05, 9),
    ],
    recentQueries: [row(["iptv setup"], 10, 200, 0.05, 7)],
    previousPages: [],
  });

  const index = buildGscSiteUrlIndex({
    posts: [
      {
        id: "post-1",
        title: "Getting Started",
        slug: "getting-started-with-the-flixiptv",
        status: "published",
      },
    ],
    pages: [],
    categories: [],
    redirects: [],
  });
  const classifications = classifyGscPageUrls(collectGscPackPageUrls(pack), index);
  const fusion = buildGscResearchFusionContext({ pack, classifications });

  const page = fusion.byId.get("P1");
  assert.equal(page?.classification, "CURRENT_CMS");
  assert.equal(fusion.byId.get("Q1")?.classification, undefined);
  assert.equal(fusion.byId.get("QP1")?.classification, "CURRENT_CMS");

  const rootPage = fusion.byId.get("P2");
  assert.equal(rootPage?.classification, "REDIRECTED_HISTORICAL");
  assert.equal(rootPage?.redirectDestination, "/welcome/");
});

test("GSC-4 evidence ref resolution rejects unknown/duplicate and enforces max", () => {
  const fusion = buildGscResearchFusionContext({ pack: samplePack() });
  const resolved = resolveGscEvidenceRefs(
    ["Q1", "Q1", "UNKNOWN99", "P1", "QP1", "Q2", "Q3", "Q4", "Q5", "Q6", "Q7"],
    fusion.byId,
  );
  assert.deepEqual(resolved.refs, ["Q1", "P1", "QP1", "Q2", "Q3", "Q4", "Q5", "Q6"]);
  assert.equal(resolved.refs.length, GSC_AI_MAX_REFS_PER_OPPORTUNITY);
  assert.ok(!resolved.refs.includes("UNKNOWN99"));
  assert.equal(resolved.resolved[0]?.clicks, fusion.byId.get("Q1")?.clicks);
});

test("GSC-4 historical signal for removed/redirected; root / is not restore-worthy", () => {
  const pack = samplePack({
    recentPages: [
      row(["https://theflixiptv.com/"], 1, 10, 0.1, 2),
      row(["https://theflixiptv.com/old-removed-guide/"], 0, 40, 0, 20),
    ],
    recentQueries: [],
    recentQueryPages: [],
    previousPages: [],
  });
  const index = buildGscSiteUrlIndex({
    pages: [],
    posts: [],
    categories: [],
    redirects: [],
    knownHistorical: [
      {
        path: "/old-removed-guide/",
        key: "old-removed-guide",
        reason: "Known removed",
      },
    ],
  });
  const classifications = classifyGscPageUrls(collectGscPackPageUrls(pack), index);
  const fusion = buildGscResearchFusionContext({ pack, classifications });

  const rootOnly = resolveGscEvidenceRefs(["P1"], fusion.byId);
  assert.equal(fusion.byId.get("P1")?.classification, "REDIRECTED_HISTORICAL");
  assert.equal(rootOnly.historicalSignal, false);

  const removed = resolveGscEvidenceRefs(["P2"], fusion.byId);
  assert.equal(fusion.byId.get("P2")?.classification, "REMOVED_OR_404");
  assert.equal(removed.historicalSignal, true);
});

test("GSC-4 recommendation enum unchanged and RESTORE_HISTORICAL absent", () => {
  assert.deepEqual([...SEO_RESEARCH_RECOMMENDATIONS], [
    "NEW_BLOG",
    "REFRESH_EXISTING",
    "INTERNAL_LINK_ONLY",
    "SKIP",
  ]);
  const schemas = read("lib/cms/ai-seo/research-schemas.ts");
  // Instruction may mention the future enum by name; the recommendation enum must not include it.
  const enumBlock = schemas.slice(
    schemas.indexOf("export const SEO_RESEARCH_RECOMMENDATIONS"),
    schemas.indexOf("export type SeoResearchRecommendation"),
  );
  assert.doesNotMatch(enumBlock, /RESTORE_HISTORICAL/);
  assert.match(schemas, /There is no RESTORE_HISTORICAL recommendation/);
  const panel = read("components/sidhu/SeoOpportunitiesPanel.tsx");
  assert.doesNotMatch(panel, /RESTORE_HISTORICAL/);
});

// ---------------------------------------------------------------------------
// Provider + research orchestration (mocked)
// ---------------------------------------------------------------------------

test("GSC-4 configured research: OpenAI payload includes bounded GSC subset; exactly 1 OpenAI call", async () => {
  resetAiSeoResearchRateLimitForTests();
  const inventory = sampleInventory();
  const fusion = buildGscResearchFusionContext({ pack: samplePack() });
  let calls = 0;
  let requestBody = "";

  const result = await requestOpenAiUkOpportunityResearch(inventory, {
    config: testConfig(),
    gscFusion: fusion,
    fetchImpl: async (_url, init) => {
      calls += 1;
      requestBody = String(init?.body || "");
      return mockJsonResponse(
        responsesPayload({
          opportunities: [
            opportunityBase({
              gscEvidenceRefs: ["Q1", "BOGUS", "Q1", "P1"],
            }),
          ],
        }),
      );
    },
  });

  assert.equal(calls, 1);
  assert.equal(result.ok, true);
  if (!result.ok) return;

  const user = JSON.parse(
    (JSON.parse(requestBody) as { input: Array<{ content: Array<{ text: string }> }> }).input[1]
      .content[0].text,
  ) as {
    gscEvidence: { evidence: unknown[]; status: string };
  };
  assert.equal(user.gscEvidence.status, "AVAILABLE");
  assert.equal((user.gscEvidence.evidence as unknown[]).length, GSC_AI_QUERY_LIMIT + GSC_AI_PAGE_LIMIT + GSC_AI_QUERY_PAGE_LIMIT);
  assert.doesNotMatch(requestBody, /PRIVATE KEY|access_token|GSC_PRIVATE/i);

  assert.deepEqual(result.research.opportunities[0]?.gscEvidenceRefs, ["Q1", "P1"]);
  assert.equal(result.research.opportunities[0]?.gscEvidence[0]?.clicks, fusion.byId.get("Q1")?.clicks);
  assert.equal(result.research.gsc?.status, "AVAILABLE");
  assert.equal(result.research.gsc?.statusLabel, "GSC evidence included");
});

test("GSC-4 NOT_CONFIGURED: research still runs once with empty Google evidence", async () => {
  resetAiSeoResearchRateLimitForTests();
  const inventory = sampleInventory();
  const fusion = emptyGscResearchFusionContext("NOT_CONFIGURED");
  let calls = 0;

  const result = await researchUkContentOpportunities({
    adminId: "admin-gsc4",
    ip: "9.9.9.9",
    inventory,
    config: testConfig(),
    gscFusion: fusion,
    fetchImpl: async () => {
      calls += 1;
      return mockJsonResponse(responsesPayload({ opportunities: [opportunityBase()] }));
    },
  });

  assert.equal(calls, 1);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.research.gsc?.status, "NOT_CONFIGURED");
  assert.match(result.research.gsc?.helperText || "", /not connected yet/i);
  assert.equal(result.research.opportunities[0]?.gscEvidence.length, 0);
});

test("GSC-4 UNAVAILABLE and NO_ROWS still produce one OpenAI research call", async () => {
  resetAiSeoResearchRateLimitForTests();
  const inventory = sampleInventory();

  for (const status of ["UNAVAILABLE", "NO_ROWS"] as const) {
    let calls = 0;
    const fusion =
      status === "NO_ROWS"
        ? buildGscResearchFusionContext({
            pack: samplePack({
              status: "NO_ROWS",
              recentQueries: [],
              recentPages: [],
              recentQueryPages: [],
              previousPages: [],
            }),
          })
        : emptyGscResearchFusionContext("UNAVAILABLE");

    const result = await researchUkContentOpportunities({
      adminId: `admin-${status}`,
      ip: "8.8.8.8",
      inventory,
      config: testConfig(),
      gscFusion: fusion,
      fetchImpl: async () => {
        calls += 1;
        return mockJsonResponse(responsesPayload({ opportunities: [opportunityBase()] }));
      },
    });
    assert.equal(calls, 1, status);
    assert.equal(result.ok, true, status);
    if (!result.ok) return;
    assert.equal(result.research.gsc?.status, status);
  }
});

test("GSC-4 model cannot inject authoritative numeric GSC fields", () => {
  const fusion = buildGscResearchFusionContext({ pack: samplePack() });
  const allow = new Set<string>();
  const poisoned = normalizeSeoResearchResult(
    {
      opportunities: [
        opportunityBase({
          gscEvidenceRefs: ["Q1"],
          clicks: 9999,
          impressions: 9999,
        }),
      ],
    },
    allow,
    { gscEvidenceById: fusion.byId, gscMeta: fusion.meta },
  );
  assert.equal(poisoned, null);

  const ok = normalizeSeoResearchResult(
    { opportunities: [opportunityBase({ gscEvidenceRefs: ["Q1"] })] },
    allow,
    { gscEvidenceById: fusion.byId, gscMeta: fusion.meta },
  );
  assert.ok(ok);
  assert.equal(ok?.opportunities[0]?.gscEvidence[0]?.clicks, fusion.byId.get("Q1")?.clicks);
  assert.notEqual(ok?.opportunities[0]?.gscEvidence[0]?.clicks, 9999);
});

test("GSC-4 request body keeps web_search required and includes gscEvidence", () => {
  const inventory = sampleInventory();
  const fusion = buildGscResearchFusionContext({ pack: samplePack() });
  const body = buildOpenAiUkOpportunityResearchRequestBody(inventory, testConfig(), fusion);
  assert.equal(body.tool_choice, "required");
  assert.equal(body.tools[0]?.type, "web_search");
  const user = JSON.parse(body.input[1].content[0].text as string) as {
    gscEvidence: { evidence: Array<{ id: string }>; notes: string[] };
  };
  assert.ok(user.gscEvidence.evidence.some((e) => e.id === "Q1"));
  assert.ok(user.gscEvidence.notes.some((n) => /factual/i.test(n)));
});

test("GSC-4 rate limiter unchanged (2/min burst, 10/day)", () => {
  resetAiSeoResearchRateLimitForTests();
  assert.equal(AI_SEO_RESEARCH_RATE_LIMITS.burstMax, 2);
  assert.equal(AI_SEO_RESEARCH_RATE_LIMITS.dailyMax, 10);
  assert.equal(checkAiSeoResearchRateLimit("gsc4", "1.1.1.1").ok, true);
  assert.equal(checkAiSeoResearchRateLimit("gsc4", "1.1.1.1").ok, true);
  assert.equal(checkAiSeoResearchRateLimit("gsc4", "1.1.1.1").ok, false);
});

// ---------------------------------------------------------------------------
// UI + resource safety (static)
// ---------------------------------------------------------------------------

test("GSC-4 UI renders GSC status and resolved evidence; no standalone GSC nav", () => {
  const panel = read("components/sidhu/SeoOpportunitiesPanel.tsx");
  const nav = read("lib/cms/sidhu-seo-nav.ts");
  const run = read("lib/cms/ai-seo/research-run.ts");
  const page = read("app/sidhu/(protected)/seo/opportunities/page.tsx");

  assert.match(panel, /GSC Evidence/);
  assert.match(panel, /Historical GSC URL detected/);
  assert.match(panel, /Current web evidence/i);
  assert.match(panel, /Existing Flix coverage/i);
  assert.match(panel, /AI assessment/i);
  assert.match(panel, /from ["']@\/lib\/cms\/gsc\/probe-types["']/);
  assert.match(panel, /from ["']@\/lib\/cms\/gsc\/gsc-actions["']/);
  assert.doesNotMatch(panel, /from ["']@\/lib\/cms\/gsc\/(auth|search-analytics|evidence-pack|probe)["']/);
  assert.doesNotMatch(panel, /Create Blog|Save opportunity|Publish|RESTORE_HISTORICAL/);
  assert.doesNotMatch(nav, /\/sidhu\/seo\/gsc\//);
  assert.doesNotMatch(page, /buildUkGscEvidencePack|querySearchAnalytics/);
  assert.match(run, /buildUkGscEvidencePack/);
  assert.match(run, /buildGscSiteUrlIndex/);
  assert.match(run, /classifyGscPageUrls/);
  assert.match(run, /buildGscResearchFusionContext/);

  const html = renderToStaticMarkup(
    createElement(SeoOpportunitiesPanel, {
      aiConfigured: true,
      gscProbeAction: async () => ({
        ok: false as const,
        code: "unauthorized" as const,
        error: "unused",
      }),
      researchAction: async () => ({
        ok: true as const,
        research: {
          gsc: {
            status: "NOT_CONFIGURED" as const,
            statusLabel: "GSC not connected yet",
            helperText:
              "GSC not connected yet — this run used current web research and existing site coverage.",
          },
          opportunities: [
            {
              ...opportunityBase({
                gscEvidenceRefs: ["Q1"],
                gscEvidence: [
                  {
                    id: "Q1",
                    kind: "query" as const,
                    query: "iptv buffering firestick",
                    clicks: 3,
                    impressions: 120,
                    ctr: 0.025,
                    position: 14.2,
                  },
                ],
                historicalSignal: false,
              }),
              gscEvidenceRefs: ["Q1"],
              gscEvidence: [
                {
                  id: "Q1",
                  kind: "query" as const,
                  query: "iptv buffering firestick",
                  clicks: 3,
                  impressions: 120,
                  ctr: 0.025,
                  position: 14.2,
                },
              ],
              historicalSignal: false,
              searchIntent: "TROUBLESHOOTING" as const,
              existingCoverage: "NONE" as const,
              recommendation: "NEW_BLOG" as const,
              confidence: "MEDIUM" as const,
              matchedTitle: null,
              matchedPublicUrl: null,
            },
          ],
          sources: [],
        },
      }),
    }),
  );
  // Initial render has no research yet — deliberate empty state.
  assert.match(html, /Research UK opportunities/);
  assert.match(html, /does not run automatically/i);
  assert.doesNotMatch(html, /Create Blog|Save opportunity/);
});

test("GSC-4 page load path does not import GSC into Opportunities page", () => {
  const page = read("app/sidhu/(protected)/seo/opportunities/page.tsx");
  const overview = read("components/sidhu/SeoOverviewHub.tsx");
  assert.doesNotMatch(page, /buildUkGscEvidencePack|research-fusion|querySearchAnalytics/);
  assert.doesNotMatch(overview, /buildUkGscEvidencePack|research-fusion/);
  assert.doesNotMatch(overview, /researchUkContentOpportunitiesAction/);
});

test("GSC-4 research-run is the fusion orchestration point (single OpenAI via research)", () => {
  const run = read("lib/cms/ai-seo/research-run.ts");
  const research = read("lib/cms/ai-seo/research.ts");
  assert.match(run, /buildUkGscEvidencePack/);
  assert.match(run, /researchUkContentOpportunities/);
  assert.doesNotMatch(run, /requestOpenAiUkOpportunityResearch/);
  assert.match(research, /requestOpenAiUkOpportunityResearch/);
  assert.doesNotMatch(research, /buildUkGscEvidencePack/);
  // Import + single call site only (no second fusion OpenAI request).
  assert.equal((research.match(/await requestOpenAiUkOpportunityResearch/g) || []).length, 1);
});

test("GSC-4 research service with injected fusion: 0 Google + 1 OpenAI (no CMS side effects)", async () => {
  // Prefer research() + injected fusion over research-run→cms to avoid JSON store side effects.
  resetAiSeoResearchRateLimitForTests();
  const inventory = sampleInventory();
  let openaiCalls = 0;

  const notConfigured = await researchUkContentOpportunities({
    adminId: "gsc4-run-a",
    ip: "2.2.2.2",
    inventory,
    config: testConfig(),
    gscFusion: emptyGscResearchFusionContext("NOT_CONFIGURED"),
    fetchImpl: async () => {
      openaiCalls += 1;
      return mockJsonResponse(responsesPayload({ opportunities: [opportunityBase()] }));
    },
  });
  assert.equal(openaiCalls, 1);
  assert.equal(notConfigured.ok, true);
  if (notConfigured.ok) {
    assert.equal(notConfigured.research.gsc?.status, "NOT_CONFIGURED");
  }

  resetAiSeoResearchRateLimitForTests();
  openaiCalls = 0;
  const fusion = buildGscResearchFusionContext({ pack: samplePack() });
  const configured = await researchUkContentOpportunities({
    adminId: "gsc4-run-b",
    ip: "3.3.3.3",
    inventory,
    config: testConfig(),
    gscFusion: fusion,
    fetchImpl: async () => {
      openaiCalls += 1;
      return mockJsonResponse(
        responsesPayload({
          opportunities: [opportunityBase({ gscEvidenceRefs: ["Q1", "P1"] })],
        }),
      );
    },
  });
  assert.equal(openaiCalls, 1);
  assert.equal(configured.ok, true);
  if (configured.ok) {
    assert.equal(configured.research.gsc?.status, "AVAILABLE");
    assert.deepEqual(configured.research.opportunities[0]?.gscEvidenceRefs, ["Q1", "P1"]);
  }

  const run = read("lib/cms/ai-seo/research-run.ts");
  assert.match(run, /buildUkGscEvidencePack/);
  assert.match(run, /buildGscSiteUrlIndex/);
  assert.match(run, /classifyGscPageUrls/);
  assert.match(run, /buildGscResearchFusionContext/);
  assert.match(run, /listActiveRedirects/);
});

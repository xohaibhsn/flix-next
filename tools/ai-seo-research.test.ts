import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { test } from "node:test";
import {
  DEFAULT_OPENAI_SEO_MODEL,
  getOpenAiSeoResearchConfig,
  type OpenAiSeoConfig,
} from "../lib/cms/ai-seo/config";
import {
  buildOpenAiUkOpportunityResearchRequestBody,
  extractResponsesOutputText,
  extractWebSearchSources,
  requestOpenAiUkOpportunityResearch,
} from "../lib/cms/ai-seo/provider";
import {
  AI_SEO_RESEARCH_RATE_LIMITS,
  checkAiSeoResearchRateLimit,
  resetAiSeoResearchRateLimitForTests,
} from "../lib/cms/ai-seo/rate-limit";
import { researchUkContentOpportunities } from "../lib/cms/ai-seo/research";
import {
  buildSeoResearchInventory,
  SEO_RESEARCH_INVENTORY_LIMITS,
} from "../lib/cms/ai-seo/research-inventory";
import {
  normalizeSeoResearchResult,
  normalizeSeoResearchSources,
} from "../lib/cms/ai-seo/research-schemas";
import { SeoOpportunitiesPanel } from "../components/sidhu/SeoOpportunitiesPanel";
import type { BlogCategory, BlogPost, SiteSettings } from "../lib/cms/types";

const root = process.cwd();

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
      id: "post-1",
      title: "Getting Started with The FlixIPTV: A Complete Setup Guide",
      slug: "getting-started-with-the-flixiptv",
      excerpt: "Set up The Flix on your device.",
      content: "<p>FULL ARTICLE BODY MUST NOT BE SENT</p>".repeat(40),
      status: "published",
      categoryId: "cat-setup",
      seoTitle: "Getting Started with FlixIPTV: Complete Setup Guide",
      seoDescription: "Learn how to get started with The FlixIPTV.",
      updatedAt: "2026-07-20T10:00:00.000Z",
      publishedAt: "2026-07-20T10:00:00.000Z",
    },
  ] as unknown as BlogPost[];

  const categories = [
    {
      id: "cat-setup",
      name: "Setup",
      slug: "setup",
      description: "Device and playlist setup guides.",
      active: true,
      seoTitle: "IPTV Device Setup Guides",
      seoDescription: "Practical guides for setting up IPTV apps.",
    },
  ] as unknown as BlogCategory[];

  return buildSeoResearchInventory({ settings, posts, categories });
}

function goodOpportunityPayload() {
  return {
    opportunities: [
      {
        topic: "Firestick buffering fixes",
        workingTitle: "How to Fix IPTV Buffering on Firestick",
        searchIntent: "TROUBLESHOOTING",
        whyNow: "Recent UK guides discuss buffering during peak evening use.",
        webEvidence: "Current web coverage suggests Firestick buffering remains a common UK help topic.",
        existingCoverage: "PARTIAL",
        matchedTitle: "Getting Started with The FlixIPTV: A Complete Setup Guide",
        matchedPublicUrl: "/blogs/getting-started-with-the-flixiptv/",
        recommendation: "REFRESH_EXISTING",
        suggestedAngle: "Add a focused buffering checklist without duplicating the whole setup guide.",
        nextStep: "Review the existing setup guide and expand the troubleshooting section.",
        confidence: "MEDIUM",
        gscEvidenceRefs: [],
        restorePath: "",
      },
      {
        topic: "Best IPTV apps for Smart TV",
        workingTitle: "Best IPTV Apps for UK Smart TVs",
        searchIntent: "COMPARISON",
        whyNow: "Device buyers still look for compatible player apps.",
        webEvidence: "Recent sources discuss Smart TV player choices and compatibility.",
        existingCoverage: "NONE",
        matchedTitle: "",
        matchedPublicUrl: "",
        recommendation: "NEW_BLOG",
        suggestedAngle: "Compare legitimate player options and setup expectations.",
        nextStep: "Draft an outline for editorial review only.",
        confidence: "HIGH",
        gscEvidenceRefs: [],
        restorePath: "",
      },
    ],
  };
}

function responsesPayload(opportunityJson: unknown, sources: Array<{ url: string; title?: string }> = []) {
  return {
    output: [
      {
        type: "web_search_call",
        action: {
          type: "search",
          sources: sources.map((source) => ({ type: "url", ...source })),
        },
      },
      {
        type: "message",
        content: [
          {
            type: "output_text",
            text: JSON.stringify(opportunityJson),
          },
        ],
      },
    ],
  };
}

test("research request body enables required live web_search with UK GB targeting", () => {
  const inventory = sampleInventory();
  const body = buildOpenAiUkOpportunityResearchRequestBody(inventory, testConfig());
  assert.equal(body.model, DEFAULT_OPENAI_SEO_MODEL);
  assert.equal(body.store, false);
  assert.equal(body.tool_choice, "required");
  assert.deepEqual(body.include, ["web_search_call.action.sources"]);
  assert.equal(Array.isArray(body.tools), true);
  assert.equal(body.tools.length, 1);
  assert.equal(body.tools[0]?.type, "web_search");
  assert.equal(body.tools[0]?.search_context_size, "medium");
  assert.equal(body.tools[0]?.external_web_access, true);
  assert.deepEqual(body.tools[0]?.user_location, { type: "approximate", country: "GB" });
  assert.equal(body.text.format.name, "sidhu_seo_uk_opportunities");
  const user = JSON.parse(body.input[1].content[0].text as string) as {
    inventory: Array<{ content?: string; label: string }>;
  };
  assert.ok(user.inventory.some((item) => item.label.includes("Getting Started")));
  assert.ok(user.inventory.every((item) => !("content" in item) || item.content == null));
  assert.doesNotMatch(JSON.stringify(user), /FULL ARTICLE BODY MUST NOT BE SENT/);
});

test("optional OPENAI_SEO_RESEARCH_MODEL falls back to OPENAI_SEO_MODEL", () => {
  const previousResearch = process.env.OPENAI_SEO_RESEARCH_MODEL;
  const previousModel = process.env.OPENAI_SEO_MODEL;
  const previousKey = process.env.OPENAI_API_KEY;
  try {
    process.env.OPENAI_API_KEY = "x";
    process.env.OPENAI_SEO_MODEL = "gpt-6-luna";
    delete process.env.OPENAI_SEO_RESEARCH_MODEL;
    assert.equal(getOpenAiSeoResearchConfig().model, "gpt-6-luna");
    process.env.OPENAI_SEO_RESEARCH_MODEL = "gpt-research-override";
    assert.equal(getOpenAiSeoResearchConfig().model, "gpt-research-override");
  } finally {
    if (previousResearch === undefined) delete process.env.OPENAI_SEO_RESEARCH_MODEL;
    else process.env.OPENAI_SEO_RESEARCH_MODEL = previousResearch;
    if (previousModel === undefined) delete process.env.OPENAI_SEO_MODEL;
    else process.env.OPENAI_SEO_MODEL = previousModel;
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousKey;
  }
});

test("one research call produces exactly one Responses request and no retry", async () => {
  resetAiSeoResearchRateLimitForTests();
  const inventory = sampleInventory();
  let calls = 0;
  const result = await requestOpenAiUkOpportunityResearch(inventory, {
    config: testConfig(),
    fetchImpl: async () => {
      calls += 1;
      return mockJsonResponse(
        responsesPayload(goodOpportunityPayload(), [
          { url: "https://example.com/firestick-buffering", title: "Buffering guide" },
          { url: "https://example.com/firestick-buffering", title: "Duplicate" },
          { url: "javascript:alert(1)", title: "Unsafe" },
        ]),
      );
    },
  });
  assert.equal(calls, 1);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.research.opportunities.length, 2);
  assert.equal(result.research.sources.length, 1);
  assert.equal(result.research.sources[0]?.domain, "example.com");
});

test("research service rate limit is stricter and empty opportunities fail calmly", async () => {
  resetAiSeoResearchRateLimitForTests();
  assert.equal(AI_SEO_RESEARCH_RATE_LIMITS.burstMax, 2);
  assert.equal(AI_SEO_RESEARCH_RATE_LIMITS.dailyMax, 10);

  const settings = { siteName: "Flix IPTV", pageSeo: {} } as unknown as SiteSettings;
  const posts = [
    {
      id: "post-1",
      title: "Getting Started with The FlixIPTV: A Complete Setup Guide",
      slug: "getting-started-with-the-flixiptv",
      excerpt: "Set up The Flix on your device.",
      content: "<p>secret body</p>",
      status: "published",
      categoryId: null,
      seoTitle: "Getting Started with FlixIPTV: Complete Setup Guide",
      seoDescription: "Learn how to get started.",
    },
  ] as unknown as BlogPost[];
  const categories = [] as BlogCategory[];

  const inventory = buildSeoResearchInventory({ settings, posts, categories });
  let calls = 0;
  const first = await researchUkContentOpportunities({
    inventory,
    adminId: "admin-1",
    ip: "1.1.1.1",
    config: testConfig(),
    fetchImpl: async () => {
      calls += 1;
      return mockJsonResponse(responsesPayload(goodOpportunityPayload()));
    },
  });
  assert.equal(first.ok, true);
  assert.equal(calls, 1);

  const second = await researchUkContentOpportunities({
    inventory,
    adminId: "admin-1",
    ip: "1.1.1.1",
    config: testConfig(),
    fetchImpl: async () => {
      calls += 1;
      return mockJsonResponse(responsesPayload({ opportunities: [] }));
    },
  });
  // Second call still allowed (burst 2); empty result becomes calm empty failure.
  assert.equal(second.ok, false);
  if (!second.ok) assert.equal(second.code, "empty");

  const third = await researchUkContentOpportunities({
    inventory,
    adminId: "admin-1",
    ip: "1.1.1.1",
    config: testConfig(),
    fetchImpl: async () => {
      calls += 1;
      return mockJsonResponse(responsesPayload(goodOpportunityPayload()));
    },
  });
  assert.equal(third.ok, false);
  if (!third.ok) assert.equal(third.code, "rate_limited");
  assert.equal(calls, 2);
});

test("inventory is bounded and excludes article bodies / admin data", () => {
  const inventory = sampleInventory();
  assert.ok(inventory.items.length > 0);
  assert.ok(inventory.allowlistedPublicUrls.includes("/blogs/getting-started-with-the-flixiptv/"));
  assert.ok(inventory.allowlistedPublicUrls.includes("/category/setup/"));
  assert.ok(inventory.items.every((item) => !("content" in item)));
  assert.ok(inventory.items.every((item) => (item.description || "").length <= SEO_RESEARCH_INVENTORY_LIMITS.descCap));
  assert.doesNotMatch(JSON.stringify(inventory), /password|admin|message|OPENAI|FULL ARTICLE BODY/i);
});

test("unknown internal URL mapping is rejected; allowlisted refresh mapping accepted", () => {
  const allow = new Set(["/blogs/getting-started-with-the-flixiptv/"]);
  const good = normalizeSeoResearchResult(goodOpportunityPayload(), allow);
  assert.ok(good);
  assert.equal(good?.opportunities[0]?.recommendation, "REFRESH_EXISTING");
  assert.equal(good?.opportunities[0]?.matchedPublicUrl, "/blogs/getting-started-with-the-flixiptv/");

  const bad = normalizeSeoResearchResult(
    {
      opportunities: [
        {
          ...goodOpportunityPayload().opportunities[0],
          matchedPublicUrl: "/blogs/invented-post/",
        },
      ],
    },
    allow,
  );
  assert.equal(bad, null);

  const unsupportedField = normalizeSeoResearchResult(
    {
      opportunities: [
        {
          ...goodOpportunityPayload().opportunities[1],
          monthlySearches: 1200,
        },
      ],
    },
    allow,
  );
  assert.equal(unsupportedField, null);
});

test("enums, max 5 opportunities, source safety and dedupe are enforced", () => {
  const allow = new Set<string>();
  const tooMany = {
    opportunities: Array.from({ length: 6 }, (_, index) => ({
      ...goodOpportunityPayload().opportunities[1],
      topic: `Topic ${index}`,
      workingTitle: `Title ${index}`,
    })),
  };
  // JSON schema maxItems is provider-side; server normalizer slices to 5.
  const normalized = normalizeSeoResearchResult(tooMany, allow);
  assert.equal(normalized?.opportunities.length, 5);

  const badIntent = normalizeSeoResearchResult(
    {
      opportunities: [{ ...goodOpportunityPayload().opportunities[1], searchIntent: "TRENDING" }],
    },
    allow,
  );
  assert.equal(badIntent, null);

  const sources = normalizeSeoResearchSources([
    { title: "A", url: "https://a.example/x" },
    { title: "A2", url: "https://a.example/x" },
    { title: "Bad", url: "data:text/html,hi" },
    { title: "B", url: "http://b.example/y" },
  ]);
  assert.equal(sources.length, 2);
  assert.deepEqual(
    sources.map((source) => source.domain),
    ["a.example", "b.example"],
  );

  const extracted = extractWebSearchSources(
    responsesPayload(goodOpportunityPayload(), [
      { url: "https://source.example/one", title: "One" },
      { url: "https://source.example/one", title: "One again" },
    ]),
  );
  assert.equal(extracted.length, 1);
});

test("UI is deliberate, mutation-free, and Overview/nav expose Opportunities", () => {
  const panel = read("components/sidhu/SeoOpportunitiesPanel.tsx");
  const page = read("app/sidhu/(protected)/seo/opportunities/page.tsx");
  const actions = read("lib/cms/ai-seo-actions.ts");
  const hub = read("components/sidhu/SeoOverviewHub.tsx");
  const nav = read("lib/cms/sidhu-seo-nav.ts");
  const research = read("lib/cms/ai-seo/research.ts");
  const provider = read("lib/cms/ai-seo/provider.ts");

  assert.match(nav, /Opportunities/);
  assert.match(nav, /\/sidhu\/seo\/opportunities\//);
  assert.match(hub, /UK Content Opportunities/);
  assert.match(hub, /Open Opportunities/);
  assert.doesNotMatch(hub, /researchUkContentOpportunitiesAction/);
  assert.match(hub, /Research UK opportunities/);
  assert.doesNotMatch(page, /useEffect\(/);
  assert.match(page, /SeoOpportunitiesPanel/);
  assert.match(page, /researchUkContentOpportunitiesAction/);
  assert.match(page, /SeoModuleChrome/);
  assert.match(actions, /requireAdminActor\("seo"\)/);
  assert.match(actions, /researchUkContentOpportunitiesAction/);
  assert.doesNotMatch(research, /savePage|savePost|saveCategory|saveSeoHealthState|createPost|publish/);
  assert.doesNotMatch(panel, /Create Blog|Create Draft|Save opportunity|Publish/);
  assert.match(panel, /RESTORE_HISTORICAL/);
  assert.match(panel, /Restore historical/);
  assert.match(panel, /Research UK opportunities/);
  assert.match(panel, /Current web evidence/);
  assert.match(panel, /Existing Flix coverage/);
  assert.match(panel, /GSC Evidence/);
  assert.match(panel, /Research sources/);
  assert.match(panel, /noopener noreferrer/);
  assert.match(panel, /Test GSC connection/);
  assert.match(panel, /gsc\/probe-types|gsc\/gsc-actions/);
  assert.doesNotMatch(panel, /getGscAccessToken|querySearchAnalytics|GSC_PRIVATE_KEY|evidence-pack/);
  assert.doesNotMatch(panel, /Google trending searches|monthly searches|keyword difficulty|CPC/i);
  assert.doesNotMatch(panel, /Create Blog|Save opportunity/);
  assert.match(panel, /RESTORE_HISTORICAL/);
  assert.doesNotMatch(nav, /\/sidhu\/seo\/gsc\//);
  assert.match(provider, /tool_choice: "required"/);
  assert.match(provider, /web_search/);
  assert.match(provider, /external_web_access: true/);

  const html = renderToStaticMarkup(
    createElement(SeoOpportunitiesPanel, {
      proceedAction: async () => ({ ok: false as const, error: "unused" }),
      aiConfigured: true,
      researchAction: async () => ({
        ok: false as const,
        code: "unavailable" as const,
        error: "unavailable",
      }),
      gscProbeAction: async () => ({
        ok: false as const,
        code: "unauthorized" as const,
        error: "unused",
      }),
    }),
  );
  assert.match(html, /Research UK opportunities/);
  assert.match(html, /Test GSC connection/);
  assert.match(html, /does not run automatically/i);
  assert.doesNotMatch(html, /Create Blog|Save opportunity/);
});

test("checkAiSeoResearchRateLimit helper exists for burst ceiling", () => {
  resetAiSeoResearchRateLimitForTests();
  assert.equal(checkAiSeoResearchRateLimit("a", "1.2.3.4").ok, true);
  assert.equal(checkAiSeoResearchRateLimit("a", "1.2.3.4").ok, true);
  assert.equal(checkAiSeoResearchRateLimit("a", "1.2.3.4").ok, false);
});

test("draft/explain provider builders remain free of web_search tools", () => {
  const provider = read("lib/cms/ai-seo/provider.ts");
  assert.match(provider, /function buildStructuredRequestBody/);
  // Research builder is separate; shared structured builder must not gain tools.
  const structuredStart = provider.indexOf("function buildStructuredRequestBody");
  const structuredEnd = provider.indexOf("async function requestOpenAiStructuredJson");
  const structured = provider.slice(structuredStart, structuredEnd);
  assert.doesNotMatch(structured, /web_search|tool_choice|tools:/);
});

// --- P0 Responses extraction hardening (extractor-direct + Research e2e) ---

test("extractor-direct: top-level output_text wins alone without output[] concat", () => {
  const text = extractResponsesOutputText({
    output_text: '{"from":"top"}',
    output: [
      {
        type: "message",
        content: [{ type: "output_text", text: '{"from":"message"}' }],
      },
    ],
  });
  assert.equal(text, '{"from":"top"}');
});

test("extractor-direct: contiguous output_text fragments join without newline", () => {
  // Previous join("\\n") inserted a newline inside the JSON string and broke parse.
  const text = extractResponsesOutputText({
    output: [
      {
        type: "message",
        role: "assistant",
        content: [
          { type: "output_text", text: '{"topic":"Smart' },
          { type: "output_text", text: ' TV"}' },
        ],
      },
    ],
  });
  assert.equal(text, '{"topic":"Smart TV"}');
  assert.deepEqual(JSON.parse(text), { topic: "Smart TV" });
});

test("extractor-direct: ignores web_search_call and bare-text tool contamination", () => {
  const json = JSON.stringify({ ok: true });
  const text = extractResponsesOutputText({
    output: [
      {
        type: "web_search_call",
        text: "IGNORE_TOOL_TEXT",
        content: [{ type: "output_text", text: '{"poison":true}' }],
      },
      {
        type: "tool_result",
        content: [{ text: "also-ignore-untyped" }],
      },
      {
        type: "message",
        content: [{ type: "output_text", text: json }],
      },
    ],
  });
  assert.equal(text, json);
});

test("extractor-direct: fails closed on multiple independent assistant messages", () => {
  const text = extractResponsesOutputText({
    output: [
      {
        type: "message",
        content: [{ type: "output_text", text: '{"a":1}' }],
      },
      {
        type: "message",
        content: [{ type: "output_text", text: '{"b":2}' }],
      },
    ],
  });
  assert.equal(text, "");
});

test("extractor-direct: rejects prose/fenced contamination as non-JSON-ready text", () => {
  assert.equal(
    extractResponsesOutputText({
      output: [
        {
          type: "message",
          content: [{ type: "output_text", text: 'Here you go: {"a":1}' }],
        },
      ],
    }),
    'Here you go: {"a":1}',
  );
  assert.throws(() => JSON.parse('Here you go: {"a":1}'));
  assert.equal(
    extractResponsesOutputText({
      output: [
        {
          type: "message",
          content: [{ type: "output_text", text: "```json\n{\"a\":1}\n```" }],
        },
      ],
    }),
    "```json\n{\"a\":1}\n```",
  );
  assert.throws(() => JSON.parse("```json\n{\"a\":1}\n```"));
});

test("research e2e: web_search_call + split assistant JSON fragments succeed once (no retry)", async () => {
  resetAiSeoResearchRateLimitForTests();
  const inventory = sampleInventory();
  const opportunityJson = goodOpportunityPayload();
  const raw = JSON.stringify(opportunityJson);
  const mid = Math.floor(raw.length / 2);
  let calls = 0;
  const result = await requestOpenAiUkOpportunityResearch(inventory, {
    config: testConfig(),
    fetchImpl: async () => {
      calls += 1;
      return mockJsonResponse({
        status: "completed",
        output: [
          {
            type: "web_search_call",
            action: {
              type: "search",
              sources: [{ type: "url", url: "https://example.com/a", title: "A" }],
            },
            text: "TOOL_TEXT_MUST_NOT_CONTAMINATE",
          },
          {
            type: "message",
            role: "assistant",
            content: [
              { type: "output_text", text: raw.slice(0, mid) },
              { type: "output_text", text: raw.slice(mid) },
            ],
          },
        ],
      });
    },
  });
  assert.equal(calls, 1);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.research.opportunities.length, 2);
  assert.equal(result.research.sources.length, 1);
});

test("research e2e: ambiguous multi-message JSON fails closed without retry", async () => {
  resetAiSeoResearchRateLimitForTests();
  const inventory = sampleInventory();
  let calls = 0;
  const result = await requestOpenAiUkOpportunityResearch(inventory, {
    config: testConfig(),
    fetchImpl: async () => {
      calls += 1;
      return mockJsonResponse({
        status: "completed",
        output: [
          {
            type: "message",
            content: [{ type: "output_text", text: JSON.stringify(goodOpportunityPayload()) }],
          },
          {
            type: "message",
            content: [{ type: "output_text", text: JSON.stringify({ opportunities: [] }) }],
          },
        ],
      });
    },
  });
  assert.equal(calls, 1);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.code, "invalid_response");
    assert.equal(result.diagnostic, "OUTPUT_TEXT_MISSING");
  }
});

test("research e2e: two JSON documents in one message → OUTPUT_JSON_INVALID", async () => {
  resetAiSeoResearchRateLimitForTests();
  const inventory = sampleInventory();
  const result = await requestOpenAiUkOpportunityResearch(inventory, {
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
                text: `${JSON.stringify(goodOpportunityPayload())}\n${JSON.stringify({ opportunities: [] })}`,
              },
            ],
          },
        ],
      }),
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.diagnostic, "OUTPUT_JSON_INVALID");
});

test("research e2e: HTTP invalid JSON body → RESPONSE_JSON_INVALID (no retry)", async () => {
  resetAiSeoResearchRateLimitForTests();
  const inventory = sampleInventory();
  let calls = 0;
  const result = await requestOpenAiUkOpportunityResearch(inventory, {
    config: testConfig(),
    fetchImpl: async () => {
      calls += 1;
      return new Response("{not-json", {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    },
  });
  assert.equal(calls, 1);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.diagnostic, "RESPONSE_JSON_INVALID");
});

test("research e2e: top-level output_text alone succeeds (no output[] concat)", async () => {
  // Research full mocked path — top-level output_text priority + semantic validation.
  resetAiSeoResearchRateLimitForTests();
  const inventory = sampleInventory();
  const result = await requestOpenAiUkOpportunityResearch(inventory, {
    config: testConfig(),
    fetchImpl: async () =>
      mockJsonResponse({
        status: "completed",
        output_text: JSON.stringify(goodOpportunityPayload()),
        output: [
          {
            type: "message",
            content: [{ type: "output_text", text: JSON.stringify({ opportunities: [] }) }],
          },
        ],
      }),
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.research.opportunities.length, 2);
});

test("research e2e: prose-wrapped or markdown-fenced JSON → OUTPUT_JSON_INVALID (no salvage)", async () => {
  resetAiSeoResearchRateLimitForTests();
  const inventory = sampleInventory();
  const raw = JSON.stringify(goodOpportunityPayload());

  const prose = await requestOpenAiUkOpportunityResearch(inventory, {
    config: testConfig(),
    fetchImpl: async () =>
      mockJsonResponse({
        status: "completed",
        output: [
          {
            type: "message",
            content: [{ type: "output_text", text: `Here is the result:\n${raw}` }],
          },
        ],
      }),
  });
  assert.equal(prose.ok, false);
  if (!prose.ok) assert.equal(prose.diagnostic, "OUTPUT_JSON_INVALID");

  const fenced = await requestOpenAiUkOpportunityResearch(inventory, {
    config: testConfig(),
    fetchImpl: async () =>
      mockJsonResponse({
        status: "completed",
        output: [
          {
            type: "message",
            content: [{ type: "output_text", text: "```json\n" + raw + "\n```" }],
          },
        ],
      }),
  });
  assert.equal(fenced.ok, false);
  if (!fenced.ok) assert.equal(fenced.diagnostic, "OUTPUT_JSON_INVALID");
});

test("research e2e: truncated JSON → OUTPUT_JSON_INVALID (no retry)", async () => {
  resetAiSeoResearchRateLimitForTests();
  const inventory = sampleInventory();
  const raw = JSON.stringify(goodOpportunityPayload());
  let calls = 0;
  const result = await requestOpenAiUkOpportunityResearch(inventory, {
    config: testConfig(),
    fetchImpl: async () => {
      calls += 1;
      return mockJsonResponse({
        status: "completed",
        output: [
          {
            type: "message",
            content: [{ type: "output_text", text: raw.slice(0, 40) }],
          },
        ],
      });
    },
  });
  assert.equal(calls, 1);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.diagnostic, "OUTPUT_JSON_INVALID");
});

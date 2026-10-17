/**
 * Phase A1 Preview-Only RC — OpenAI NEW_BLOG article generation → private preview ONLY.
 * No live provider calls. Injected fake HTTP / mock transport only.
 *
 * This RC intentionally OMITS Blog Apply: there is no article-apply.ts, no
 * applyGeneratedArticleTo* function, no Apply server action, and no catalog Apply
 * method. These tests assert the generation/preview surface AND assert the Apply
 * surface stays absent (SOURCE GUARDS below).
 */

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import {
  ARTICLE_GENERATION_INPUT_MAX_CHARS,
  GENERATED_ARTICLE_HTML_MAX_CHARS,
  OPENAI_BLOG_ARTICLE_MAX_OUTPUT_TOKENS,
  OPENAI_BLOG_ARTICLE_TIMEOUT_MS,
  OPENAI_RESPONSES_ENDPOINT,
  SEO_AI_ARTICLE_GENERATION_ENV,
  getOpenAiBlogArticleConfig,
  getOpenAiBlogPromptConfig,
  getOpenAiSeoConfig,
  getOpenAiSeoResearchConfig,
  isOpenAiBlogArticleConfigured,
  isSeoAiArticleGenerationEnabled,
  type OpenAiBlogArticleConfig,
} from "../lib/cms/ai-seo/config";
import {
  BLOG_ARTICLE_MOCK_ISOLATION_MESSAGES,
  getBrowserAcceptanceMockState,
  resetBrowserAcceptanceMockState,
  SEO_AI_ARTICLE_BROWSER_ACCEPTANCE_MOCK_ENV,
} from "../lib/cms/ai-seo/blog-article-browser-acceptance-mock";
import {
  BLOG_ARTICLE_OPENAI_JSON_SCHEMA,
  BLOG_ARTICLE_OPENAI_SCHEMA_NAME,
  BLOG_ARTICLE_OPENAI_SYSTEM_INSTRUCTION,
  buildOpenAiBlogArticleRequestBody,
  inspectBlogArticleResponsesPayload,
  normalizeGeneratedArticle,
  requestOpenAiBlogArticle,
} from "../lib/cms/ai-seo/blog-article-openai";
import {
  AI_SEO_BLOG_ARTICLE_RATE_LIMITS,
  checkAiSeoBlogArticleRateLimit,
  resetAiSeoBlogArticleRateLimitForTests,
} from "../lib/cms/ai-seo/rate-limit";
import { CURRENT_CMS_SCHEMA_VERSION } from "../lib/db/schema";
import {
  SEO_AI_ARTICLE_GENERATION_SPEC,
  buildArticleGenerationInput,
  evaluateNewBlogArticleEligibility,
  generateNewBlogArticlePreview,
  type ArticleGenerationCatalog,
} from "../lib/cms/seo-planning/article-generation";
import { buildWritingBrief } from "../lib/cms/seo-planning/writing-brief";
import {
  readSeoPlanningEditorialEvidence,
  SEO_PLANNING_EDITORIAL_TRUST,
} from "../lib/cms/seo-planning/editorial-evidence";
import type { BlogCategory, BlogPost, SeoPlanningDraft } from "../lib/cms/types";

const root = process.cwd();
const SAMPLE_KEY = "sk-test-blog-article-openai-not-real";
const REAL_LOOKING_KEY = "sk-proj-fake-real-shape-not-a-live-secret";

function read(rel: string) {
  return readFileSync(path.join(root, rel), "utf8");
}

function fileExists(rel: string) {
  return existsSync(path.join(root, rel));
}

function withEnv(vars: Record<string, string | undefined>, fn: () => void) {
  const previous = new Map<string, string | undefined>();
  for (const key of Object.keys(vars)) {
    previous.set(key, process.env[key]);
    const next = vars[key];
    if (next === undefined) delete process.env[key];
    else process.env[key] = next;
  }
  try {
    fn();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

async function withEnvAsync(vars: Record<string, string | undefined>, fn: () => Promise<void>) {
  const previous = new Map<string, string | undefined>();
  for (const key of Object.keys(vars)) {
    previous.set(key, process.env[key]);
    const next = vars[key];
    if (next === undefined) delete process.env[key];
    else process.env[key] = next;
  }
  try {
    await fn();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

function draft(overrides: Partial<SeoPlanningDraft> = {}): SeoPlanningDraft {
  return {
    id: "seoplan_a1",
    recommendation: "NEW_BLOG",
    workflowStatus: "CONTENT_NEEDED",
    fingerprint: "NEW_BLOG:a1-demo",
    topic: "UK IPTV buffering checklist",
    workingTitle: "Fix UK IPTV buffering without guesswork",
    proposedSlug: "uk-iptv-buffering-checklist",
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
        topic: "Frozen topic",
        whyNow: "Readers report evening buffering.",
        webEvidence: "A support page describes a local network check.",
        existingCoverage: "PARTIAL",
        confidence: "HIGH",
        matchedTitle: "Existing guide",
        gscEvidence: [],
      },
      workspace: {
        contentAngle: "Practical home-network checks for UK readers",
        nextStep: "Draft a clear troubleshooting article",
        humanNotes: "Keep claims modest; no speed guarantees.",
      },
      sources: [{ title: "Ofcom", domain: "ofcom.org.uk", url: "https://www.ofcom.org.uk/" }],
      gsc: { included: true },
      editorialEvidenceV1: {
        version: "v1",
        originalContribution: "Explain a short UK evening congestion checklist.",
        readerBenefit: "Readers can isolate home Wi-Fi issues faster.",
        missingEvidenceNotes: "Need first-party site fact verification later.",
        entries: [
          {
            id: "ed_1",
            evidenceType: "EXTERNAL_REFERENCE",
            claim: "Regulator publishes broadband advice",
            url: "https://www.ofcom.org.uk/",
            location: "home",
            notes: "Unverified editorial note",
            trust: "EDITORIAL_UNVERIFIED",
          },
        ],
      },
    },
    ...overrides,
  };
}

function articleConfig(overrides: Partial<OpenAiBlogArticleConfig> = {}): OpenAiBlogArticleConfig {
  return {
    configured: true,
    apiKey: SAMPLE_KEY,
    model: "gpt-blog-article-test",
    endpoint: OPENAI_RESPONSES_ENDPOINT,
    timeoutMs: OPENAI_BLOG_ARTICLE_TIMEOUT_MS,
    maxOutputTokens: OPENAI_BLOG_ARTICLE_MAX_OUTPUT_TOKENS,
    ...overrides,
  };
}

function sampleArticle() {
  return {
    title: "Fix UK IPTV buffering without guesswork",
    excerpt: "A practical UK checklist to isolate home-network buffering causes.",
    html: "<h2>Start with the local network</h2><p>Check whether other devices on the same Wi-Fi also struggle during peak evening hours before changing service settings.</p><h3>Useful next checks</h3><ul><li>Restart the router after noting current symptoms.</li><li>Try a wired connection if available.</li></ul>",
  };
}

function openaiSuccessPayload(json: unknown) {
  return {
    output: [
      {
        type: "message",
        content: [{ type: "output_text", text: JSON.stringify(json) }],
      },
    ],
  };
}

function mockJsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function emptyPost(overrides: Partial<BlogPost> = {}): BlogPost {
  return {
    id: "post_a1",
    title: "Fix UK IPTV buffering without guesswork",
    slug: "uk-iptv-buffering-checklist",
    excerpt: "",
    content: "<p></p>",
    categoryId: null,
    featuredImage: null,
    status: "draft",
    featured: false,
    publishedAt: null,
    createdAt: "2026-10-06T00:00:00.000Z",
    updatedAt: "2026-10-06T00:00:00.000Z",
    seoTitle: "",
    seoDescription: "",
    focusKeyword: "",
    canonicalUrl: "",
    robotsIndex: true,
    robotsFollow: true,
    ogTitle: "",
    ogDescription: "",
    ogImage: null,
    sitemapInclude: true,
    ...overrides,
  };
}

/**
 * Minimal read-only catalog matching `ArticleGenerationCatalog` exactly.
 * Preview-only RC: no apply/save/handoff method exists on this type, and none
 * is implemented here — there is nothing for Generate to persist into Blog.
 */
function memoryCatalog(initial: SeoPlanningDraft, initialPosts: BlogPost[] = []) {
  let store = structuredClone(initial);
  const posts = new Map(initialPosts.map((post) => [post.id, structuredClone(post)]));

  const catalog: ArticleGenerationCatalog & {
    posts: Map<string, BlogPost>;
    mutateDraft(next: Partial<SeoPlanningDraft>): void;
    setPost(post: BlogPost): void;
  } = {
    posts,
    async getSeoPlanningDraftById(id: string) {
      return store.id === id ? structuredClone(store) : null;
    },
    async getPostById(id: string) {
      const post = posts.get(id);
      return post ? structuredClone(post) : null;
    },
    async listCategories(): Promise<BlogCategory[]> {
      return [];
    },
    mutateDraft(next: Partial<SeoPlanningDraft>) {
      store = { ...store, ...next };
    },
    setPost(post: BlogPost) {
      posts.set(post.id, structuredClone(post));
    },
  };
  return catalog;
}

test("SCHEMA: CMS schema remains v5", () => {
  assert.equal(CURRENT_CMS_SCHEMA_VERSION, 6);
});

test("CONFIG: OpenAI Blog Article requires key + OPENAI_BLOG_ARTICLE_MODEL; no SEO/prompt fallback", () => {
  withEnv(
    {
      OPENAI_API_KEY: "",
      OPENAI_BLOG_ARTICLE_MODEL: "",
      OPENAI_SEO_MODEL: "gpt-seo-should-not-apply",
      OPENAI_BLOG_PROMPT_MODEL: "gpt-prompt-should-not-apply",
      OPENAI_SEO_RESEARCH_MODEL: "gpt-research-should-not-apply",
    },
    () => {
      assert.equal(isOpenAiBlogArticleConfigured(), false);
      assert.equal(getOpenAiBlogArticleConfig().configured, false);
      assert.equal(getOpenAiBlogArticleConfig().model, "");
    },
  );

  withEnv(
    {
      OPENAI_API_KEY: SAMPLE_KEY,
      OPENAI_BLOG_ARTICLE_MODEL: "gpt-blog-article-model",
      OPENAI_SEO_MODEL: "gpt-seo-other",
      OPENAI_BLOG_PROMPT_MODEL: "gpt-prompt-other",
    },
    () => {
      assert.equal(isOpenAiBlogArticleConfigured(), true);
      const cfg = getOpenAiBlogArticleConfig();
      assert.equal(cfg.model, "gpt-blog-article-model");
      assert.notEqual(cfg.model, getOpenAiSeoConfig().model);
      assert.notEqual(cfg.model, getOpenAiBlogPromptConfig().model);
      assert.notEqual(cfg.model, getOpenAiSeoResearchConfig().model);
      assert.equal(cfg.timeoutMs, OPENAI_BLOG_ARTICLE_TIMEOUT_MS);
      assert.equal(cfg.maxOutputTokens, OPENAI_BLOG_ARTICLE_MAX_OUTPUT_TOKENS);
    },
  );

  withEnv({ [SEO_AI_ARTICLE_GENERATION_ENV]: undefined }, () => {
    assert.equal(isSeoAiArticleGenerationEnabled(), false);
  });
  withEnv({ [SEO_AI_ARTICLE_GENERATION_ENV]: "1" }, () => {
    assert.equal(isSeoAiArticleGenerationEnabled(), true);
  });
});

test("PROVIDER: article instruction writes articles; prompt instruction remains separate", () => {
  assert.match(BLOG_ARTICLE_OPENAI_SYSTEM_INSTRUCTION, /write a useful/i);
  assert.doesNotMatch(BLOG_ARTICLE_OPENAI_SYSTEM_INSTRUCTION, /DO NOT write the blog article/i);
  assert.equal(BLOG_ARTICLE_OPENAI_SCHEMA_NAME, "sidhu_planning_blog_article");
  assert.deepEqual(BLOG_ARTICLE_OPENAI_JSON_SCHEMA.required, ["title", "excerpt", "html"]);

  const brief = buildWritingBrief(draft());
  const input = buildArticleGenerationInput(brief);
  assert.ok(input.length > 0);
  assert.ok(input.length <= ARTICLE_GENERATION_INPUT_MAX_CHARS);
  assert.match(input, /Write a complete NEW_BLOG article/i);
  assert.doesNotMatch(input, /DO NOT write the article yourself/i);
  assert.match(input, /EDITORIAL_UNVERIFIED|untrusted/i);
});

test("PROVIDER: injected OpenAI mock parses structured article JSON once", async () => {
  resetAiSeoBlogArticleRateLimitForTests();
  let calls = 0;
  const article = sampleArticle();
  const result = await requestOpenAiBlogArticle("canonical-input", {
    config: articleConfig(),
    fetchImpl: async (url, init) => {
      calls += 1;
      assert.equal(String(url), OPENAI_RESPONSES_ENDPOINT);
      const body = JSON.parse(String(init?.body || "{}"));
      assert.equal(body.model, "gpt-blog-article-test");
      assert.equal(body.max_output_tokens, OPENAI_BLOG_ARTICLE_MAX_OUTPUT_TOKENS);
      assert.equal(body.text.format.name, BLOG_ARTICLE_OPENAI_SCHEMA_NAME);
      assert.equal(body.text.format.schema.additionalProperties, false);
      return mockJsonResponse(openaiSuccessPayload(article));
    },
  });
  assert.equal(calls, 1);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.article.title, article.title);
  assert.match(result.article.html, /<h2>/);
  assert.equal(result.model, "gpt-blog-article-test");
});

test("VALIDATION: reject empty, oversized, unsafe, and malformed article responses", () => {
  assert.equal(normalizeGeneratedArticle(null), null);
  assert.equal(normalizeGeneratedArticle({ title: "t", excerpt: "e" }), null);
  assert.equal(
    normalizeGeneratedArticle({ title: "t", excerpt: "e", html: "<p>Hi</p>", extra: true }),
    null,
  );
  assert.equal(
    normalizeGeneratedArticle({ title: "", excerpt: "e", html: sampleArticle().html }),
    null,
  );
  assert.equal(
    normalizeGeneratedArticle({
      title: "Title",
      excerpt: "Excerpt",
      html: `<p>${"x".repeat(GENERATED_ARTICLE_HTML_MAX_CHARS + 1)}</p>`,
    }),
    null,
  );
  assert.equal(
    normalizeGeneratedArticle({
      title: "Title",
      excerpt: "Excerpt long enough",
      html: '<p>Safe</p><script>alert(1)</script><p>More text for length threshold here.</p>',
    }),
    null,
  );
  assert.equal(
    normalizeGeneratedArticle({
      title: "Title",
      excerpt: "Excerpt long enough",
      html: '<p onclick="x()">Clickable copy that is otherwise long enough for validation.</p>',
    }),
    null,
  );
  assert.equal(
    normalizeGeneratedArticle({
      title: "Title",
      excerpt: "Excerpt long enough",
      html: '<p><a href="javascript:alert(1)">bad</a> more text to pass length checks here.</p>',
    }),
    null,
  );

  const ok = normalizeGeneratedArticle(sampleArticle());
  assert.ok(ok);
  assert.doesNotMatch(ok!.html, /script|onclick|javascript:/i);
});

test("ELIGIBILITY: NEW_BLOG Content Needed with writing brief; reject archive/missing/unsupported", () => {
  const ok = evaluateNewBlogArticleEligibility(draft());
  assert.equal(ok.ok, true);

  assert.equal(evaluateNewBlogArticleEligibility(null).ok, false);
  const archived = evaluateNewBlogArticleEligibility(draft({ archivedAt: "2026-10-06T00:00:00.000Z" }));
  assert.equal(archived.ok, false);
  if (archived.ok) return;
  assert.equal(archived.code, "planning_archived");

  const refresh = evaluateNewBlogArticleEligibility(draft({ recommendation: "REFRESH_EXISTING" }));
  assert.equal(refresh.ok, false);
  if (refresh.ok) return;
  assert.equal(refresh.code, "refresh_target_blocked");

  const restore = evaluateNewBlogArticleEligibility(draft({ recommendation: "RESTORE_HISTORICAL" }));
  assert.equal(restore.ok, false);
  if (restore.ok) return;
  assert.equal(restore.code, "unsupported_recommendation");

  const internal = evaluateNewBlogArticleEligibility(draft({ recommendation: "INTERNAL_LINK_ONLY" }));
  assert.equal(internal.ok, false);
  if (internal.ok) return;
  assert.equal(internal.code, "unsupported_recommendation");

  const hold = evaluateNewBlogArticleEligibility(
    draft({ recommendation: "HOLD" as SeoPlanningDraft["recommendation"] }),
  );
  assert.equal(hold.ok, false);
  if (hold.ok) return;
  assert.equal(hold.code, "unsupported_recommendation");

  const planning = evaluateNewBlogArticleEligibility(draft({ workflowStatus: "PLANNING" }));
  assert.equal(planning.ok, false);
  if (planning.ok) return;
  assert.equal(planning.code, "ineligible");
});

test("EVIDENCE: editorial-evidence module is importable and feeds the untrusted trust marker", () => {
  const evidence = readSeoPlanningEditorialEvidence(draft().payload);
  assert.equal(evidence.entries.length, 1);
  assert.equal(evidence.entries[0].trust, SEO_PLANNING_EDITORIAL_TRUST);
  assert.equal(SEO_PLANNING_EDITORIAL_TRUST, "EDITORIAL_UNVERIFIED");
});

test("GENERATE: eligible draft + mock provider returns private preview; no Blog save", async () => {
  resetAiSeoBlogArticleRateLimitForTests();
  const catalog = memoryCatalog(draft({ linkedPostId: "post_a1" }), [emptyPost()]);
  let providerCalls = 0;
  const result = await generateNewBlogArticlePreview({
    planningDraftId: "seoplan_a1",
    adminId: "admin_1",
    ip: "127.0.0.1",
    catalog,
    config: articleConfig(),
    fetchImpl: async () => {
      providerCalls += 1;
      return mockJsonResponse(openaiSuccessPayload(sampleArticle()));
    },
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.blogSaved, false);
  assert.equal(result.providerRequests, 1);
  assert.equal(providerCalls, 1);
  assert.equal(result.preview.privatePreview, true);
  assert.equal(result.preview.publicationReady, false);
  assert.equal(result.preview.requiresHumanFactualReview, true);
  assert.equal(result.preview.evidenceTrust.publicationReady, false);
  assert.equal(result.preview.evidenceTrust.evidencePackComplete, false);
  assert.equal(result.preview.evidenceTrust.aiProse, "ai_generated_untrusted");
  assert.equal(result.preview.evidenceTrust.editorialEvidence, "editorial_unverified");
  assert.equal(result.preview.evidenceTrust.firstPartySiteFacts, "none_attested");
  assert.equal(result.preview.spec, SEO_AI_ARTICLE_GENERATION_SPEC);
  assert.match(result.preview.article.html, /<h2>/);
  // Preview-only RC: the linked Blog post must remain exactly as it started.
  const linkedPost = await catalog.getPostById("post_a1");
  assert.equal(linkedPost?.content, "<p></p>");
  assert.equal(linkedPost?.status, "draft");
});

test("GENERATE: missing config, timeout, and invalid responses stay sanitized; no retry/fallback", async () => {
  resetAiSeoBlogArticleRateLimitForTests();
  const catalog = memoryCatalog(draft());

  const missing = await generateNewBlogArticlePreview({
    planningDraftId: "seoplan_a1",
    adminId: "admin_1",
    ip: "127.0.0.1",
    catalog,
    config: articleConfig({ configured: false, apiKey: "", model: "" }),
  });
  assert.equal(missing.ok, false);
  if (missing.ok) return;
  assert.equal(missing.code, "not_configured");
  assert.equal(missing.providerRequests, 0);

  let calls = 0;
  const timedOut = await requestOpenAiBlogArticle("input", {
    config: articleConfig({ timeoutMs: 20 }),
    fetchImpl: async (_url, init) => {
      calls += 1;
      await new Promise<void>((_, reject) => {
        const signal = init?.signal;
        if (!signal) {
          reject(new Error("missing signal"));
          return;
        }
        signal.addEventListener("abort", () => {
          const err = new Error("aborted");
          err.name = "AbortError";
          reject(err);
        });
      });
      return mockJsonResponse({});
    },
  });
  assert.equal(calls, 1);
  assert.equal(timedOut.ok, false);
  if (timedOut.ok) return;
  assert.equal(timedOut.code, "timeout");
  assert.doesNotMatch(timedOut.message, /sk-|api\.openai|secret/i);

  const bad = await requestOpenAiBlogArticle("input", {
    config: articleConfig(),
    fetchImpl: async () => mockJsonResponse(openaiSuccessPayload({ title: "Only title" })),
  });
  assert.equal(bad.ok, false);
  if (bad.ok) return;
  assert.equal(bad.code, "invalid_response");
});

test("A1.3-S S1: mock ON + synthetic key → mocked response; zero external requests", async () => {
  resetBrowserAcceptanceMockState();
  await withEnvAsync(
    {
      NODE_ENV: "development",
      [SEO_AI_ARTICLE_BROWSER_ACCEPTANCE_MOCK_ENV]: "1",
      SEO_AI_ARTICLE_BROWSER_ACCEPTANCE_FIXTURE: "safe",
      OPENAI_API_KEY: SAMPLE_KEY,
      OPENAI_BLOG_ARTICLE_MODEL: "gpt-blog-article-test",
    },
    async () => {
      let external = 0;
      const blocked: typeof fetch = async () => {
        external += 1;
        throw new Error("external AI must not be reached");
      };
      const previousFetch = globalThis.fetch;
      globalThis.fetch = blocked;
      try {
        const result = await requestOpenAiBlogArticle("canonical-input", {
          config: articleConfig({ apiKey: SAMPLE_KEY }),
        });
        assert.equal(result.ok, true);
        if (!result.ok) return;
        assert.equal(external, 0);
        assert.equal(getBrowserAcceptanceMockState().requestCount, 1);
        assert.equal(getBrowserAcceptanceMockState().externalBlockedCount, 0);
        assert.match(result.article.title, /buffering/i);
      } finally {
        globalThis.fetch = previousFetch;
      }
    },
  );
});

test("A1.3-S S1: mock ON + real-looking key → reject; zero external requests", async () => {
  let calls = 0;
  const result = await requestOpenAiBlogArticle("canonical-input", {
    config: articleConfig({ apiKey: REAL_LOOKING_KEY }),
    env: {
      NODE_ENV: "development",
      [SEO_AI_ARTICLE_BROWSER_ACCEPTANCE_MOCK_ENV]: "1",
      OPENAI_API_KEY: REAL_LOOKING_KEY,
    },
    fetchImpl: async () => {
      calls += 1;
      return mockJsonResponse({});
    },
  });
  assert.equal(calls, 0);
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.code, "not_configured");
  assert.equal(result.message, BLOG_ARTICLE_MOCK_ISOLATION_MESSAGES.mockRequiresSynthetic);
  assert.doesNotMatch(result.message, /sk-|Bearer|api\.openai|secret/i);
});

test("A1.3-S S1: mock OFF + synthetic key without inject → reject; zero external requests", async () => {
  let calls = 0;
  const previousFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    calls += 1;
    throw new Error("live fetch must not run");
  }) as typeof fetch;
  try {
    const result = await requestOpenAiBlogArticle("canonical-input", {
      config: articleConfig({ apiKey: SAMPLE_KEY }),
      env: { NODE_ENV: "development", OPENAI_API_KEY: SAMPLE_KEY },
    });
    assert.equal(calls, 0);
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.code, "not_configured");
    assert.equal(result.message, BLOG_ARTICLE_MOCK_ISOLATION_MESSAGES.syntheticWithoutMock);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("A1.3-S S1: mock ON + production → reject; zero external requests", async () => {
  let calls = 0;
  const result = await requestOpenAiBlogArticle("canonical-input", {
    config: articleConfig({ apiKey: SAMPLE_KEY }),
    env: {
      NODE_ENV: "production",
      [SEO_AI_ARTICLE_BROWSER_ACCEPTANCE_MOCK_ENV]: "1",
      OPENAI_API_KEY: SAMPLE_KEY,
    },
    fetchImpl: async () => {
      calls += 1;
      return mockJsonResponse({});
    },
  });
  assert.equal(calls, 0);
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.code, "not_configured");
  assert.equal(result.message, BLOG_ARTICLE_MOCK_ISOLATION_MESSAGES.productionMock);
});

test("A1.3-S S1: mock OFF + real-looking key + injected transport → normal request shape; no live network", async () => {
  let calls = 0;
  const article = sampleArticle();
  const result = await requestOpenAiBlogArticle("canonical-input", {
    config: articleConfig({ apiKey: REAL_LOOKING_KEY, model: "gpt-blog-article-test" }),
    env: { NODE_ENV: "development", OPENAI_API_KEY: REAL_LOOKING_KEY },
    fetchImpl: async (url, init) => {
      calls += 1;
      assert.equal(String(url), OPENAI_RESPONSES_ENDPOINT);
      assert.equal(init?.method, "POST");
      const auth = String((init?.headers as Record<string, string>)?.Authorization || "");
      assert.match(auth, /^Bearer sk-proj-fake-real-shape/);
      assert.doesNotMatch(auth, /sk-test-/);
      const body = JSON.parse(String(init?.body || "{}"));
      assert.equal(body.model, "gpt-blog-article-test");
      assert.equal(body.text.format.name, BLOG_ARTICLE_OPENAI_SCHEMA_NAME);
      return mockJsonResponse(openaiSuccessPayload(article));
    },
  });
  assert.equal(calls, 1);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.article.title, article.title);
});

test("A1.3-S S1: missing key/model fail closed; feature flag OFF refuses generation action path", async () => {
  resetAiSeoBlogArticleRateLimitForTests();
  const missing = await requestOpenAiBlogArticle("input", {
    config: articleConfig({ configured: false, apiKey: "", model: "" }),
    fetchImpl: async () => {
      throw new Error("should not call");
    },
  });
  assert.equal(missing.ok, false);
  if (missing.ok) return;
  assert.equal(missing.code, "not_configured");

  withEnv({ [SEO_AI_ARTICLE_GENERATION_ENV]: undefined }, () => {
    assert.equal(isSeoAiArticleGenerationEnabled(), false);
  });

  const actions = read("lib/cms/seo-planning-actions.ts");
  assert.match(actions, /feature_disabled/);
  assert.match(actions, /isSeoAiArticleGenerationEnabled/);
  assert.doesNotMatch(read("app/sidhu/(protected)/seo/planning/[id]/page.tsx"), /generateNewBlogArticlePreview\(/);
});

test("A1.3-S S2: completed valid structured output → PASS", async () => {
  const article = sampleArticle();
  const result = await requestOpenAiBlogArticle("input", {
    config: articleConfig(),
    fetchImpl: async () =>
      mockJsonResponse({
        status: "completed",
        ...openaiSuccessPayload(article),
      }),
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.article.title, article.title);
});

test("A1.3-S S2: refusal / incomplete / failed classified safely; no retry; no Blog write", async () => {
  resetAiSeoBlogArticleRateLimitForTests();
  const catalog = memoryCatalog(draft({ linkedPostId: "post_a1" }), [emptyPost()]);

  const refusalInspect = inspectBlogArticleResponsesPayload({
    status: "completed",
    output: [{ type: "refusal", refusal: "SECRET_REFUSAL_BODY_MUST_NOT_LEAK" }],
  });
  assert.equal(refusalInspect.ok, false);
  if (!refusalInspect.ok) {
    assert.equal(refusalInspect.diagnostic, "RESPONSE_REFUSAL");
    assert.doesNotMatch(JSON.stringify(refusalInspect), /SECRET_REFUSAL/);
  }

  let refusalCalls = 0;
  const refusal = await requestOpenAiBlogArticle("input", {
    config: articleConfig(),
    fetchImpl: async () => {
      refusalCalls += 1;
      return mockJsonResponse({
        status: "completed",
        output: [{ type: "refusal", refusal: "SECRET_REFUSAL_BODY_MUST_NOT_LEAK" }],
      });
    },
  });
  assert.equal(refusalCalls, 1);
  assert.equal(refusal.ok, false);
  if (!refusal.ok) {
    assert.equal(refusal.code, "invalid_response");
    assert.equal(refusal.diagnostic, "RESPONSE_REFUSAL");
    assert.doesNotMatch(refusal.message, /SECRET_REFUSAL|sk-|stack|Bearer/i);
    assert.doesNotMatch(JSON.stringify(refusal), /SECRET_REFUSAL/);
  }

  let maxTokenCalls = 0;
  const maxTokens = await requestOpenAiBlogArticle("input", {
    config: articleConfig(),
    fetchImpl: async () => {
      maxTokenCalls += 1;
      return mockJsonResponse({
        status: "incomplete",
        incomplete_details: { reason: "max_output_tokens" },
        output: [
          {
            type: "message",
            content: [{ type: "output_text", text: JSON.stringify(sampleArticle()) }],
          },
        ],
      });
    },
  });
  assert.equal(maxTokenCalls, 1);
  assert.equal(maxTokens.ok, false);
  if (!maxTokens.ok) {
    assert.equal(maxTokens.diagnostic, "RESPONSE_INCOMPLETE");
    assert.equal(maxTokens.incompleteReasonCode, "MAX_OUTPUT_TOKENS");
    assert.match(maxTokens.message, /output limit/i);
    assert.doesNotMatch(maxTokens.message, /max_output_tokens/);
    assert.doesNotMatch(JSON.stringify(maxTokens), /max_output_tokens/);
  }

  const contentFilter = await requestOpenAiBlogArticle("input", {
    config: articleConfig(),
    fetchImpl: async () =>
      mockJsonResponse({
        status: "incomplete",
        incomplete_details: { reason: "content_filter" },
        output: [],
      }),
  });
  assert.equal(contentFilter.ok, false);
  if (!contentFilter.ok) {
    assert.equal(contentFilter.diagnostic, "RESPONSE_INCOMPLETE");
    assert.equal(contentFilter.incompleteReasonCode, "CONTENT_FILTER");
    assert.match(contentFilter.message, /safety filter/i);
    assert.doesNotMatch(JSON.stringify(contentFilter), /content_filter/);
  }

  const unknownIncomplete = await requestOpenAiBlogArticle("input", {
    config: articleConfig(),
    fetchImpl: async () =>
      mockJsonResponse({
        status: "incomplete",
        incomplete_details: { reason: "something_new_from_provider" },
        output: [],
      }),
  });
  assert.equal(unknownIncomplete.ok, false);
  if (!unknownIncomplete.ok) {
    assert.equal(unknownIncomplete.incompleteReasonCode, "UNKNOWN");
    assert.match(unknownIncomplete.message, /did not finish/i);
    assert.doesNotMatch(JSON.stringify(unknownIncomplete), /something_new_from_provider/);
  }

  const failed = await requestOpenAiBlogArticle("input", {
    config: articleConfig(),
    fetchImpl: async () =>
      mockJsonResponse({
        status: "failed",
        output: [
          {
            type: "message",
            content: [{ type: "output_text", text: JSON.stringify(sampleArticle()) }],
          },
        ],
      }),
  });
  assert.equal(failed.ok, false);
  if (!failed.ok) {
    assert.equal(failed.diagnostic, "RESPONSE_FAILED");
    assert.match(failed.message, /failed/i);
  }

  // Partial valid-looking JSON with incomplete status must be rejected.
  const partial = await generateNewBlogArticlePreview({
    planningDraftId: "seoplan_a1",
    adminId: "admin_1",
    ip: "127.0.0.1",
    catalog,
    config: articleConfig(),
    fetchImpl: async () =>
      mockJsonResponse({
        status: "incomplete",
        incomplete_details: { reason: "max_output_tokens" },
        output: [
          {
            type: "message",
            content: [{ type: "output_text", text: JSON.stringify(sampleArticle()) }],
          },
        ],
      }),
  });
  assert.equal(partial.ok, false);
  if (!partial.ok) {
    assert.equal(partial.code, "invalid_response");
    assert.equal(partial.blogSaved, false);
    assert.equal(partial.providerRequests, 1);
  }
  // Preview-only RC: no Apply method exists, so the linked post can only be
  // unchanged — assert the content literally never moved from its fixture value.
  const unchangedPost = await catalog.getPostById("post_a1");
  assert.equal(unchangedPost?.content, "<p></p>");
});

test("A1.3-S S2: malformed JSON / HTTP 429 / timeout preserve existing behavior; no retries", async () => {
  let malformedCalls = 0;
  const malformed = await requestOpenAiBlogArticle("input", {
    config: articleConfig(),
    fetchImpl: async () => {
      malformedCalls += 1;
      return mockJsonResponse({
        status: "completed",
        output: [{ type: "message", content: [{ type: "output_text", text: "{not-json" }] }],
      });
    },
  });
  assert.equal(malformedCalls, 1);
  assert.equal(malformed.ok, false);
  if (!malformed.ok) assert.equal(malformed.code, "invalid_response");

  let rateCalls = 0;
  const rateLimited = await requestOpenAiBlogArticle("input", {
    config: articleConfig(),
    fetchImpl: async () => {
      rateCalls += 1;
      return mockJsonResponse({ error: { message: "rate" } }, 429);
    },
  });
  assert.equal(rateCalls, 1);
  assert.equal(rateLimited.ok, false);
  if (!rateLimited.ok) assert.equal(rateLimited.code, "rate_limited");

  let timeoutCalls = 0;
  const timedOut = await requestOpenAiBlogArticle("input", {
    config: articleConfig({ timeoutMs: 20 }),
    fetchImpl: async (_url, init) => {
      timeoutCalls += 1;
      await new Promise<void>((_, reject) => {
        const signal = init?.signal;
        if (!signal) {
          reject(new Error("missing signal"));
          return;
        }
        signal.addEventListener("abort", () => {
          const err = new Error("aborted");
          err.name = "AbortError";
          reject(err);
        });
      });
      return mockJsonResponse({});
    },
  });
  assert.equal(timeoutCalls, 1);
  assert.equal(timedOut.ok, false);
  if (!timedOut.ok) assert.equal(timedOut.code, "timeout");
});

test("GENERATE: nonexistent / archived / unauthorized-shaped failures; one request max", async () => {
  resetAiSeoBlogArticleRateLimitForTests();
  const missing = await generateNewBlogArticlePreview({
    planningDraftId: "missing",
    adminId: "admin_1",
    ip: "127.0.0.1",
    catalog: memoryCatalog(draft()),
    callProvider: async () => {
      throw new Error("should not call provider");
    },
  });
  assert.equal(missing.ok, false);
  if (missing.ok) return;
  assert.equal(missing.code, "not_found");
  assert.equal(missing.providerRequests, 0);

  const archived = await generateNewBlogArticlePreview({
    planningDraftId: "seoplan_a1",
    adminId: "admin_1",
    ip: "127.0.0.1",
    catalog: memoryCatalog(draft({ archivedAt: "2026-10-06T00:00:00.000Z" })),
    callProvider: async () => ({ ok: true, article: sampleArticle(), model: "x" }),
  });
  assert.equal(archived.ok, false);
  if (archived.ok) return;
  assert.equal(archived.code, "planning_archived");

  resetAiSeoBlogArticleRateLimitForTests();
  assert.equal(AI_SEO_BLOG_ARTICLE_RATE_LIMITS.burstMax, 1);
  assert.equal(checkAiSeoBlogArticleRateLimit("admin_1", "1.1.1.1").ok, true);
  assert.equal(checkAiSeoBlogArticleRateLimit("admin_1", "1.1.1.1").ok, false);
});

test("GENERATE: stale planning after provider call is rejected; Blog still unsaved", async () => {
  resetAiSeoBlogArticleRateLimitForTests();
  const catalog = memoryCatalog(draft());
  const result = await generateNewBlogArticlePreview({
    planningDraftId: "seoplan_a1",
    adminId: "admin_1",
    ip: "127.0.0.1",
    catalog,
    callProvider: async () => {
      catalog.mutateDraft({
        updatedAt: "2026-10-06T03:00:00.000Z",
        workingTitle: "Changed title mid-flight",
      });
      return { ok: true, article: sampleArticle(), model: "gpt-blog-article-test" };
    },
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.code, "brief_changed");
  assert.equal(result.blogSaved, false);
  assert.equal(result.providerRequests, 1);
});

test("SOURCE GUARDS: generateNewBlogArticlePreviewAction exists; Apply action does not", () => {
  const actions = read("lib/cms/seo-planning-actions.ts");
  assert.match(actions, /export async function generateNewBlogArticlePreviewAction/);
  assert.match(actions, /isSeoAiArticleGenerationEnabled/);
  assert.match(actions, /feature_disabled/);
  assert.doesNotMatch(actions, /applyGeneratedArticleToNewBlogDraftAction/);
  assert.doesNotMatch(actions, /applyGeneratedArticleToPrivateBlogDraft/);
});

test("SOURCE GUARDS: article-apply.ts does not exist in this release candidate", () => {
  assert.equal(fileExists("lib/cms/seo-planning/article-apply.ts"), false);
});

test("SOURCE GUARDS: catalog layers never implement Blog Apply persistence", () => {
  const catalog = read("lib/cms/catalog.ts");
  const mysql = read("lib/cms/mysql-catalog.ts");
  const json = read("lib/cms/json-catalog.ts");
  for (const src of [catalog, mysql, json]) {
    assert.doesNotMatch(src, /applyGeneratedArticleToPrivateBlogDraft/);
  }
});

test("SOURCE GUARDS: UI has no Apply button and no Apply action import", () => {
  const ui = read("components/sidhu/SeoPlanningArticleGeneration.tsx");
  assert.doesNotMatch(ui, /applyGeneratedArticleToNewBlogDraftAction/);
  assert.doesNotMatch(ui, /Apply to Private Blog Draft/i);
  assert.match(ui, /generateNewBlogArticlePreviewAction/);
});

test("SOURCE GUARDS: enabling the feature flag does not surface an Apply code path", () => {
  withEnv({ [SEO_AI_ARTICLE_GENERATION_ENV]: "1" }, () => {
    assert.equal(isSeoAiArticleGenerationEnabled(), true);
    const actions = read("lib/cms/seo-planning-actions.ts");
    assert.doesNotMatch(actions, /applyGeneratedArticleToNewBlogDraftAction/);
    assert.doesNotMatch(actions, /applyGeneratedArticleToPrivateBlogDraft/);
    const ui = read("components/sidhu/SeoPlanningArticleGeneration.tsx");
    assert.doesNotMatch(ui, /applyGeneratedArticleToNewBlogDraftAction/);
  });
  withEnv({ [SEO_AI_ARTICLE_GENERATION_ENV]: undefined }, () => {
    assert.equal(isSeoAiArticleGenerationEnabled(), false);
  });
});

test("SOURCE GUARDS: CMS schema version baseline unchanged from this RC's expectation", () => {
  const schema = read("lib/db/schema.ts");
  assert.match(schema, /CURRENT_CMS_SCHEMA_VERSION = 6/);
  assert.equal(CURRENT_CMS_SCHEMA_VERSION, 6);
});

test("SOURCE GUARDS: no seo-autonomy or seo-planning-lineage paths exist in this RC", () => {
  assert.equal(fileExists("lib/cms/seo-autonomy"), false);
  assert.equal(fileExists("lib/cms/seo-planning/seo-planning-lineage.ts"), false);
  assert.equal(fileExists("lib/cms/seo-planning-lineage.ts"), false);
  for (const src of [
    read("lib/cms/seo-planning-actions.ts"),
    read("lib/cms/seo-planning/article-generation.ts"),
    read("components/sidhu/SeoPlanningArticleGeneration.tsx"),
  ]) {
    assert.doesNotMatch(src, /seo-autonomy|seo-planning-lineage/);
  }
});

test("SOURCE GUARDS: generation module stays isolated from Gemini/web_search/Apply/savePost", () => {
  const articleMod = read("lib/cms/seo-planning/article-generation.ts");
  const providerMod = read("lib/cms/ai-seo/blog-article-openai.ts");
  assert.doesNotMatch(articleMod, /requestGemini|blog-prompt-gemini|web_search|generateContent/);
  assert.doesNotMatch(providerMod, /GEMINI|gemini|web_search/);
  assert.doesNotMatch(articleMod, /publicationReady:\s*true/);
  assert.doesNotMatch(articleMod, /handoffSeoPlanningToBlog/);
  assert.doesNotMatch(articleMod, /\.savePost\(/);
  assert.doesNotMatch(articleMod, /applyGeneratedArticleTo/);
  assert.match(BLOG_ARTICLE_OPENAI_SYSTEM_INSTRUCTION, /human editorial and factual review/i);

  const body = buildOpenAiBlogArticleRequestBody("input", articleConfig());
  assert.equal(body.model, "gpt-blog-article-test");
  assert.equal((body as { tools?: unknown }).tools, undefined);
});

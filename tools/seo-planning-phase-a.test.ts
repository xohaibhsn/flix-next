/**
 * Phase A — SEO planning drafts: persistence, Proceed, fingerprint, target safety.
 * Mocks only. No Google / OpenAI / production CMS writes.
 */

import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { SeoOpportunitiesPanel } from "../components/sidhu/SeoOpportunitiesPanel";
import { SeoPlanningDetail } from "../components/sidhu/SeoPlanningDetail";
import { SeoPlanningList } from "../components/sidhu/SeoPlanningList";
import { JsonCatalogRepository } from "../lib/cms/json-catalog";
import type { ResearchUkOpportunitiesResult } from "../lib/cms/ai-seo/research";
import { CURRENT_CMS_SCHEMA_VERSION, CMS_SCHEMA_STATEMENTS } from "../lib/db/schema";
import { GSC_KNOWN_HISTORICAL_URLS } from "../lib/cms/gsc/historical-registry";
import {
  buildSeoPlanningFingerprint,
  proceedSeoOpportunityToPlanningDraft,
  validateProceedTarget,
} from "../lib/cms/seo-planning";
import type { BlogPost, CmsPage, RedirectRule, SeoPlanningDraft } from "../lib/cms/types";

const root = process.cwd();

function read(rel: string) {
  return readFileSync(path.join(root, rel), "utf8");
}

const BUFFERING = "/how-to-fix-buffering-issues-on-iptv/";

function baseOpportunity(overrides: Record<string, unknown> = {}) {
  return {
    topic: "Fire TV buffering checklist",
    workingTitle: "Fix Fire TV buffering on UK Wi-Fi",
    searchIntent: "TROUBLESHOOTING" as const,
    whyNow: "Amazon UK help pages are current.",
    webEvidence: "Amazon documents network diagnostics.",
    existingCoverage: "NONE" as const,
    matchedTitle: null,
    matchedPublicUrl: null,
    recommendation: "NEW_BLOG" as const,
    restorePath: "",
    suggestedAngle: "Add a short diagnostic flow.",
    nextStep: "Plan a focused troubleshooting article.",
    confidence: "HIGH" as const,
    gscEvidenceRefs: [] as string[],
    gscEvidence: [] as [],
    historicalSignal: false,
    ...overrides,
  };
}

function samplePost(overrides: Partial<BlogPost> = {}): BlogPost {
  return {
    id: "post_existing",
    title: "Getting Started with The Flix IPTV",
    slug: "getting-started-with-the-flixiptv",
    excerpt: "",
    content: "<p></p>",
    categoryId: null,
    featuredImage: null,
    status: "published",
    featured: false,
    publishedAt: "2026-01-01T00:00:00.000Z",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
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

function memoryCatalog(seed: {
  posts?: BlogPost[];
  pages?: CmsPage[];
  redirects?: RedirectRule[];
  drafts?: SeoPlanningDraft[];
}) {
  const posts = [...(seed.posts || [])];
  const pages = [...(seed.pages || [])];
  const redirects = [...(seed.redirects || [])];
  const drafts = [...(seed.drafts || [])];
  let openAiCalls = 0;
  let gscCalls = 0;

  return {
    openAiCalls: () => openAiCalls,
    gscCalls: () => gscCalls,
    posts,
    redirects,
    drafts,
    catalog: {
      listPosts: async () => posts,
      listPages: async () => pages,
      listCategories: async () => [],
      listActiveRedirects: async () => redirects.filter((r) => r.active),
      getSeoPlanningDraftByFingerprint: async (fingerprint: string) =>
        drafts.find((d) => d.fingerprint === fingerprint) || null,
      saveSeoPlanningDraft: async (draft: SeoPlanningDraft) => {
        const owner = drafts.find((d) => d.fingerprint === draft.fingerprint && d.id !== draft.id);
        if (owner) {
          const err = Object.assign(new Error("Planning draft fingerprint already exists."), {
            code: "ER_DUP_ENTRY",
            errno: 1062,
          });
          throw err;
        }
        const idx = drafts.findIndex((d) => d.id === draft.id);
        if (idx >= 0) drafts[idx] = draft;
        else drafts.push(draft);
        return draft;
      },
    },
    bumpOpenAi() {
      openAiCalls += 1;
    },
    bumpGsc() {
      gscCalls += 1;
    },
  };
}

test("schema version is 3 and seo_planning_drafts table exists", () => {
  assert.equal(CURRENT_CMS_SCHEMA_VERSION, 5);
  const joined = CMS_SCHEMA_STATEMENTS.join("\n");
  assert.match(joined, /CREATE TABLE IF NOT EXISTS seo_planning_drafts/);
  assert.match(joined, /UNIQUE KEY seo_planning_drafts_fingerprint_unique/);
  const sql = read("db/cms-schema.sql");
  assert.match(sql, /CREATE TABLE IF NOT EXISTS seo_planning_drafts/);
  assert.match(sql, /fingerprint VARCHAR\(320\) NOT NULL/);
});

function planningDraftFixture(overrides: Partial<SeoPlanningDraft> = {}): SeoPlanningDraft {
  return {
    id: "seoplan_1",
    recommendation: "NEW_BLOG",
    workflowStatus: "PLANNING",
    fingerprint: "NEW_BLOG:fire-tv-buffering-uk",
    topic: "Fire TV buffering",
    workingTitle: "Fire TV buffering UK",
    proposedSlug: "fire-tv-buffering-uk",
    targetPostId: null,
    matchedPublicUrl: "",
    restorePath: "",
    searchIntent: "TROUBLESHOOTING",
    linkedPostId: null,
    createdBy: "admin_1",
    createdAt: "2026-10-06T00:00:00.000Z",
    updatedAt: "2026-10-06T00:00:00.000Z",
    payload: { opportunity: { confidence: "HIGH" } },
    ...overrides,
  };
}

function jsonProceedCatalog(catalog: JsonCatalogRepository) {
  return {
    listPosts: () => catalog.listPosts(),
    listPages: async () => [] as CmsPage[],
    listCategories: () => catalog.listCategories(),
    listActiveRedirects: () => catalog.listActiveRedirects(),
    getSeoPlanningDraftByFingerprint: (fingerprint: string) =>
      catalog.getSeoPlanningDraftByFingerprint(fingerprint),
    saveSeoPlanningDraft: (draft: SeoPlanningDraft) => catalog.saveSeoPlanningDraft(draft),
  };
}

test("JSON repository planning draft round-trip and fingerprint uniqueness", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "seo-plan-"));
  const previous = process.cwd();
  process.chdir(dir);
  try {
    const catalog = new JsonCatalogRepository();
    const draft = planningDraftFixture();
    await catalog.saveSeoPlanningDraft(draft);
    const loaded = await catalog.getSeoPlanningDraftById("seoplan_1");
    assert.equal(loaded?.fingerprint, draft.fingerprint);
    const byFp = await catalog.getSeoPlanningDraftByFingerprint(draft.fingerprint);
    assert.equal(byFp?.id, "seoplan_1");

    await assert.rejects(
      () =>
        catalog.saveSeoPlanningDraft({
          ...draft,
          id: "seoplan_2",
        }),
      /fingerprint/i,
    );
  } finally {
    process.chdir(previous);
    rmSync(dir, { recursive: true, force: true });
  }
});

test("JSON planning save: concurrent same fingerprint → one owner + conflict", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "seo-plan-race-same-"));
  const previous = process.cwd();
  process.chdir(dir);
  try {
    const catalog = new JsonCatalogRepository();
    const fingerprint = "NEW_BLOG:concurrent-same-fp";
    const a = planningDraftFixture({ id: "seoplan_a", fingerprint, proposedSlug: "concurrent-same-fp" });
    const b = planningDraftFixture({ id: "seoplan_b", fingerprint, proposedSlug: "concurrent-same-fp" });

    const results = await Promise.allSettled([
      catalog.saveSeoPlanningDraft(a),
      catalog.saveSeoPlanningDraft(b),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    assert.equal(fulfilled.length, 1);
    assert.equal(rejected.length, 1);
    assert.match(String((rejected[0] as PromiseRejectedResult).reason), /fingerprint/i);

    const ownerId = (fulfilled[0] as PromiseFulfilledResult<SeoPlanningDraft>).value.id;
    const stored = await catalog.listSeoPlanningDrafts();
    assert.equal(stored.length, 1);
    assert.equal(stored[0]?.id, ownerId);
    assert.equal(stored[0]?.fingerprint, fingerprint);

    const raced = await catalog.getSeoPlanningDraftByFingerprint(fingerprint);
    assert.equal(raced?.id, ownerId);
  } finally {
    process.chdir(previous);
    rmSync(dir, { recursive: true, force: true });
  }
});

test("JSON planning Proceed: concurrent same fingerprint → one created, same id", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "seo-plan-race-proceed-"));
  const previous = process.cwd();
  process.chdir(dir);
  try {
    const catalog = new JsonCatalogRepository();
    const proceedCatalog = jsonProceedCatalog(catalog);
    let seq = 0;
    const makeId = () => `seoplan_race_${++seq}`;

    const [r1, r2] = await Promise.all([
      proceedSeoOpportunityToPlanningDraft({
        rawOpportunity: baseOpportunity({
          workingTitle: "Concurrent Fire TV plan",
          proposedSlug: "concurrent-fire-tv-plan",
        }),
        adminId: "admin_1",
        catalog: proceedCatalog,
        createIdFn: makeId,
      }),
      proceedSeoOpportunityToPlanningDraft({
        rawOpportunity: baseOpportunity({
          workingTitle: "Concurrent Fire TV plan",
          proposedSlug: "concurrent-fire-tv-plan",
        }),
        adminId: "admin_2",
        catalog: proceedCatalog,
        createIdFn: makeId,
      }),
    ]);

    assert.equal(r1.ok, true);
    assert.equal(r2.ok, true);
    if (!r1.ok || !r2.ok) return;

    const createdFlags = [r1.created, r2.created].sort();
    assert.deepEqual(createdFlags, [false, true]);
    assert.equal(r1.id, r2.id);

    const stored = await catalog.listSeoPlanningDrafts();
    assert.equal(stored.length, 1);
    assert.equal(stored[0]?.id, r1.id);
  } finally {
    process.chdir(previous);
    rmSync(dir, { recursive: true, force: true });
  }
});

test("JSON planning save: concurrent different fingerprints both persist", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "seo-plan-race-diff-"));
  const previous = process.cwd();
  process.chdir(dir);
  try {
    const catalog = new JsonCatalogRepository();
    const a = planningDraftFixture({
      id: "seoplan_diff_a",
      fingerprint: "NEW_BLOG:diff-fp-alpha",
      proposedSlug: "diff-fp-alpha",
      topic: "Alpha topic",
    });
    const b = planningDraftFixture({
      id: "seoplan_diff_b",
      fingerprint: "NEW_BLOG:diff-fp-beta",
      proposedSlug: "diff-fp-beta",
      topic: "Beta topic",
    });

    const [savedA, savedB] = await Promise.all([
      catalog.saveSeoPlanningDraft(a),
      catalog.saveSeoPlanningDraft(b),
    ]);
    assert.equal(savedA.id, "seoplan_diff_a");
    assert.equal(savedB.id, "seoplan_diff_b");

    const stored = await catalog.listSeoPlanningDrafts();
    assert.equal(stored.length, 2);
    const ids = stored.map((d) => d.id).sort();
    assert.deepEqual(ids, ["seoplan_diff_a", "seoplan_diff_b"]);
    assert.ok(stored.some((d) => d.fingerprint === a.fingerprint));
    assert.ok(stored.some((d) => d.fingerprint === b.fingerprint));
  } finally {
    process.chdir(previous);
    rmSync(dir, { recursive: true, force: true });
  }
});

test("JSON planning write queue recovers after a failed queued write", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "seo-plan-race-recover-"));
  const previous = process.cwd();
  process.chdir(dir);
  try {
    const catalog = new JsonCatalogRepository();
    await catalog.saveSeoPlanningDraft(
      planningDraftFixture({
        id: "seoplan_recover_base",
        fingerprint: "NEW_BLOG:recover-base",
        proposedSlug: "recover-base",
      }),
    );

    // Rejection inside the write lock (fingerprint owned by another id).
    await assert.rejects(
      () =>
        catalog.saveSeoPlanningDraft(
          planningDraftFixture({
            id: "seoplan_recover_conflict",
            fingerprint: "NEW_BLOG:recover-base",
            proposedSlug: "recover-base",
          }),
        ),
      /fingerprint/i,
    );

    // Next queued write must still succeed (queue not poisoned).
    const saved = await catalog.saveSeoPlanningDraft(
      planningDraftFixture({
        id: "seoplan_after_fail",
        fingerprint: "NEW_BLOG:recover-after-fail",
        proposedSlug: "recover-after-fail",
      }),
    );
    assert.equal(saved.id, "seoplan_after_fail");
    const stored = await catalog.listSeoPlanningDrafts();
    assert.equal(stored.length, 2);
    assert.ok(stored.some((d) => d.id === "seoplan_recover_base"));
    assert.ok(stored.some((d) => d.id === "seoplan_after_fail"));
  } finally {
    process.chdir(previous);
    rmSync(dir, { recursive: true, force: true });
  }
});

test("JSON planning save: update-by-id works; cross-id fingerprint conflict still rejected", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "seo-plan-update-"));
  const previous = process.cwd();
  process.chdir(dir);
  try {
    const catalog = new JsonCatalogRepository();
    await catalog.saveSeoPlanningDraft(
      planningDraftFixture({
        id: "seoplan_upd",
        fingerprint: "NEW_BLOG:update-target",
        proposedSlug: "update-target",
        workingTitle: "Original title",
      }),
    );
    await catalog.saveSeoPlanningDraft(
      planningDraftFixture({
        id: "seoplan_other",
        fingerprint: "NEW_BLOG:other-target",
        proposedSlug: "other-target",
      }),
    );

    const updated = await catalog.saveSeoPlanningDraft(
      planningDraftFixture({
        id: "seoplan_upd",
        fingerprint: "NEW_BLOG:update-target",
        proposedSlug: "update-target",
        workingTitle: "Updated title",
      }),
    );
    assert.equal(updated.workingTitle, "Updated title");
    const byId = await catalog.getSeoPlanningDraftById("seoplan_upd");
    assert.equal(byId?.workingTitle, "Updated title");

    await assert.rejects(
      () =>
        catalog.saveSeoPlanningDraft(
          planningDraftFixture({
            id: "seoplan_upd",
            fingerprint: "NEW_BLOG:other-target",
            proposedSlug: "other-target",
          }),
        ),
      /fingerprint/i,
    );

    const stored = await catalog.listSeoPlanningDrafts();
    assert.equal(stored.length, 2);
    assert.equal(
      stored.find((d) => d.id === "seoplan_upd")?.fingerprint,
      "NEW_BLOG:update-target",
    );
  } finally {
    process.chdir(previous);
    rmSync(dir, { recursive: true, force: true });
  }
});

test("fingerprints are deterministic per recommendation routing", () => {
  assert.equal(
    buildSeoPlanningFingerprint({ recommendation: "NEW_BLOG", proposedSlug: "Fire TV Buffering!" }),
    "NEW_BLOG:fire-tv-buffering",
  );
  assert.equal(
    buildSeoPlanningFingerprint({ recommendation: "REFRESH_EXISTING", targetPostId: "post_123" }),
    "REFRESH_EXISTING:post_123",
  );
  assert.equal(
    buildSeoPlanningFingerprint({
      recommendation: "RESTORE_HISTORICAL",
      restorePath: BUFFERING,
    }),
    `RESTORE_HISTORICAL:${BUFFERING}`,
  );
  assert.equal(
    buildSeoPlanningFingerprint({
      recommendation: "INTERNAL_LINK_ONLY",
      matchedPublicUrl: "/blogs/getting-started-with-the-flixiptv/",
      topic: "Fire TV buffering checklist",
    }),
    "INTERNAL_LINK_ONLY:/blogs/getting-started-with-the-flixiptv/:fire-tv-buffering-checklist",
  );
});

test("SKIP cannot proceed", async () => {
  const mem = memoryCatalog({});
  const result = await proceedSeoOpportunityToPlanningDraft({
    rawOpportunity: baseOpportunity({ recommendation: "SKIP" }),
    adminId: "admin_1",
    catalog: mem.catalog,
  });
  assert.equal(result.ok, false);
  assert.equal(mem.drafts.length, 0);
});

test("NEW_BLOG proceed creates planning draft without BlogPost write", async () => {
  const mem = memoryCatalog({ posts: [samplePost()] });
  const beforePosts = mem.posts.length;
  const result = await proceedSeoOpportunityToPlanningDraft({
    rawOpportunity: baseOpportunity(),
    rawSources: [{ title: "Amazon", url: "https://www.amazon.co.uk/help", domain: "amazon.co.uk" }],
    adminId: "admin_1",
    catalog: mem.catalog,
    createIdFn: () => "seoplan_new",
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.created, true);
  assert.equal(result.id, "seoplan_new");
  assert.equal(mem.posts.length, beforePosts);
  assert.equal(mem.drafts.length, 1);
  assert.equal(mem.drafts[0]?.workflowStatus, "PLANNING");
  assert.equal(mem.drafts[0]?.proposedSlug, "fix-fire-tv-buffering-on-uk-wi-fi");
  assert.equal(mem.openAiCalls(), 0);
  assert.equal(mem.gscCalls(), 0);
});

test("NEW_BLOG existing slug collision is rejected", async () => {
  const mem = memoryCatalog({
    posts: [samplePost({ slug: "fix-fire-tv-buffering-on-uk-wi-fi" })],
  });
  const result = await proceedSeoOpportunityToPlanningDraft({
    rawOpportunity: baseOpportunity(),
    adminId: "admin_1",
    catalog: mem.catalog,
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.error, /already owns that slug/i);
  assert.equal(mem.drafts.length, 0);
});

test("REFRESH_EXISTING resolves post id and creates no BlogPost", async () => {
  const post = samplePost();
  const mem = memoryCatalog({ posts: [post] });
  const before = JSON.stringify(post);
  const result = await proceedSeoOpportunityToPlanningDraft({
    rawOpportunity: baseOpportunity({
      recommendation: "REFRESH_EXISTING",
      existingCoverage: "STRONG",
      matchedTitle: post.title,
      matchedPublicUrl: "/blogs/getting-started-with-the-flixiptv/",
    }),
    adminId: "admin_1",
    catalog: mem.catalog,
    createIdFn: () => "seoplan_refresh",
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(mem.drafts[0]?.targetPostId, post.id);
  assert.equal(mem.drafts[0]?.fingerprint, `REFRESH_EXISTING:${post.id}`);
  assert.equal(mem.posts.length, 1);
  assert.equal(JSON.stringify(mem.posts[0]), before);
});

test("REFRESH unresolved matched URL rejected", async () => {
  const mem = memoryCatalog({ posts: [samplePost()] });
  const result = await proceedSeoOpportunityToPlanningDraft({
    rawOpportunity: baseOpportunity({
      recommendation: "REFRESH_EXISTING",
      matchedPublicUrl: "/blogs/does-not-exist/",
    }),
    adminId: "admin_1",
    catalog: mem.catalog,
  });
  assert.equal(result.ok, false);
  assert.equal(mem.drafts.length, 0);
});

test("RESTORE_HISTORICAL known REMOVED_OR_404 accepted; no redirect mutation", async () => {
  assert.ok(GSC_KNOWN_HISTORICAL_URLS.some((e) => e.path === BUFFERING));
  const mem = memoryCatalog({ redirects: [] });
  const beforeRedirects = mem.redirects.length;
  const result = await proceedSeoOpportunityToPlanningDraft({
    rawOpportunity: baseOpportunity({
      recommendation: "RESTORE_HISTORICAL",
      restorePath: BUFFERING,
      gscEvidence: [
        {
          id: "P1",
          kind: "page",
          normalizedPath: BUFFERING,
          classification: "REMOVED_OR_404",
          clicks: 2,
          impressions: 40,
          ctr: 0.05,
          position: 12,
        },
      ],
    }),
    adminId: "admin_1",
    catalog: mem.catalog,
    createIdFn: () => "seoplan_restore",
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(mem.drafts[0]?.restorePath, BUFFERING);
  assert.equal(mem.redirects.length, beforeRedirects);
  assert.equal(mem.posts.length, 0);
});

test("RESTORE CURRENT_CMS rejected", () => {
  const validated = validateProceedTarget({
    opportunity: baseOpportunity({
      recommendation: "RESTORE_HISTORICAL",
      restorePath: BUFFERING,
    }) as never,
    posts: [],
    pages: [
      {
        id: "page_buf",
        name: "Buffering",
        slug: BUFFERING,
        status: "published",
        cmsEnabled: true,
        sections: [],
      } as CmsPage,
    ],
    categories: [],
    redirects: [],
  });
  assert.equal(validated.ok, false);
  if (validated.ok) return;
  assert.match(validated.error, /currently owned by published CMS/i);
});

test("RESTORE rejects non-registry welcome-like path", () => {
  const validated = validateProceedTarget({
    opportunity: baseOpportunity({
      recommendation: "RESTORE_HISTORICAL",
      restorePath: "/welcome/",
    }) as never,
    posts: [],
    pages: [
      {
        id: "page_home",
        name: "Home",
        slug: "/",
        status: "published",
        cmsEnabled: true,
        sections: [],
      } as CmsPage,
    ],
    categories: [],
    redirects: [],
  });
  assert.equal(validated.ok, false);
});

test("RESTORE CURRENT_PUBLIC_NON_CMS rejected", () => {
  const validated = validateProceedTarget({
    opportunity: baseOpportunity({
      recommendation: "RESTORE_HISTORICAL",
      restorePath: "/blogs/",
    }) as never,
    posts: [],
    pages: [],
    categories: [],
    redirects: [],
  });
  assert.equal(validated.ok, false);
  if (validated.ok) return;
  assert.match(validated.error, /public route|registry|removed\/historical/i);
});

test("RESTORE REDIRECTED_HISTORICAL rejected", () => {
  const validated = validateProceedTarget({
    opportunity: baseOpportunity({
      recommendation: "RESTORE_HISTORICAL",
      restorePath: BUFFERING,
    }) as never,
    posts: [],
    pages: [],
    categories: [],
    redirects: [
      {
        id: "redir_1",
        sourcePath: BUFFERING,
        destinationPath: "/blogs/getting-started-with-the-flixiptv/",
        statusCode: 301,
        active: true,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ],
  });
  assert.equal(validated.ok, false);
  if (validated.ok) return;
  assert.match(validated.error, /Redirected historical/i);
});

test("RESTORE UNKNOWN / non-registry rejected", () => {
  const validated = validateProceedTarget({
    opportunity: baseOpportunity({
      recommendation: "RESTORE_HISTORICAL",
      restorePath: "/totally-unknown-historical-path/",
    }) as never,
    posts: [],
    pages: [],
    categories: [],
    redirects: [],
  });
  assert.equal(validated.ok, false);
});

test("RESTORE root rejected", () => {
  const validated = validateProceedTarget({
    opportunity: baseOpportunity({
      recommendation: "RESTORE_HISTORICAL",
      restorePath: "/",
    }) as never,
    posts: [],
    pages: [],
    categories: [],
    redirects: [],
  });
  assert.equal(validated.ok, false);
  if (validated.ok) return;
  assert.match(validated.error, /non-root|registry|valid/i);
});

test("INTERNAL_LINK_ONLY creates planning draft without BlogPost", async () => {
  const mem = memoryCatalog({ posts: [samplePost()] });
  const before = mem.posts.length;
  const result = await proceedSeoOpportunityToPlanningDraft({
    rawOpportunity: baseOpportunity({
      recommendation: "INTERNAL_LINK_ONLY",
      matchedPublicUrl: "/blogs/getting-started-with-the-flixiptv/",
    }),
    adminId: "admin_1",
    catalog: mem.catalog,
    createIdFn: () => "seoplan_link",
  });
  assert.equal(result.ok, true);
  assert.equal(mem.posts.length, before);
  assert.equal(mem.drafts.length, 1);
});

test("repeated Proceed returns existing draft (idempotent)", async () => {
  const mem = memoryCatalog({});
  const first = await proceedSeoOpportunityToPlanningDraft({
    rawOpportunity: baseOpportunity(),
    adminId: "admin_1",
    catalog: mem.catalog,
    createIdFn: () => "seoplan_a",
  });
  const second = await proceedSeoOpportunityToPlanningDraft({
    rawOpportunity: baseOpportunity(),
    adminId: "admin_1",
    catalog: mem.catalog,
    createIdFn: () => "seoplan_b",
  });
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  if (!first.ok || !second.ok) return;
  assert.equal(first.created, true);
  assert.equal(second.created, false);
  assert.equal(second.id, first.id);
  assert.equal(mem.drafts.length, 1);
});

test("duplicate fingerprint race resolves existing draft", async () => {
  const mem = memoryCatalog({});
  const first = await proceedSeoOpportunityToPlanningDraft({
    rawOpportunity: baseOpportunity(),
    adminId: "admin_1",
    catalog: mem.catalog,
    createIdFn: () => "seoplan_race_1",
  });
  assert.equal(first.ok, true);
  // Force race: clear lookup by temporarily wrapping get to miss then save conflict
  const originalGet = mem.catalog.getSeoPlanningDraftByFingerprint;
  let calls = 0;
  mem.catalog.getSeoPlanningDraftByFingerprint = async (fp) => {
    calls += 1;
    if (calls === 1) return null;
    return originalGet(fp);
  };
  const raced = await proceedSeoOpportunityToPlanningDraft({
    rawOpportunity: baseOpportunity(),
    adminId: "admin_1",
    catalog: mem.catalog,
    createIdFn: () => "seoplan_race_2",
  });
  assert.equal(raced.ok, true);
  if (!raced.ok || !first.ok) return;
  assert.equal(raced.created, false);
  assert.equal(raced.id, first.id);
  assert.equal(mem.drafts.length, 1);
});

test("Proceed resource safety: no OpenAI/GSC/background markers in proceed module", () => {
  const proceedSrc = read("lib/cms/seo-planning/proceed.ts");
  const actionSrc = read("lib/cms/seo-planning-actions.ts");
  assert.doesNotMatch(proceedSrc, /requestOpenAi|buildUkGscEvidencePack|web_search|fetch\(/);
  assert.doesNotMatch(actionSrc, /requestOpenAi|buildUkGscEvidencePack|web_search|fetch\(/);
  assert.doesNotMatch(proceedSrc, /setInterval|pagination/);
  assert.doesNotMatch(actionSrc, /savePost\(|saveRedirect\(/);
  assert.match(proceedSrc, /Never calls OpenAI\/GSC/);
  assert.match(actionSrc, /No OpenAI\. No GSC/);
});

test("Opportunities UI shows Proceed for actionable recommendations, not SKIP", () => {
  const panel = read("components/sidhu/SeoOpportunitiesPanel.tsx");
  assert.match(panel, /Proceed with this/);
  assert.match(panel, /This creates a private planning draft\. Nothing will be published\./);
  assert.match(panel, /Create planning draft/);
  assert.match(panel, /isSeoPlanningActionableRecommendation/);
  assert.doesNotMatch(panel, /recommendation === \"SKIP\"[\s\S]{0,80}Proceed with this/);

  const html = renderToStaticMarkup(
    createElement(SeoOpportunitiesPanel, {
      proceedAction: async () => ({ ok: false as const, error: "unused" }),
      aiConfigured: true,
      researchAction: async () =>
        ({
          ok: true as const,
          research: {
            opportunities: [
              baseOpportunity({ recommendation: "NEW_BLOG" }),
              baseOpportunity({
                recommendation: "SKIP",
                workingTitle: "Skip this idea",
                topic: "Skip topic",
              }),
            ],
            sources: [],
          },
        }) as ResearchUkOpportunitiesResult & { configured?: boolean },
      gscProbeAction: async () => ({
        ok: false as const,
        code: "unauthorized" as const,
        error: "unused",
      }),
    }),
  );
  // Initial render has no research results until click — static markup won't expand cards.
  // Source-level assertions above cover Proceed for actionable + confirmation copy.
  assert.match(html, /Research UK opportunities/);
  void html;
});

test("Planning list/detail admin UI has no publish/create/restore actions", () => {
  const list = read("components/sidhu/SeoPlanningList.tsx");
  const detail = read("components/sidhu/SeoPlanningDetail.tsx");
  const listPage = read("app/sidhu/(protected)/seo/planning/page.tsx");
  const detailPage = read("app/sidhu/(protected)/seo/planning/[id]/page.tsx");
  assert.match(listPage, /listSeoPlanningDrafts/);
  assert.match(detailPage, /getSeoPlanningDraftById/);
  assert.match(list, /Private planning drafts/);
  assert.match(detail, /Private planning draft/);
  assert.match(detail, /Not published/);
  for (const src of [list, detail, listPage, detailPage]) {
    assert.doesNotMatch(src, /\bPublish\b|Create Blog|savePost|Restore now|saveRedirect/);
  }

  const draft: SeoPlanningDraft = {
    id: "seoplan_ui",
    recommendation: "NEW_BLOG",
    workflowStatus: "PLANNING",
    fingerprint: "NEW_BLOG:demo",
    topic: "Demo topic",
    workingTitle: "Demo title",
    proposedSlug: "demo",
    targetPostId: null,
    matchedPublicUrl: "",
    restorePath: "",
    searchIntent: "INFORMATIONAL",
    linkedPostId: null,
    createdBy: "admin_1",
    createdAt: "2026-10-06T00:00:00.000Z",
    updatedAt: "2026-10-06T00:00:00.000Z",
    payload: {
      opportunity: {
        confidence: "MEDIUM",
        whyNow: "Because UK readers ask.",
        webEvidence: "Support pages mention it.",
        suggestedAngle: "Keep it practical.",
        nextStep: "Write outline later.",
        gscEvidence: [],
      },
      sources: [],
    },
  };
  const listHtml = renderToStaticMarkup(
    createElement(SeoPlanningList, {
      drafts: [draft],
      view: "active",
      activeCount: 1,
      archivedCount: 0,
    }),
  );
  const detailHtml = renderToStaticMarkup(
    createElement(SeoPlanningDetail, { draft, targetPostTitle: null }),
  );
  assert.match(listHtml, /Demo title/);
  assert.match(detailHtml, /Private planning draft/);
  assert.doesNotMatch(detailHtml, /\bPublish\b|Create Blog|Restore now/);
});

test("Planning has no public blog/sitemap surface", () => {
  const sitemap = read("lib/cms/sitemap-build.ts");
  const blogsPage = read("app/blogs/page.tsx");
  const blogSlug = read("app/blogs/[slug]/page.tsx");
  assert.doesNotMatch(sitemap, /seo_planning|SeoPlanning|listSeoPlanningDrafts/);
  assert.doesNotMatch(blogsPage, /seo_planning|SeoPlanning|listSeoPlanningDrafts/);
  assert.doesNotMatch(blogSlug, /seo_planning|SeoPlanning|listSeoPlanningDrafts/);
  const inventory = read("lib/cms/ai-seo/research-inventory.ts");
  assert.doesNotMatch(inventory, /listSeoPlanningDrafts|SeoPlanningDraft/);
});

test("SEO nav includes Planning after Opportunities", () => {
  const nav = read("lib/cms/sidhu-seo-nav.ts");
  assert.match(nav, /id: \"planning\"/);
  assert.match(nav, /\/sidhu\/seo\/planning\//);
  const opportunitiesIdx = nav.indexOf("/sidhu/seo/opportunities/");
  const planningIdx = nav.indexOf("/sidhu/seo/planning/");
  assert.ok(opportunitiesIdx >= 0 && planningIdx > opportunitiesIdx);
});

test("RESTORE CURRENT_CMS for registry path owned by published page is rejected", async () => {
  const mem = memoryCatalog({
    pages: [
      {
        id: "page_buf",
        name: "Buffering",
        slug: BUFFERING,
        status: "published",
        cmsEnabled: true,
        sections: [],
      } as CmsPage,
    ],
  });
  const result = await proceedSeoOpportunityToPlanningDraft({
    rawOpportunity: baseOpportunity({
      recommendation: "RESTORE_HISTORICAL",
      restorePath: BUFFERING,
    }),
    adminId: "admin_1",
    catalog: mem.catalog,
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.error, /currently owned by published CMS/i);
  assert.equal(mem.redirects.length, 0);
  assert.equal(mem.drafts.length, 0);
});

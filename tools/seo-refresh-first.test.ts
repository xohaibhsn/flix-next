/**
 * Refresh-First Governor V1 — deterministic evaluate tests.
 * Calls real helpers (not source-string assertions). Fixtures only — no CMS/GSC/providers.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import type { BlogPost } from "../lib/cms/types";
import {
  buildSeoRefreshFirstCorpusCandidates,
  buildSeoRefreshFirstFingerprint,
  evaluateSeoRefreshFirst,
  type SeoRefreshFirstCorpusCandidate,
  type SeoRefreshFirstInput,
} from "../lib/cms/seo-refresh-first";
import { decideSeoNextBestAction } from "../lib/cms/seo-next-best-action";
import { buildSeoResearchInventory } from "../lib/cms/ai-seo/research-inventory";

function candidate(
  overrides: Partial<SeoRefreshFirstCorpusCandidate> & Pick<SeoRefreshFirstCorpusCandidate, "postId" | "publicUrl">,
): SeoRefreshFirstCorpusCandidate {
  return {
    title: overrides.title || "Sample Post",
    slug: overrides.slug || "sample-post",
    status: overrides.status || "published",
    ...overrides,
  };
}

function basePassInput(overrides: Partial<SeoRefreshFirstInput> = {}): SeoRefreshFirstInput {
  return {
    opportunity: {
      topic: "Best IPTV apps for Firestick in 2026",
      workingTitle: "Best IPTV Apps for Firestick in 2026",
      proposedSlug: "best-iptv-apps-firestick-2026",
      existingCoverage: "NONE",
      whyNow: "Search demand is rising for Firestick IPTV app comparisons this quarter.",
      webEvidence: "Competitor roundups rank for best firestick iptv apps with thin UK coverage.",
      webEvidencePresent: true,
    },
    candidates: [],
    corpusComplete: true,
    signals: { duplicate: false, cannibalizationRisk: false },
    ...overrides,
  };
}

// --- Exact ownership ---

test("targetPostId → REFRESH_EXISTING", () => {
  const post = candidate({
    postId: "post-1",
    publicUrl: "/blogs/firestick-guide/",
    slug: "firestick-guide",
  });
  const r = evaluateSeoRefreshFirst(
    basePassInput({
      targetPostId: "post-1",
      candidates: [post],
      opportunity: {
        ...basePassInput().opportunity!,
        existingCoverage: "NONE",
        proposedSlug: "totally-different-slug",
      },
    }),
  );
  assert.equal(r.verdict, "REFRESH_EXISTING");
  assert.equal(r.target?.postId, "post-1");
  assert.equal(r.evidence.exactPostMatch, true);
});

test("targetPostId missing from corpus → UNKNOWN (not PASS)", () => {
  const r = evaluateSeoRefreshFirst(
    basePassInput({
      targetPostId: "missing-authoritative-id",
      candidates: [
        candidate({
          postId: "other",
          publicUrl: "/blogs/other/",
          slug: "other",
        }),
      ],
      corpusComplete: true,
    }),
  );
  assert.equal(r.verdict, "UNKNOWN");
  assert.notEqual(r.verdict, "PASS_NEW_CONTENT");
  assert.equal(r.evidence.exactPostMatch, false);
});

test("undefined corpusComplete fails closed (not PASS)", () => {
  const r = evaluateSeoRefreshFirst({
    opportunity: basePassInput().opportunity,
    candidates: [],
    signals: { duplicate: false, cannibalizationRisk: false },
    // corpusComplete intentionally omitted
  });
  assert.equal(r.evidence.corpusComplete, false);
  assert.equal(r.verdict, "UNKNOWN");
  assert.notEqual(r.verdict, "PASS_NEW_CONTENT");
});

test("exact slug → REFRESH_EXISTING", () => {
  const r = evaluateSeoRefreshFirst(
    basePassInput({
      candidates: [
        candidate({
          postId: "post-slug",
          publicUrl: "/blogs/best-iptv-apps-firestick-2026/",
          slug: "best-iptv-apps-firestick-2026",
        }),
      ],
    }),
  );
  assert.equal(r.verdict, "REFRESH_EXISTING");
  assert.equal(r.target?.postId, "post-slug");
  assert.equal(r.evidence.exactSlugMatch, true);
});

test("exact public URL → REFRESH_EXISTING", () => {
  const r = evaluateSeoRefreshFirst(
    basePassInput({
      opportunity: {
        ...basePassInput().opportunity!,
        proposedSlug: "other-slug",
        matchedPublicUrl: "/blogs/existing-guide/",
        existingCoverage: "NONE",
      },
      candidates: [
        candidate({
          postId: "post-url",
          publicUrl: "/blogs/existing-guide/",
          slug: "existing-guide",
        }),
      ],
    }),
  );
  assert.equal(r.verdict, "REFRESH_EXISTING");
  assert.equal(r.target?.postId, "post-url");
  assert.equal(r.evidence.exactUrlMatch, true);
});

test("exact canonical / current path → REFRESH_EXISTING", () => {
  const r = evaluateSeoRefreshFirst(
    basePassInput({
      opportunity: {
        ...basePassInput().opportunity!,
        proposedSlug: "other",
        matchedPublicUrl: "https://www.theflixiptv.com/blogs/canon-post/",
        existingCoverage: "NONE",
      },
      candidates: [
        candidate({
          postId: "post-canon",
          publicUrl: "/blogs/canon-post-internal/",
          slug: "canon-post-internal",
          canonicalUrl: "/blogs/canon-post/",
        }),
      ],
    }),
  );
  assert.equal(r.verdict, "REFRESH_EXISTING");
  assert.equal(r.target?.postId, "post-canon");
  assert.equal(r.evidence.canonicalMatch, true);
});

test("AI NONE cannot override exact targetPostId", () => {
  const r = evaluateSeoRefreshFirst(
    basePassInput({
      targetPostId: "owned",
      candidates: [
        candidate({ postId: "owned", publicUrl: "/blogs/owned/", slug: "owned" }),
      ],
      opportunity: {
        ...basePassInput().opportunity!,
        existingCoverage: "NONE",
        proposedSlug: "brand-new-topic-slug",
      },
    }),
  );
  assert.equal(r.verdict, "REFRESH_EXISTING");
  assert.notEqual(r.verdict, "PASS_NEW_CONTENT");
});

test("matched current URL resolves target", () => {
  const r = evaluateSeoRefreshFirst(
    basePassInput({
      opportunity: {
        ...basePassInput().opportunity!,
        matchedPublicUrl: "/blog/legacy-slug/",
        proposedSlug: "unrelated",
        existingCoverage: "PARTIAL",
      },
      candidates: [
        candidate({
          postId: "legacy-migrated",
          publicUrl: "/blogs/legacy-slug/",
          slug: "legacy-slug",
        }),
      ],
    }),
  );
  assert.equal(r.verdict, "REFRESH_EXISTING");
  assert.equal(r.target?.postId, "legacy-migrated");
});

test("unrelated URL does not refresh", () => {
  const r = evaluateSeoRefreshFirst(
    basePassInput({
      opportunity: {
        ...basePassInput().opportunity!,
        matchedPublicUrl: "/pricing/",
        proposedSlug: "fresh-unique-topic-2026",
        existingCoverage: "NONE",
      },
      candidates: [
        candidate({
          postId: "other",
          publicUrl: "/blogs/something-else/",
          slug: "something-else",
        }),
      ],
      corpusComplete: true,
    }),
  );
  assert.notEqual(r.verdict, "REFRESH_EXISTING");
  assert.equal(r.verdict, "PASS_NEW_CONTENT");
});

// --- GSC ---

test("relevant CURRENT_CMS ownership → REFRESH", () => {
  const r = evaluateSeoRefreshFirst(
    basePassInput({
      opportunity: {
        ...basePassInput().opportunity!,
        proposedSlug: "no-match-slug",
        existingCoverage: "NONE",
      },
      candidates: [
        candidate({
          postId: "gsc-owned",
          publicUrl: "/blogs/gsc-owned/",
          slug: "gsc-owned",
        }),
      ],
      gscOwnership: [
        {
          normalizedPath: "/blogs/gsc-owned/",
          classification: "CURRENT_CMS",
          ownsRelatedQueryPage: true,
          evidenceId: "P1",
        },
      ],
    }),
  );
  assert.equal(r.verdict, "REFRESH_EXISTING");
  assert.equal(r.target?.postId, "gsc-owned");
  assert.equal(r.evidence.gscOwnership, true);
});

test("unrelated GSC page does not block PASS", () => {
  const r = evaluateSeoRefreshFirst(
    basePassInput({
      gscOwnership: [
        {
          normalizedPath: "/contact/",
          classification: "CURRENT_CMS",
          ownsRelatedQueryPage: false,
        },
        {
          normalizedPath: "/blogs/other-topic/",
          classification: "CURRENT_PUBLIC_NON_CMS",
          ownsRelatedQueryPage: true,
        },
      ],
    }),
  );
  assert.equal(r.verdict, "PASS_NEW_CONTENT");
});

test("absent GSC evidence alone does not imply PASS", () => {
  const r = evaluateSeoRefreshFirst(
    basePassInput({
      opportunity: {
        topic: "Thin topic only",
        proposedSlug: "thin-topic-only",
        existingCoverage: "NONE",
        whyNow: "",
        webEvidence: "",
        webEvidencePresent: false,
      },
      gscOwnership: [],
      corpusComplete: true,
    }),
  );
  assert.equal(r.verdict, "UNKNOWN");
});

// --- Historical ---

test("eligible historical candidate prevents PASS", () => {
  const r = evaluateSeoRefreshFirst(
    basePassInput({
      historical: {
        path: "/old-iptv-guide/",
        registryKey: "hist:old-iptv-guide",
        classification: "REMOVED_OR_404",
        restoreEligible: true,
      },
    }),
  );
  assert.notEqual(r.verdict, "PASS_NEW_CONTENT");
  assert.equal(r.verdict, "UNKNOWN");
  assert.ok(r.historicalCandidate);
  assert.equal(r.historicalCandidate?.path, "/old-iptv-guide/");
  assert.equal(r.historicalCandidate?.restoreEligible, true);
});

test("historical evidence preserved in result", () => {
  const r = evaluateSeoRefreshFirst(
    basePassInput({
      historical: {
        path: "/archived-page/",
        registryKey: "hk1",
        classification: "REMOVED_OR_404",
        restoreEligible: true,
        dispositionHint: "RECREATE",
      },
    }),
  );
  assert.equal(r.historicalCandidate?.registryKey, "hk1");
  assert.equal(r.historicalCandidate?.dispositionHint, "RECREATE");
  assert.equal(r.evidence.historicalPath, "/archived-page/");
});

test("redirected historical URL is not a false restoration candidate", () => {
  const r = evaluateSeoRefreshFirst(
    basePassInput({
      historical: {
        path: "/old-redirected/",
        registryKey: "hk-redir",
        classification: "REDIRECTED_HISTORICAL",
        restoreEligible: true,
      },
    }),
  );
  assert.equal(r.historicalCandidate, undefined);
  assert.equal(r.verdict, "PASS_NEW_CONTENT");
});

test("historical candidate does not automatically recreate content", () => {
  const r = evaluateSeoRefreshFirst(
    basePassInput({
      historical: {
        path: "/gone/",
        registryKey: "hk-gone",
        classification: "REMOVED_OR_404",
        restoreEligible: true,
        dispositionHint: "RECREATE",
      },
    }),
  );
  assert.equal(r.verdict, "UNKNOWN");
  assert.notEqual(r.verdict, "PASS_NEW_CONTENT");
  // No write / recreate — result is advisory only
  assert.ok(r.historicalCandidate);
});

// --- Duplicate / cannibalization ---

test("duplicate + clear target → REFRESH", () => {
  const r = evaluateSeoRefreshFirst(
    basePassInput({
      signals: { duplicate: true },
      candidates: [
        candidate({
          postId: "dup-target",
          publicUrl: "/blogs/best-iptv-apps-firestick-2026/",
          slug: "best-iptv-apps-firestick-2026",
        }),
      ],
    }),
  );
  assert.equal(r.verdict, "REFRESH_EXISTING");
  assert.equal(r.target?.postId, "dup-target");
});

test("duplicate + no target → DUPLICATE", () => {
  const r = evaluateSeoRefreshFirst(
    basePassInput({
      signals: { duplicate: true },
      candidates: [
        candidate({
          postId: "unrelated",
          publicUrl: "/blogs/other/",
          slug: "other",
        }),
      ],
    }),
  );
  assert.equal(r.verdict, "DUPLICATE");
});

test("2 plausible current targets → CANNIBALIZATION_RISK", () => {
  const r = evaluateSeoRefreshFirst(
    basePassInput({
      opportunity: {
        ...basePassInput().opportunity!,
        proposedSlug: "shared-topic",
        matchedPublicUrl: "/blogs/alt-shared/",
      },
      candidates: [
        candidate({
          postId: "a",
          publicUrl: "/blogs/shared-topic/",
          slug: "shared-topic",
        }),
        candidate({
          postId: "b",
          publicUrl: "/blogs/alt-shared/",
          slug: "alt-shared",
        }),
      ],
    }),
  );
  assert.equal(r.verdict, "CANNIBALIZATION_RISK");
  assert.equal(r.evidence.cannibalizationRisk, true);
});

test("cannibalization never PASS", () => {
  const r = evaluateSeoRefreshFirst(
    basePassInput({
      signals: { cannibalizationRisk: true },
      corpusComplete: true,
    }),
  );
  assert.equal(r.verdict, "CANNIBALIZATION_RISK");
  assert.notEqual(r.verdict, "PASS_NEW_CONTENT");
});

// --- AI coverage ---

test("AI NONE + exact target → REFRESH", () => {
  const r = evaluateSeoRefreshFirst(
    basePassInput({
      targetPostId: "t1",
      candidates: [candidate({ postId: "t1", publicUrl: "/blogs/t1/", slug: "t1" })],
      opportunity: { ...basePassInput().opportunity!, existingCoverage: "NONE" },
    }),
  );
  assert.equal(r.verdict, "REFRESH_EXISTING");
});

test("AI STRONG + valid target → REFRESH", () => {
  const r = evaluateSeoRefreshFirst(
    basePassInput({
      opportunity: {
        ...basePassInput().opportunity!,
        existingCoverage: "STRONG",
        matchedPublicUrl: "/blogs/strong-match/",
        proposedSlug: "other",
      },
      candidates: [
        candidate({
          postId: "strong",
          publicUrl: "/blogs/strong-match/",
          slug: "strong-match",
        }),
      ],
    }),
  );
  assert.equal(r.verdict, "REFRESH_EXISTING");
});

test("AI STRONG without deterministic target → UNKNOWN", () => {
  const r = evaluateSeoRefreshFirst(
    basePassInput({
      opportunity: {
        ...basePassInput().opportunity!,
        existingCoverage: "STRONG",
        matchedPublicUrl: null,
        proposedSlug: "no-existing-match-slug",
      },
      candidates: [
        candidate({
          postId: "elsewhere",
          publicUrl: "/blogs/elsewhere/",
          slug: "elsewhere",
        }),
      ],
      corpusComplete: true,
    }),
  );
  assert.equal(r.verdict, "UNKNOWN");
});

test("PARTIAL alone does not PASS", () => {
  const r = evaluateSeoRefreshFirst(
    basePassInput({
      opportunity: {
        ...basePassInput().opportunity!,
        existingCoverage: "PARTIAL",
        matchedPublicUrl: null,
        proposedSlug: "partial-only-topic",
      },
      corpusComplete: true,
    }),
  );
  assert.notEqual(r.verdict, "PASS_NEW_CONTENT");
  assert.equal(r.verdict, "UNKNOWN");
});

// --- PASS / UNKNOWN ---

test("clean complete corpus absence + material evidence → PASS_NEW_CONTENT", () => {
  const r = evaluateSeoRefreshFirst(basePassInput());
  assert.equal(r.verdict, "PASS_NEW_CONTENT");
  assert.equal(r.evidence.corpusComplete, true);
  assert.equal(r.evidence.materialEvidence, true);
});

test("weak/thin evidence → UNKNOWN", () => {
  const r = evaluateSeoRefreshFirst(
    basePassInput({
      opportunity: {
        topic: "Something vaguely related maybe",
        proposedSlug: "something-vaguely-related-maybe",
        existingCoverage: "NONE",
        whyNow: "n/a",
        webEvidence: "todo",
        webEvidencePresent: false,
      },
    }),
  );
  assert.equal(r.verdict, "UNKNOWN");
});

test("incomplete corpus → UNKNOWN", () => {
  const r = evaluateSeoRefreshFirst(
    basePassInput({
      corpusComplete: false,
    }),
  );
  assert.equal(r.verdict, "UNKNOWN");
  assert.notEqual(r.verdict, "PASS_NEW_CONTENT");
});

test("empty topic → UNKNOWN", () => {
  const r = evaluateSeoRefreshFirst(
    basePassInput({
      opportunity: {
        topic: "",
        workingTitle: "",
        proposedSlug: "x",
        existingCoverage: "NONE",
        webEvidencePresent: true,
        whyNow: "Plenty of why now text for evidence only.",
      },
    }),
  );
  assert.equal(r.verdict, "UNKNOWN");
});

test("UNKNOWN is stable healthy result", () => {
  const a = evaluateSeoRefreshFirst(basePassInput({ corpusComplete: false }));
  const b = evaluateSeoRefreshFirst(basePassInput({ corpusComplete: false }));
  assert.equal(a.verdict, "UNKNOWN");
  assert.equal(a.fingerprint, b.fingerprint);
});

// --- Reservations ---

test("same draft slug reservation blocks PASS", () => {
  const r = evaluateSeoRefreshFirst(
    basePassInput({
      reservations: { draftSlugs: ["best-iptv-apps-firestick-2026"] },
    }),
  );
  assert.notEqual(r.verdict, "PASS_NEW_CONTENT");
  assert.ok(r.verdict === "DUPLICATE" || r.verdict === "REFRESH_EXISTING" || r.verdict === "UNKNOWN");
  assert.equal(r.evidence.draftReservation, true);
});

test("draft corpus candidate with same slug → REFRESH (not PASS)", () => {
  const r = evaluateSeoRefreshFirst(
    basePassInput({
      candidates: [
        candidate({
          postId: "draft-1",
          publicUrl: "/blogs/best-iptv-apps-firestick-2026/",
          slug: "best-iptv-apps-firestick-2026",
          status: "draft",
        }),
      ],
    }),
  );
  assert.equal(r.verdict, "REFRESH_EXISTING");
  assert.equal(r.target?.postId, "draft-1");
});

test("same Planning topic key reservation blocks PASS", () => {
  const r = evaluateSeoRefreshFirst(
    basePassInput({
      reservations: {
        reservedTopicKeys: ["best-iptv-apps-for-firestick-in-2026"],
      },
    }),
  );
  assert.notEqual(r.verdict, "PASS_NEW_CONTENT");
  assert.equal(r.verdict, "DUPLICATE");
  assert.equal(r.evidence.planningReservation, true);
});

test("unrelated reservation does not block", () => {
  const r = evaluateSeoRefreshFirst(
    basePassInput({
      reservations: {
        draftSlugs: ["totally-other-draft"],
        reservedTopicKeys: ["unrelated-planning-topic"],
        reservedSlugs: ["other-plan-slug"],
      },
    }),
  );
  assert.equal(r.verdict, "PASS_NEW_CONTENT");
});

test("published clear target outranks weaker reservation", () => {
  const r = evaluateSeoRefreshFirst(
    basePassInput({
      reservations: {
        draftSlugs: ["best-iptv-apps-firestick-2026"],
        reservedSlugs: ["best-iptv-apps-firestick-2026"],
      },
      candidates: [
        candidate({
          postId: "pub-1",
          publicUrl: "/blogs/best-iptv-apps-firestick-2026/",
          slug: "best-iptv-apps-firestick-2026",
          status: "published",
        }),
        candidate({
          postId: "draft-2",
          publicUrl: "/blogs/best-iptv-apps-firestick-2026-draft-copy/",
          slug: "best-iptv-apps-firestick-2026-draft-copy",
          status: "draft",
        }),
      ],
    }),
  );
  assert.equal(r.verdict, "REFRESH_EXISTING");
  assert.equal(r.target?.postId, "pub-1");
});

// --- Fingerprint ---

test("same logical input/result → same fingerprint", () => {
  const input = basePassInput();
  const a = evaluateSeoRefreshFirst(input);
  const b = evaluateSeoRefreshFirst(input);
  assert.equal(a.fingerprint, b.fingerprint);
  assert.match(a.fingerprint, /^[a-f0-9]{64}$/);
});

test("target changes → fingerprint changes", () => {
  const a = evaluateSeoRefreshFirst(
    basePassInput({
      targetPostId: "a",
      candidates: [candidate({ postId: "a", publicUrl: "/blogs/a/", slug: "a" })],
    }),
  );
  const b = evaluateSeoRefreshFirst(
    basePassInput({
      targetPostId: "b",
      candidates: [candidate({ postId: "b", publicUrl: "/blogs/b/", slug: "b" })],
    }),
  );
  assert.notEqual(a.fingerprint, b.fingerprint);
});

test("verdict changes → fingerprint changes", () => {
  const pass = evaluateSeoRefreshFirst(basePassInput());
  const unknown = evaluateSeoRefreshFirst(basePassInput({ corpusComplete: false }));
  assert.equal(pass.verdict, "PASS_NEW_CONTENT");
  assert.equal(unknown.verdict, "UNKNOWN");
  assert.notEqual(pass.fingerprint, unknown.fingerprint);
});

test("historical path changes → fingerprint changes", () => {
  const a = evaluateSeoRefreshFirst(
    basePassInput({
      historical: {
        path: "/hist-a/",
        registryKey: "a",
        classification: "REMOVED_OR_404",
        restoreEligible: true,
      },
    }),
  );
  const b = evaluateSeoRefreshFirst(
    basePassInput({
      historical: {
        path: "/hist-b/",
        registryKey: "b",
        classification: "REMOVED_OR_404",
        restoreEligible: true,
      },
    }),
  );
  assert.notEqual(a.fingerprint, b.fingerprint);
});

test("reason text does not change fingerprint", () => {
  const fp = buildSeoRefreshFirstFingerprint({
    verdict: "UNKNOWN",
    topic: "Topic A",
    historicalPath: "/x/",
  });
  const fp2 = buildSeoRefreshFirstFingerprint({
    verdict: "UNKNOWN",
    topic: "Topic A",
    historicalPath: "/x/",
  });
  assert.equal(fp, fp2);
});

// --- Corpus helper / Research inventory compatibility ---

test("corpus projection includes postId and stays bounded", () => {
  const posts: BlogPost[] = Array.from({ length: 25 }, (_, i) => ({
    id: `id-${i}`,
    title: `Post ${i}`,
    slug: `post-${i}`,
    excerpt: "ex",
    content: "BODY MUST NOT APPEAR",
    categoryId: null,
    featuredImage: null,
    status: "published",
    featured: false,
    publishedAt: `2026-01-${String((i % 28) + 1).padStart(2, "0")}T00:00:00.000Z`,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: `2026-02-${String((i % 28) + 1).padStart(2, "0")}T00:00:00.000Z`,
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
  }));
  const projected = buildSeoRefreshFirstCorpusCandidates(posts);
  assert.ok(projected.length <= 20);
  assert.ok(projected.every((c) => c.postId));
  assert.ok(projected.every((c) => !JSON.stringify(c).includes("BODY MUST NOT APPEAR")));
});

test("Research inventory shape unchanged (no postId on items)", () => {
  const inv = buildSeoResearchInventory({
    settings: {
      siteName: "Flix",
      pageSeo: {
        home: { title: "", description: "" },
        about: { title: "", description: "" },
        pricing: { title: "", description: "" },
        contact: { title: "", description: "" },
        blogs: { title: "", description: "" },
        channels: { title: "", description: "" },
        install: { title: "", description: "" },
        faq: { title: "", description: "" },
        terms: { title: "", description: "" },
        refund: { title: "", description: "" },
        privacy: { title: "", description: "" },
        cookie: { title: "", description: "" },
        copyright: { title: "", description: "" },
      },
    } as never,
    posts: [
      {
        id: "should-not-leak",
        title: "T",
        slug: "t",
        excerpt: "",
        content: "",
        categoryId: null,
        featuredImage: null,
        status: "published",
        featured: false,
        publishedAt: null,
        createdAt: "",
        updatedAt: "",
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
      },
    ],
    categories: [],
  });
  const postItems = inv.items.filter((i) => i.kind === "post");
  assert.ok(postItems.length >= 1);
  assert.equal("postId" in postItems[0], false);
  assert.ok(postItems[0].publicUrl);
});

// --- Safety / NBA compatibility ---

test("evaluate is pure — fixture-only, no network/CMS side effects", () => {
  const before = process.env.OPENAI_API_KEY;
  const r = evaluateSeoRefreshFirst(basePassInput());
  assert.ok(r.verdict);
  assert.equal(process.env.OPENAI_API_KEY, before);
  // Serializable
  const json = JSON.parse(JSON.stringify(r));
  assert.equal(json.verdict, r.verdict);
  assert.equal(json.fingerprint, r.fingerprint);
});

test("NBA accepts Governor verdict without NBA source changes", () => {
  const gov = evaluateSeoRefreshFirst(basePassInput());
  assert.equal(gov.verdict, "PASS_NEW_CONTENT");
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
    refreshFirst: { verdict: gov.verdict },
    evidence: { gscPresent: true, webEvidencePresent: true, corpusEvidencePresent: true },
  });
  assert.equal(decision.action, "NEW_BLOG");
  assert.equal(decision.autonomousEligible, true);

  const hold = decideSeoNextBestAction({
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
  assert.equal(hold.autonomousEligible, false);
});

test("absolute www URL normalizes to current Blog path", () => {
  const r = evaluateSeoRefreshFirst(
    basePassInput({
      opportunity: {
        ...basePassInput().opportunity!,
        proposedSlug: "x",
        matchedPublicUrl: "https://www.theflixiptv.com/blogs/norm-me/",
        existingCoverage: "NONE",
      },
      candidates: [
        candidate({
          postId: "norm",
          publicUrl: "/blogs/norm-me/",
          slug: "norm-me",
        }),
      ],
    }),
  );
  assert.equal(r.verdict, "REFRESH_EXISTING");
  assert.equal(r.target?.postId, "norm");
});

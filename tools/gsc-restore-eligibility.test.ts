/**
 * RESTORE_HISTORICAL Phase 1 — eligibility gate + normalization enforcement.
 * Mocks only. No Google / OpenAI / CMS writes.
 */

import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { SeoOpportunitiesPanel } from "../components/sidhu/SeoOpportunitiesPanel";
import {
  normalizeSeoResearchResult,
  SEO_RESEARCH_RECOMMENDATIONS,
} from "../lib/cms/ai-seo/research-schemas";
import { classifyGscPageUrls } from "../lib/cms/gsc/classify-url";
import type { GscUkEvidencePack } from "../lib/cms/gsc/evidence-types";
import { GSC_KNOWN_HISTORICAL_URLS } from "../lib/cms/gsc/historical-registry";
import {
  buildGscResearchFusionContext,
  collectGscPackPageUrls,
} from "../lib/cms/gsc/research-fusion";
import { GSC_EVIDENCE_MAX_GOOGLE_CALLS } from "../lib/cms/gsc/request-plan";
import {
  buildGscRestorationCandidates,
  gscRestorationPathAllowlist,
} from "../lib/cms/gsc/restore-eligibility";
import { buildGscSiteUrlIndex } from "../lib/cms/gsc/site-url-index";
import type { GscSearchAnalyticsRow } from "../lib/cms/gsc/types";

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

const BUFFERING = "/how-to-fix-buffering-issues-on-iptv/";
const RESELLER = "/become-an-iptv-reseller-in-uk/";
const B1G = "/install-b1g-player-on-firestick/";
const DOWNLOADS = "/downloads/";

function emptyIndex() {
  return buildGscSiteUrlIndex({
    pages: [],
    posts: [],
    categories: [],
    redirects: [],
    knownHistorical: GSC_KNOWN_HISTORICAL_URLS,
  });
}

function packWith(overrides: Partial<GscUkEvidencePack>): GscUkEvidencePack {
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
    recentPages: [],
    recentQueryPages: [],
    previousPages: [],
    ...overrides,
  };
}

function fusionForPack(pack: GscUkEvidencePack, index = emptyIndex()) {
  const classifications = classifyGscPageUrls(collectGscPackPageUrls(pack), index);
  return buildGscResearchFusionContext({ pack, classifications });
}

function opportunityBase(overrides: Record<string, unknown> = {}) {
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

test("RESTORE enum includes RESTORE_HISTORICAL; restorePath is required in schema", () => {
  assert.deepEqual([...SEO_RESEARCH_RECOMMENDATIONS], [
    "NEW_BLOG",
    "REFRESH_EXISTING",
    "INTERNAL_LINK_ONLY",
    "SKIP",
    "RESTORE_HISTORICAL",
  ]);
  const schemas = read("lib/cms/ai-seo/research-schemas.ts");
  assert.match(schemas, /restorePath/);
  assert.match(schemas, /RESTORE_HISTORICAL/);
  assert.doesNotMatch(schemas, /There is no RESTORE_HISTORICAL recommendation/);
});

test("1. REMOVED_OR_404 + P# + impressions > 0 → eligible", () => {
  const fusion = fusionForPack(
    packWith({
      recentPages: [row([`https://theflixiptv.com${BUFFERING}`], 0, 40, 0, 18)],
    }),
  );
  const candidates = buildGscRestorationCandidates(fusion.byId);
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0]?.path, BUFFERING);
  assert.equal(candidates[0]?.classification, "REMOVED_OR_404");
  assert.ok(candidates[0]?.evidenceIds.includes("P1"));
  assert.equal(candidates[0]?.evidence[0]?.impressions, 40);
});

test("2. REMOVED_OR_404 + QP# + clicks/impressions > 0 → eligible", () => {
  const fusion = fusionForPack(
    packWith({
      recentQueryPages: [
        row(["iptv buffering", `https://theflixiptv.com${BUFFERING}`], 2, 20, 0.1, 12),
      ],
    }),
  );
  const candidates = buildGscRestorationCandidates(fusion.byId);
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0]?.path, BUFFERING);
  assert.ok(candidates[0]?.evidenceIds.includes("QP1"));
});

test("3. registry path with no P#/QP# evidence → NOT eligible", () => {
  const fusion = fusionForPack(
    packWith({
      recentQueries: [row(["iptv buffering"], 1, 10, 0.1, 5)],
      recentPages: [row(["https://theflixiptv.com/welcome/"], 1, 10, 0.1, 3)],
    }),
  );
  // Registry still known, but buffering path has no page-bearing evidence ID.
  assert.ok(GSC_KNOWN_HISTORICAL_URLS.some((e) => e.path === BUFFERING));
  const candidates = buildGscRestorationCandidates(fusion.byId);
  assert.equal(candidates.find((c) => c.path === BUFFERING), undefined);
});

test("4. previous-period-only row + no current evidence ID → NOT eligible (Phase 1)", () => {
  const fusion = fusionForPack(
    packWith({
      previousPages: [row([`https://theflixiptv.com${BUFFERING}`], 0, 158, 0, 20)],
      recentPages: [],
      recentQueryPages: [],
    }),
  );
  // Previous pages contribute comparison only — no P# fabricated for previous-only URLs.
  assert.equal([...fusion.byId.keys()].some((id) => id.startsWith("P")), false);
  const candidates = buildGscRestorationCandidates(fusion.byId);
  assert.equal(candidates.length, 0);
  assert.match(read("lib/cms/gsc/restore-eligibility.ts"), /previousPages/);
  assert.match(read("lib/cms/gsc/research-fusion.ts"), /Previous-period-only/);
});

test("5. CURRENT_CMS → not eligible", () => {
  const index = buildGscSiteUrlIndex({
    pages: [
      {
        id: "page-restored",
        name: "Buffering",
        slug: BUFFERING,
        status: "published",
      },
    ],
    posts: [],
    categories: [],
    redirects: [],
    knownHistorical: GSC_KNOWN_HISTORICAL_URLS,
  });
  const fusion = fusionForPack(
    packWith({
      recentPages: [row([`https://theflixiptv.com${BUFFERING}`], 5, 50, 0.1, 8)],
    }),
    index,
  );
  assert.equal(fusion.byId.get("P1")?.classification, "CURRENT_CMS");
  assert.equal(buildGscRestorationCandidates(fusion.byId).length, 0);
});

test("6. CURRENT_PUBLIC_NON_CMS → not eligible", () => {
  const fusion = fusionForPack(
    packWith({
      recentPages: [row(["https://theflixiptv.com/blogs/"], 3, 30, 0.1, 4)],
    }),
  );
  assert.equal(fusion.byId.get("P1")?.classification, "CURRENT_PUBLIC_NON_CMS");
  assert.equal(buildGscRestorationCandidates(fusion.byId).length, 0);
});

test("7. REDIRECTED_HISTORICAL → not eligible in Phase 1", () => {
  const index = buildGscSiteUrlIndex({
    pages: [],
    posts: [],
    categories: [],
    redirects: [
      {
        id: "r1",
        sourcePath: BUFFERING,
        destinationPath: "/welcome/",
        statusCode: 301,
        active: true,
      },
    ],
    knownHistorical: GSC_KNOWN_HISTORICAL_URLS,
  });
  const fusion = fusionForPack(
    packWith({
      recentPages: [row([`https://theflixiptv.com${BUFFERING}`], 1, 50, 0.02, 15)],
    }),
    index,
  );
  assert.equal(fusion.byId.get("P1")?.classification, "REDIRECTED_HISTORICAL");
  assert.equal(buildGscRestorationCandidates(fusion.byId).length, 0);
});

test("8. UNKNOWN with impressions → not eligible", () => {
  const fusion = fusionForPack(
    packWith({
      recentPages: [row(["https://theflixiptv.com/never-existed-random-path/"], 0, 99, 0, 22)],
    }),
  );
  assert.equal(fusion.byId.get("P1")?.classification, "UNKNOWN");
  assert.equal(buildGscRestorationCandidates(fusion.byId).length, 0);
});

test("9. root / → never eligible", () => {
  const fusion = fusionForPack(
    packWith({
      recentPages: [row(["https://theflixiptv.com/"], 10, 1000, 0.01, 1)],
    }),
  );
  assert.equal(fusion.byId.get("P1")?.classification, "REDIRECTED_HISTORICAL");
  assert.equal(fusion.byId.get("P1")?.normalizedPath, "/");
  assert.equal(buildGscRestorationCandidates(fusion.byId).length, 0);
});

test("zero-metric REMOVED_OR_404 page is not eligible", () => {
  const fusion = fusionForPack(
    packWith({
      recentPages: [row([`https://theflixiptv.com${DOWNLOADS}`], 0, 0, 0, 40)],
    }),
  );
  assert.equal(fusion.byId.get("P1")?.classification, "REMOVED_OR_404");
  assert.equal(buildGscRestorationCandidates(fusion.byId).length, 0);
});

test("dedupes P# + QP# for same registry path", () => {
  const fusion = fusionForPack(
    packWith({
      recentPages: [row([`https://theflixiptv.com${RESELLER}`], 0, 12, 0, 16)],
      recentQueryPages: [
        row(["iptv reseller uk", `https://theflixiptv.com${RESELLER}`], 1, 8, 0.125, 11),
      ],
    }),
  );
  const candidates = buildGscRestorationCandidates(fusion.byId);
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0]?.path, RESELLER);
  assert.deepEqual(candidates[0]?.evidenceIds.sort(), ["P1", "QP1"]);
});

function normalizeRestore(
  overrides: Record<string, unknown>,
  fusion = fusionForPack(
    packWith({
      recentPages: [row([`https://theflixiptv.com${BUFFERING}`], 0, 40, 0, 18)],
    }),
  ),
) {
  return normalizeSeoResearchResult(
    { opportunities: [opportunityBase(overrides)] },
    new Set<string>(),
    {
      gscEvidenceById: fusion.byId,
      gscMeta: fusion.meta,
      restorationPathAllowlist: gscRestorationPathAllowlist(fusion.restorationCandidates),
    },
  );
}

test("10. AI RESTORE with eligible path + matching page-bearing ref + NONE → accepted", () => {
  const ok = normalizeRestore({
    existingCoverage: "NONE",
    restorePath: BUFFERING,
    gscEvidenceRefs: ["P1"],
  });
  assert.ok(ok);
  assert.equal(ok?.opportunities[0]?.recommendation, "RESTORE_HISTORICAL");
  assert.equal(ok?.opportunities[0]?.restorePath, BUFFERING);
  assert.equal(ok?.opportunities[0]?.gscEvidence[0]?.impressions, 40);
  assert.equal(ok?.opportunities[0]?.matchedPublicUrl, null);
});

test("10b. PARTIAL coverage also accepted for RESTORE", () => {
  const ok = normalizeRestore({
    existingCoverage: "PARTIAL",
    restorePath: BUFFERING,
    gscEvidenceRefs: ["P1"],
  });
  assert.ok(ok);
});

test("11. forged/non-eligible restorePath → fails", () => {
  assert.equal(
    normalizeRestore({
      restorePath: B1G,
      gscEvidenceRefs: ["P1"],
    }),
    null,
  );
});

test("12. AI RESTORE with only Q# evidence → fails", () => {
  const fusion = fusionForPack(
    packWith({
      recentQueries: [row(["iptv buffering"], 1, 10, 0.1, 5)],
      recentPages: [row([`https://theflixiptv.com${BUFFERING}`], 0, 40, 0, 18)],
    }),
  );
  assert.equal(
    normalizeSeoResearchResult(
      {
        opportunities: [
          opportunityBase({
            restorePath: BUFFERING,
            gscEvidenceRefs: ["Q1"],
          }),
        ],
      },
      new Set(),
      {
        gscEvidenceById: fusion.byId,
        restorationPathAllowlist: gscRestorationPathAllowlist(fusion.restorationCandidates),
      },
    ),
    null,
  );
});

test("13. P#/QP# belonging to another path → fails", () => {
  const fusion = fusionForPack(
    packWith({
      recentPages: [
        row([`https://theflixiptv.com${BUFFERING}`], 0, 40, 0, 18),
        row([`https://theflixiptv.com${DOWNLOADS}`], 0, 10, 0, 30),
      ],
    }),
  );
  assert.equal(
    normalizeSeoResearchResult(
      {
        opportunities: [
          opportunityBase({
            restorePath: BUFFERING,
            gscEvidenceRefs: ["P2"],
          }),
        ],
      },
      new Set(),
      {
        gscEvidenceById: fusion.byId,
        restorationPathAllowlist: gscRestorationPathAllowlist(fusion.restorationCandidates),
      },
    ),
    null,
  );
});

test("14. existingCoverage STRONG → fails", () => {
  assert.equal(
    normalizeRestore({
      existingCoverage: "STRONG",
      restorePath: BUFFERING,
      gscEvidenceRefs: ["P1"],
    }),
    null,
  );
});

test("15. non-empty matchedPublicUrl → fails", () => {
  assert.equal(
    normalizeRestore({
      matchedPublicUrl: "/welcome/",
      restorePath: BUFFERING,
      gscEvidenceRefs: ["P1"],
    }),
    null,
  );
});

test("16. non-RESTORE with non-empty restorePath → fails", () => {
  assert.equal(
    normalizeRestore({
      recommendation: "NEW_BLOG",
      restorePath: BUFFERING,
      gscEvidenceRefs: [],
    }),
    null,
  );
});

test("17. REFRESH_EXISTING behavior unchanged", () => {
  const allow = new Set(["/blogs/getting-started-with-the-flixiptv/"]);
  const ok = normalizeSeoResearchResult(
    {
      opportunities: [
        opportunityBase({
          recommendation: "REFRESH_EXISTING",
          restorePath: "",
          existingCoverage: "PARTIAL",
          matchedTitle: "Getting Started",
          matchedPublicUrl: "/blogs/getting-started-with-the-flixiptv/",
          gscEvidenceRefs: [],
        }),
      ],
    },
    allow,
  );
  assert.ok(ok);
  assert.equal(ok?.opportunities[0]?.recommendation, "REFRESH_EXISTING");
  assert.equal(ok?.opportunities[0]?.restorePath, "");
  assert.equal(ok?.opportunities[0]?.matchedPublicUrl, "/blogs/getting-started-with-the-flixiptv/");
});

test("18. INTERNAL_LINK_ONLY behavior unchanged", () => {
  const allow = new Set(["/blogs/getting-started-with-the-flixiptv/"]);
  const ok = normalizeSeoResearchResult(
    {
      opportunities: [
        opportunityBase({
          recommendation: "INTERNAL_LINK_ONLY",
          restorePath: "",
          existingCoverage: "STRONG",
          matchedTitle: "Getting Started",
          matchedPublicUrl: "/blogs/getting-started-with-the-flixiptv/",
          gscEvidenceRefs: [],
        }),
      ],
    },
    allow,
  );
  assert.ok(ok);
  assert.equal(ok?.opportunities[0]?.recommendation, "INTERNAL_LINK_ONLY");
});

test("19–20. UI renders RESTORE + historical path; no mutation actions", () => {
  const panel = read("components/sidhu/SeoOpportunitiesPanel.tsx");
  assert.match(panel, /RESTORE_HISTORICAL/);
  assert.match(panel, /Restore historical/);
  assert.match(panel, /Historical path/);
  assert.match(panel, /restorePath/);
  assert.doesNotMatch(panel, /Create Blog|Save opportunity|Publish|Restore button|onRestore|createPost/);

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
          opportunities: [
            {
              topic: "Buffering",
              workingTitle: "Restore buffering guide",
              searchIntent: "TROUBLESHOOTING" as const,
              whyNow: "Historical GSC interest remains.",
              webEvidence: "UK buffering help is still relevant.",
              existingCoverage: "NONE" as const,
              matchedTitle: null,
              matchedPublicUrl: null,
              recommendation: "RESTORE_HISTORICAL" as const,
              restorePath: BUFFERING,
              suggestedAngle: "Restore focused troubleshooting.",
              nextStep: "Editorial review only.",
              confidence: "MEDIUM" as const,
              gscEvidenceRefs: ["P1"],
              gscEvidence: [
                {
                  id: "P1",
                  kind: "page" as const,
                  pageUrl: `https://theflixiptv.com${BUFFERING}`,
                  normalizedPath: BUFFERING,
                  classification: "REMOVED_OR_404" as const,
                  historicalKey: "hist-fix-buffering-iptv",
                  clicks: 0,
                  impressions: 40,
                  ctr: 0,
                  position: 18,
                },
              ],
              historicalSignal: true,
            },
          ],
          sources: [],
        },
      }),
    }),
  );
  // Initial client render has no research yet.
  assert.match(html, /Research UK opportunities/);
  assert.doesNotMatch(html, /Create Blog|Save opportunity|Publish/);
});

test("21–23. safety locks remain in classifier + fusion notes", () => {
  const classify = read("lib/cms/gsc/classify-url.ts");
  const fusion = read("lib/cms/gsc/research-fusion.ts");
  const eligibility = read("lib/cms/gsc/restore-eligibility.ts");
  assert.match(classify, /UNKNOWN is not a 404 claim/);
  assert.match(fusion, /REDIRECTED_HISTORICAL means a known redirect source/);
  assert.match(fusion, /not an automatic restore/);
  assert.match(fusion, /Root \/ redirecting to \/welcome\//);
  assert.match(eligibility, /Registry membership alone is insufficient/);
  assert.doesNotMatch(eligibility, /158/);
});

test("24. resource bounds: eligibility uses fusion only; max 4 GSC calls unchanged", () => {
  assert.equal(GSC_EVIDENCE_MAX_GOOGLE_CALLS, 4);
  const eligibility = read("lib/cms/gsc/restore-eligibility.ts");
  const run = read("lib/cms/ai-seo/research-run.ts");
  const research = read("lib/cms/ai-seo/research.ts");
  assert.match(eligibility, /No Google \/ OpenAI calls/);
  assert.doesNotMatch(eligibility, /querySearchAnalytics|buildUkGscEvidencePack/);
  assert.equal((research.match(/await requestOpenAiUkOpportunityResearch/g) || []).length, 1);
  assert.doesNotMatch(run, /requestOpenAiUkOpportunityResearch/);
  assert.match(run, /buildUkGscEvidencePack/);
});

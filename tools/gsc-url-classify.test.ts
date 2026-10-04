import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { classifyGscPageUrl, classifyGscPageUrls } from "../lib/cms/gsc/classify-url";
import { GSC_KNOWN_HISTORICAL_URLS } from "../lib/cms/gsc/historical-registry";
import { buildGscSiteUrlIndex } from "../lib/cms/gsc/site-url-index";
import { normalizeGscPageUrl } from "../lib/cms/gsc/url-normalize";
import { GSC_URL_CLASSES } from "../lib/cms/gsc/url-classes";

const root = process.cwd();

function read(rel: string) {
  return readFileSync(path.join(root, rel), "utf8");
}

function fixtureIndex(overrides: Parameters<typeof buildGscSiteUrlIndex>[0] = {}) {
  return buildGscSiteUrlIndex({
    pages: [
      { id: "page-home", name: "Home", slug: "/", status: "published" },
      { id: "page-contact", name: "Contact", slug: "/contact/", status: "published" },
      {
        id: "page-subscriptions",
        name: "IPTV Subscription",
        slug: "/iptv-subscription-uk/",
        status: "published",
      },
      { id: "page-draft", name: "Draft Page", slug: "/draft-only/", status: "draft" },
    ],
    posts: [
      {
        id: "post-1",
        title: "Firestick Guide",
        slug: "how-to-watch-iptv-on-firestick",
        status: "published",
      },
      {
        id: "post-draft",
        title: "Draft Post",
        slug: "draft-post-hidden",
        status: "draft",
      },
    ],
    categories: [
      { id: "cat-1", name: "Setup", slug: "setup", active: true },
      { id: "cat-off", name: "Inactive", slug: "inactive-cat", active: false },
    ],
    redirects: [
      {
        id: "redir-custom",
        sourcePath: "/old-promo/",
        destinationPath: "/welcome/",
        statusCode: 301,
        active: true,
      },
      {
        id: "redir-inactive",
        sourcePath: "/retired-inactive/",
        destinationPath: "/welcome/",
        statusCode: 301,
        active: false,
      },
    ],
    ...overrides,
  });
}

// ---------------------------------------------------------------------------
// Normalization
// ---------------------------------------------------------------------------

test("GSC-3 normalize: https apex current URL", () => {
  const n = normalizeGscPageUrl("https://theflixiptv.com/welcome/");
  assert.equal(n.malformed, false);
  assert.equal(n.foreignHost, false);
  assert.equal(n.normalizedOrigin, "https://theflixiptv.com");
  assert.equal(n.normalizedPath, "/welcome/");
  assert.equal(n.matchingKey, "https://theflixiptv.com/welcome/");
  assert.equal(n.rawUrl, "https://theflixiptv.com/welcome/");
});

test("GSC-3 normalize: http production URL maps to https matching key", () => {
  const n = normalizeGscPageUrl("http://theflixiptv.com/contact/");
  assert.equal(n.matchingKey, "https://theflixiptv.com/contact/");
  assert.equal(n.normalizedPath, "/contact/");
  assert.equal(n.rawUrl, "http://theflixiptv.com/contact/");
});

test("GSC-3 normalize: www maps to apex", () => {
  const n = normalizeGscPageUrl("https://www.theflixiptv.com/blogs/");
  assert.equal(n.matchingKey, "https://theflixiptv.com/blogs/");
  assert.equal(n.foreignHost, false);
});

test("GSC-3 normalize: query and hash removed from matching key; raw preserved", () => {
  const n = normalizeGscPageUrl("https://theflixiptv.com/welcome/?utm=1#section");
  assert.equal(n.matchingKey, "https://theflixiptv.com/welcome/");
  assert.equal(n.normalizedPath, "/welcome/");
  assert.equal(n.rawUrl, "https://theflixiptv.com/welcome/?utm=1#section");
});

test("GSC-3 normalize: trailing slash normalized", () => {
  const n = normalizeGscPageUrl("https://theflixiptv.com/contact");
  assert.equal(n.normalizedPath, "/contact/");
  assert.equal(n.matchingKey, "https://theflixiptv.com/contact/");
});

test("GSC-3 normalize: foreign host → foreignHost; malformed handled", () => {
  const foreign = normalizeGscPageUrl("https://example.com/welcome/");
  assert.equal(foreign.foreignHost, true);
  assert.equal(foreign.matchingKey, null);
  assert.equal(foreign.rawUrl, "https://example.com/welcome/");

  const bad = normalizeGscPageUrl("not a url :::");
  assert.equal(bad.malformed, true);
  assert.equal(bad.matchingKey, null);
});

test("GSC-3 normalize: path case is not destructively lowercased", () => {
  const n = normalizeGscPageUrl("https://theflixiptv.com/About-Us/");
  assert.equal(n.normalizedPath, "/About-Us/");
  assert.equal(n.matchingKey, "https://theflixiptv.com/About-Us/");
  assert.notEqual(n.normalizedPath, "/about-us/");
});

// ---------------------------------------------------------------------------
// Current CMS / public / unpublished
// ---------------------------------------------------------------------------

test("GSC-3 current CMS page/post/category classification", () => {
  const index = fixtureIndex();
  assert.equal(classifyGscPageUrl("https://theflixiptv.com/welcome/", index).classification, "CURRENT_CMS");
  assert.equal(classifyGscPageUrl("/contact/", index).classification, "CURRENT_CMS");
  assert.equal(
    classifyGscPageUrl("https://theflixiptv.com/blogs/how-to-watch-iptv-on-firestick/", index).classification,
    "CURRENT_CMS",
  );
  assert.equal(classifyGscPageUrl("/category/setup/", index).classification, "CURRENT_CMS");
  assert.equal(
    classifyGscPageUrl("/iptv-subscription-uk/", index).sourceKind,
    "page",
  );
});

test("GSC-3 unpublished/private and admin routes are not CURRENT_CMS", () => {
  const index = fixtureIndex();
  assert.equal(classifyGscPageUrl("/draft-only/", index).classification, "UNKNOWN");
  assert.equal(classifyGscPageUrl("/blogs/draft-post-hidden/", index).classification, "UNKNOWN");
  assert.equal(classifyGscPageUrl("/category/inactive-cat/", index).classification, "UNKNOWN");
  assert.equal(classifyGscPageUrl("/sidhu/", index).classification, "UNKNOWN");
  assert.equal(classifyGscPageUrl("/sidhu/seo/", index).classification, "UNKNOWN");
  assert.equal(classifyGscPageUrl("/api/health/", index).classification, "UNKNOWN");
});

test("GSC-3 current public non-CMS blog index + root/welcome relationship", () => {
  const index = fixtureIndex();
  const blogs = classifyGscPageUrl("https://www.theflixiptv.com/blogs/", index);
  assert.equal(blogs.classification, "CURRENT_PUBLIC_NON_CMS");
  assert.equal(blogs.matchedCurrentUrl, "/blogs/");

  const root = classifyGscPageUrl("https://theflixiptv.com/", index);
  assert.equal(root.classification, "REDIRECTED_HISTORICAL");
  assert.equal(root.redirectDestination, "/welcome/");
  assert.notEqual(root.classification, "REMOVED_OR_404");

  const welcome = classifyGscPageUrl("/welcome/", index);
  assert.equal(welcome.classification, "CURRENT_CMS");
});

// ---------------------------------------------------------------------------
// Redirected historical
// ---------------------------------------------------------------------------

test("GSC-3 legacy blog and subscription aliases are REDIRECTED_HISTORICAL", () => {
  const index = fixtureIndex();

  const blogIndex = classifyGscPageUrl("https://theflixiptv.com/blog/", index);
  assert.equal(blogIndex.classification, "REDIRECTED_HISTORICAL");
  assert.equal(blogIndex.redirectDestination, "/blogs/");

  const blogPost = classifyGscPageUrl(
    "http://www.theflixiptv.com/blog/how-to-watch-iptv-on-firestick/",
    index,
  );
  assert.equal(blogPost.classification, "REDIRECTED_HISTORICAL");
  assert.equal(blogPost.redirectDestination, "/blogs/how-to-watch-iptv-on-firestick/");

  for (const source of [
    "/iptv-subscriptions-uk/",
    "/iptv-subscription/",
    "/iptv-subscriptions/",
  ]) {
    const result = classifyGscPageUrl(`https://theflixiptv.com${source}`, index);
    assert.equal(result.classification, "REDIRECTED_HISTORICAL");
    assert.equal(result.redirectDestination, "/iptv-subscription-uk/");
  }
});

test("GSC-3 active CMS redirect counts; inactive does not", () => {
  const index = fixtureIndex();
  const active = classifyGscPageUrl("/old-promo/", index);
  assert.equal(active.classification, "REDIRECTED_HISTORICAL");
  assert.equal(active.redirectDestination, "/welcome/");
  assert.equal(active.redirectStatusCode, 301);
  assert.equal(active.sourceKind, "cms_redirect");

  const inactive = classifyGscPageUrl("/retired-inactive/", index);
  assert.equal(inactive.classification, "UNKNOWN");
  assert.notEqual(inactive.classification, "REDIRECTED_HISTORICAL");
});

// ---------------------------------------------------------------------------
// Known removed + precedence
// ---------------------------------------------------------------------------

test("GSC-3 known removed historical URLs → REMOVED_OR_404; unmatched → UNKNOWN", () => {
  const index = fixtureIndex();
  for (const entry of GSC_KNOWN_HISTORICAL_URLS) {
    const result = classifyGscPageUrl(`https://theflixiptv.com${entry.path}`, index);
    assert.equal(result.classification, "REMOVED_OR_404");
    assert.equal(result.historicalKey, entry.key);
  }

  const unknown = classifyGscPageUrl("/never-existed-random-path/", index);
  assert.equal(unknown.classification, "UNKNOWN");
  assert.notEqual(unknown.classification, "REMOVED_OR_404");
});

test("GSC-3 current CMS / redirect wins over known-removed registry", () => {
  const conflictPath = "/how-to-fix-buffering-issues-on-iptv/";
  const asCurrent = fixtureIndex({
    pages: [
      {
        id: "page-restored",
        name: "Restored",
        slug: conflictPath,
        status: "published",
      },
    ],
  });
  assert.equal(classifyGscPageUrl(conflictPath, asCurrent).classification, "CURRENT_CMS");

  const asRedirect = fixtureIndex({
    pages: [],
    posts: [],
    categories: [],
    redirects: [
      {
        id: "redir-hist",
        sourcePath: conflictPath,
        destinationPath: "/welcome/",
        statusCode: 301,
        active: true,
      },
    ],
  });
  const redirected = classifyGscPageUrl(conflictPath, asRedirect);
  assert.equal(redirected.classification, "REDIRECTED_HISTORICAL");
  assert.equal(redirected.redirectDestination, "/welcome/");
});

test("GSC-3 foreign/malformed never become REMOVED_OR_404", () => {
  const index = fixtureIndex();
  assert.equal(classifyGscPageUrl("https://evil.example/downloads/", index).classification, "UNKNOWN");
  assert.equal(classifyGscPageUrl("::::::", index).classification, "UNKNOWN");
});

// ---------------------------------------------------------------------------
// Batch / resource safety
// ---------------------------------------------------------------------------

test("GSC-3 batch classification uses one index; no per-URL reload markers", () => {
  let builds = 0;
  const buildOnce = () => {
    builds += 1;
    return fixtureIndex();
  };
  const index = buildOnce();
  assert.equal(builds, 1);

  const urls = [
    "/welcome/",
    "/blog/",
    "/blogs/",
    "/downloads/",
    "/never-seen/",
    "https://other.com/x/",
  ];
  const results = classifyGscPageUrls(urls, index);
  assert.equal(builds, 1);
  assert.equal(results.length, 6);
  assert.deepEqual(
    results.map((r) => r.classification),
    [
      "CURRENT_CMS",
      "REDIRECTED_HISTORICAL",
      "CURRENT_PUBLIC_NON_CMS",
      "REMOVED_OR_404",
      "UNKNOWN",
      "UNKNOWN",
    ],
  );
  assert.equal(index.stats.cmsPaths > 0, true);
});

test("GSC-3 resource safety: no Google/OpenAI/network/persistence in module sources", () => {
  const files = [
    "lib/cms/gsc/url-classes.ts",
    "lib/cms/gsc/url-normalize.ts",
    "lib/cms/gsc/historical-registry.ts",
    "lib/cms/gsc/site-url-index.ts",
    "lib/cms/gsc/classify-url.ts",
  ];
  for (const file of files) {
    const code = read(file)
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:])\/\/.*$/gm, "$1");
    assert.doesNotMatch(code, /openai|OpenAI|chat\.completions/i);
    assert.doesNotMatch(code, /googleapis|webmasters\/v3|searchAnalytics/i);
    assert.doesNotMatch(code, /\bfetch\s*\(|HEAD\b|node-fetch|http\.request/);
    assert.doesNotMatch(code, /writeFile|saveRedirect|savePage|INSERT INTO|UPDATE /);
    assert.doesNotMatch(code, /setInterval|setTimeout\(|cron/);
  }

  // Not wired into GSC-2 evidence pack or Opportunities UI
  assert.doesNotMatch(read("lib/cms/gsc/evidence-pack.ts"), /classifyGscPageUrl|buildGscSiteUrlIndex/);
  assert.doesNotMatch(
    read("components/sidhu/SeoOpportunitiesPanel.tsx"),
    /classifyGscPageUrl|buildGscSiteUrlIndex|historical-registry/,
  );

  assert.deepEqual([...GSC_URL_CLASSES], [
    "CURRENT_CMS",
    "CURRENT_PUBLIC_NON_CMS",
    "REDIRECTED_HISTORICAL",
    "REMOVED_OR_404",
    "UNKNOWN",
  ]);
});

test("GSC-3 documents UNKNOWN ≠ 404 and no SEO score fields", () => {
  const classify = read("lib/cms/gsc/classify-url.ts");
  const classes = read("lib/cms/gsc/url-classes.ts");
  assert.match(classify, /UNKNOWN is not a 404 claim/i);
  assert.doesNotMatch(classes, /seoScore|RESTORE_HISTORICAL|restoreRecommendation/);
  const result = classifyGscPageUrl("/nope/", fixtureIndex());
  assert.equal("seoScore" in result, false);
});

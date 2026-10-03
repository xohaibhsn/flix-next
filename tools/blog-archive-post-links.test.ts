import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import {
  blogIndexPostCardLinks,
  categoryArchivePostCardLinks,
} from "../lib/cms/blog-archive-post-links";
import { defaultSettings } from "../lib/cms/defaults";
import { classifyInternalLink, scanInternalLinks } from "../lib/cms/internal-links";
import { buildSeoHealthReport } from "../lib/cms/seo-health";
import type { BlogCategory, BlogPost } from "../lib/cms/types";

const root = process.cwd();
const helperSource = readFileSync(path.join(root, "lib/cms/blog-archive-post-links.ts"), "utf8");
const scannerSource = readFileSync(path.join(root, "lib/cms/internal-links.ts"), "utf8");
const seoHealthSource = readFileSync(path.join(root, "lib/cms/seo-health.ts"), "utf8");

function category(overrides: Partial<BlogCategory> = {}): BlogCategory {
  return {
    id: "cat-alpha",
    name: "Alpha Topic",
    slug: "alpha-topic",
    description: "",
    active: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    seoTitle: "",
    seoDescription: "",
    focusKeyword: "",
    canonicalUrl: "",
    robotsIndex: null,
    robotsFollow: null,
    ogTitle: "",
    ogDescription: "",
    ogImage: null,
    sitemapInclude: null,
    ...overrides,
  };
}

function post(overrides: Partial<BlogPost> = {}): BlogPost {
  return {
    id: "post-one",
    title: "First Published Guide",
    slug: "first-published-guide",
    excerpt: "Excerpt",
    content: "<p>Body</p>",
    categoryId: "cat-alpha",
    featuredImage: null,
    status: "published",
    featured: false,
    publishedAt: "2026-01-02T00:00:00.000Z",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
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

test("blog index helper emits /blogs/[slug]/ links for published posts only", () => {
  const links = blogIndexPostCardLinks([
    post(),
    post({ id: "draft", title: "Draft Only", slug: "draft-only", status: "draft" }),
    post({ id: "empty", title: "No Slug", slug: "  " }),
  ]);
  assert.deepEqual(
    links.map((link) => ({ href: link.href, sourcePath: link.sourcePath, label: link.label })),
    [{ href: "/blogs/first-published-guide/", sourcePath: "/blogs/", label: "First Published Guide" }],
  );
});

test("category archive helper only links published posts that belong to each active category", () => {
  const alpha = category();
  const beta = category({ id: "cat-beta", name: "Beta Topic", slug: "beta-topic" });
  const inactive = category({ id: "cat-old", name: "Old", slug: "old", active: false });
  const links = categoryArchivePostCardLinks(
    [alpha, beta, inactive],
    [
      post({ id: "a1", title: "Alpha One", slug: "alpha-one", categoryId: alpha.id }),
      post({ id: "b1", title: "Beta One", slug: "beta-one", categoryId: beta.id }),
      post({ id: "orphan", title: "No Category", slug: "no-category", categoryId: null }),
      post({ id: "old", title: "Old Cat Post", slug: "old-cat-post", categoryId: inactive.id }),
      post({ id: "draft", title: "Draft Alpha", slug: "draft-alpha", categoryId: alpha.id, status: "draft" }),
    ],
  );
  assert.deepEqual(
    links.map((link) => `${link.sourcePath}->${link.href}`),
    ["/category/alpha-topic/->/blogs/alpha-one/", "/category/beta-topic/->/blogs/beta-one/"],
  );
});

test("scan records blog-index and category-archive post-card links and clears real orphans", () => {
  const alpha = category();
  const published = post({ categoryId: alpha.id });
  const other = post({
    id: "post-two",
    title: "Second Published Guide",
    slug: "second-published-guide",
    categoryId: alpha.id,
  });
  const draft = post({
    id: "post-draft",
    title: "Draft Guide",
    slug: "draft-guide",
    status: "draft",
    categoryId: alpha.id,
  });

  const scan = scanInternalLinks({
    settings: defaultSettings(),
    pages: [],
    posts: [published, other, draft],
    categories: [alpha],
    redirects: [],
    codeLinks: [],
  });

  const indexCards = scan.findings.filter((f) => f.context === "BlogIndexPostCard");
  assert.equal(indexCards.length, 2);
  assert.ok(indexCards.every((f) => f.sourceUrl === "/blogs/" && f.issues.includes("VALID")));
  assert.deepEqual(
    indexCards.map((f) => f.storedHref).sort(),
    ["/blogs/first-published-guide/", "/blogs/second-published-guide/"].sort(),
  );

  const categoryCards = scan.findings.filter((f) => f.context === "CategoryArchivePostCard");
  assert.equal(categoryCards.length, 2);
  assert.ok(categoryCards.every((f) => f.sourceUrl === "/category/alpha-topic/"));

  assert.equal(scan.orphans.some((o) => o.path === "/blogs/first-published-guide/"), false);
  assert.equal(scan.orphans.some((o) => o.path === "/blogs/second-published-guide/"), false);
  assert.equal(scan.findings.some((f) => f.storedHref === "/blogs/draft-guide/"), false);

  // Existing category-nav modelling still present.
  assert.ok(scan.findings.some((f) => f.context === "BlogCategoryNav" && f.storedHref === "/category/alpha-topic/"));
});

test("inactive categories generate no archive post-card links", () => {
  const inactive = category({ active: false });
  const links = categoryArchivePostCardLinks([inactive], [post({ categoryId: inactive.id })]);
  assert.deepEqual(links, []);

  const scan = scanInternalLinks({
    settings: defaultSettings(),
    pages: [],
    posts: [post({ categoryId: inactive.id })],
    categories: [inactive],
    redirects: [],
    codeLinks: [],
  });
  assert.equal(scan.findings.some((f) => f.context === "CategoryArchivePostCard"), false);
  // Blog index still links the published post.
  assert.ok(scan.findings.some((f) => f.context === "BlogIndexPostCard"));
});

test("existing redirect/broken/http classifications remain unchanged", () => {
  const targets = new Map(
    Object.entries({
      "/blogs/": { path: "/blogs/", indexable: true, kind: "fixed" as const, label: "Blog" },
      "/welcome/": { path: "/welcome/", indexable: true, kind: "fixed" as const, label: "Welcome" },
    }),
  );
  assert.ok(
    classifyInternalLink({
      storedHref: "/blog/",
      sourcePath: "/welcome/",
      targets,
      redirects: [],
    }).issues.includes("LEGACY_BLOG"),
  );
  assert.ok(
    classifyInternalLink({
      storedHref: "http://theflixiptv.com/welcome/",
      sourcePath: "/blogs/",
      targets,
      redirects: [],
    }).issues.includes("HTTP"),
  );
  assert.ok(
    classifyInternalLink({
      storedHref: "/definitely-missing/",
      sourcePath: "/blogs/",
      targets,
      redirects: [],
    }).issues.includes("BROKEN"),
  );
});

test("helper and scanner avoid hard-coded production post slugs and SEO Health has no post-specific suppression", () => {
  for (const forbidden of [
    "best-iptv-apps-for-smart-tvs",
    "how-to-watch-iptv-on-firestick",
    "hd-vs-4k-streaming",
    "getting-started-with-the-flixiptv",
  ]) {
    assert.equal(helperSource.includes(forbidden), false, `helper hard-codes ${forbidden}`);
    assert.equal(scannerSource.includes(forbidden), false, `scanner hard-codes ${forbidden}`);
  }
  assert.doesNotMatch(seoHealthSource, /best-iptv-apps-for-smart-tvs|how-to-watch-iptv-on-firestick/);
  assert.match(scannerSource, /blogIndexPostCardLinks/);
  assert.match(scannerSource, /categoryArchivePostCardLinks/);
});

test("SEO Health receives corrected orphans without special-case filtering for archive cards", () => {
  const alpha = category();
  const published = post({ categoryId: alpha.id });
  const report = buildSeoHealthReport({
    settings: defaultSettings(),
    pages: [],
    posts: [published],
    categories: [alpha],
    redirects: [],
    media: [],
  });

  const orphanFindings = report.findings.filter((f) => f.issueCode === "NO_DISCOVERED_INTERNAL_LINKS");
  assert.equal(
    orphanFindings.some((f) => f.publicUrl === "/blogs/first-published-guide/"),
    false,
  );
  assert.doesNotMatch(seoHealthSource, /BlogIndexPostCard|CategoryArchivePostCard|archive.?card/i);
});

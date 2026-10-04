import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import {
  editorialDescriptionHint,
  editorialTitleHint,
  normalizeMetadataText,
  parseCanonicalTarget,
  scanMetadataDiagnostics,
} from "../lib/cms/metadata-diagnostics";
import { defaultSettings } from "../lib/cms/defaults";
import { SIDHU_SEO_DESCRIPTION_GUIDE, SIDHU_SEO_TITLE_GUIDE } from "../lib/cms/sidhu-seo-preview";
import type { BlogCategory, BlogPost, PageSeo, RedirectRule, SiteSettings } from "../lib/cms/types";

function samplePost(overrides: Partial<BlogPost> = {}): BlogPost {
  return {
    id: "post-1",
    title: "Firestick Guide",
    slug: "how-to-watch-iptv-on-firestick",
    excerpt: "Setup guide excerpt that is long enough for editorial range checks.",
    content: "<p>Body</p>",
    categoryId: null,
    featuredImage: null,
    status: "published",
    featured: false,
    publishedAt: "2024-01-01T00:00:00.000Z",
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
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

function sampleCategory(overrides: Partial<BlogCategory> = {}): BlogCategory {
  return {
    id: "cat-1",
    name: "Guides",
    slug: "guides",
    description: "Category description that is reasonably long for diagnostics.",
    active: true,
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
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

function pageSeo(overrides: Partial<PageSeo> = {}): PageSeo {
  return {
    title: "",
    description: "",
    focusKeyword: "",
    canonicalUrl: "",
    robotsIndex: true,
    robotsFollow: true,
    ogTitle: "",
    ogDescription: "",
    ogImage: null,
    sitemapInclude: true,
    customJsonLd: "",
    ...overrides,
  };
}

function settingsWith(pageOverrides: Partial<Record<string, Partial<PageSeo>>> = {}): SiteSettings {
  const settings = defaultSettings();
  for (const [key, value] of Object.entries(pageOverrides)) {
    const current = settings.pageSeo[key as keyof typeof settings.pageSeo];
    if (current) settings.pageSeo[key as keyof typeof settings.pageSeo] = { ...current, ...value };
  }
  return settings;
}

test("normalizeMetadataText trims and collapses whitespace case-insensitively", () => {
  assert.equal(normalizeMetadataText("  Hello   World  "), "hello world");
});

test("two indexable pages with same effective title form a duplicate group", () => {
  const settings = settingsWith({
    home: pageSeo({ title: "Shared Title | Flix IPTV", description: "Home description that is long enough here." }),
    contact: pageSeo({ title: "Shared Title | Flix IPTV", description: "Contact description that is long enough here." }),
  });
  const report = scanMetadataDiagnostics({
    settings,
    pages: [],
    posts: [],
    categories: [],
    redirects: [],
  });
  assert.ok(report.duplicateTitles.some((g) => normalizeMetadataText(g.value) === "shared title | flix iptv"));
  assert.equal(report.summary.duplicateTitleGroups >= 1, true);
});

test("two noindex pages with same title are excluded from primary duplicate count", () => {
  const settings = settingsWith({
    home: pageSeo({
      title: "Hidden Same",
      description: "Desc A that is long enough for the editorial description range.",
      robotsIndex: false,
    }),
    contact: pageSeo({
      title: "Hidden Same",
      description: "Desc B that is long enough for the editorial description range.",
      robotsIndex: false,
    }),
  });
  const report = scanMetadataDiagnostics({
    settings,
    pages: [],
    posts: [],
    categories: [],
    redirects: [],
  });
  assert.equal(
    report.duplicateTitles.some((g) => normalizeMetadataText(g.value) === "hidden same"),
    false,
  );
  assert.ok(report.noindexDuplicateTitles.some((g) => normalizeMetadataText(g.value) === "hidden same"));
});

test("same description duplicate among indexable URLs", () => {
  const shared =
    "This is a shared meta description used by multiple indexable pages for the diagnostic test.";
  const settings = settingsWith({
    about: pageSeo({ title: "About Unique", description: shared }),
    privacy: pageSeo({ title: "Privacy Unique", description: shared }),
  });
  const report = scanMetadataDiagnostics({
    settings,
    pages: [],
    posts: [],
    categories: [],
    redirects: [],
  });
  assert.ok(report.duplicateDescriptions.some((g) => g.value === shared));
});

test("self-canonical blank override is valid apex path", () => {
  const parsed = parseCanonicalTarget("", "/welcome/");
  assert.equal(parsed.path, "/welcome/");
  assert.equal(parsed.absolute, "https://theflixiptv.com/welcome/");
  assert.equal(parsed.malformed, false);
});

test("two pages sharing canonical collide", () => {
  const settings = settingsWith({
    about: pageSeo({
      title: "About",
      description: "About description long enough for diagnostics checks.",
      canonicalUrl: "https://theflixiptv.com/welcome/",
    }),
    home: pageSeo({
      title: "Home Unique",
      description: "Home description long enough for diagnostics checks.",
      canonicalUrl: "",
    }),
  });
  const report = scanMetadataDiagnostics({
    settings,
    pages: [],
    posts: [],
    categories: [],
    redirects: [],
  });
  assert.ok(report.summary.canonicalCollisions >= 1);
  const about = report.entities.find((e) => e.id === "page-about");
  assert.ok(about?.issues.includes("CANONICAL_COLLISION"));
  assert.ok(about?.issues.includes("CANONICAL_TO_OTHER"));
});

test("canonical to redirect source is CANONICAL_TO_REDIRECT", () => {
  const settings = settingsWith({
    contact: pageSeo({
      title: "Contact",
      description: "Contact description long enough for diagnostics checks.",
      canonicalUrl: "/iptv-subscriptions-uk/",
    }),
  });
  const report = scanMetadataDiagnostics({
    settings,
    pages: [
      {
        id: "page-subscriptions",
        name: "Subscriptions",
        slug: "/iptv-subscription-uk/",
        status: "published",
        cmsEnabled: true,
        sections: [],
      },
    ],
    posts: [],
    categories: [],
    redirects: [],
  });
  const contact = report.entities.find((e) => e.id === "page-contact");
  assert.ok(contact?.issues.includes("CANONICAL_TO_REDIRECT"));
});

test("canonical to missing target", () => {
  const settings = settingsWith({
    contact: pageSeo({
      title: "Contact",
      description: "Contact description long enough for diagnostics checks.",
      canonicalUrl: "/does-not-exist-anywhere/",
    }),
  });
  const report = scanMetadataDiagnostics({
    settings,
    pages: [],
    posts: [],
    categories: [],
    redirects: [],
  });
  const contact = report.entities.find((e) => e.id === "page-contact");
  assert.ok(contact?.issues.includes("CANONICAL_MISSING_TARGET"));
});

test("canonical using HTTP", () => {
  const settings = settingsWith({
    contact: pageSeo({
      title: "Contact",
      description: "Contact description long enough for diagnostics checks.",
      canonicalUrl: "http://theflixiptv.com/contact/",
    }),
  });
  const report = scanMetadataDiagnostics({
    settings,
    pages: [],
    posts: [],
    categories: [],
    redirects: [],
  });
  const contact = report.entities.find((e) => e.id === "page-contact");
  assert.ok(contact?.issues.includes("CANONICAL_HTTP"));
});

test("canonical using WWW", () => {
  const settings = settingsWith({
    contact: pageSeo({
      title: "Contact",
      description: "Contact description long enough for diagnostics checks.",
      canonicalUrl: "https://www.theflixiptv.com/contact/",
    }),
  });
  const report = scanMetadataDiagnostics({
    settings,
    pages: [],
    posts: [],
    categories: [],
    redirects: [],
  });
  const contact = report.entities.find((e) => e.id === "page-contact");
  assert.ok(contact?.issues.includes("CANONICAL_WWW"));
});

test("malformed canonical", () => {
  const settings = settingsWith({
    contact: pageSeo({
      title: "Contact",
      description: "Contact description long enough for diagnostics checks.",
      canonicalUrl: "not a url at all",
    }),
  });
  const report = scanMetadataDiagnostics({
    settings,
    pages: [],
    posts: [],
    categories: [],
    redirects: [],
  });
  const contact = report.entities.find((e) => e.id === "page-contact");
  assert.ok(contact?.issues.includes("CANONICAL_MALFORMED"));
});

test("blank custom title uses valid public fallback", () => {
  const post = samplePost({ seoTitle: "", title: "Fallback Title From Post" });
  const report = scanMetadataDiagnostics({
    settings: defaultSettings(),
    pages: [],
    posts: [post],
    categories: [],
    redirects: [],
  });
  const entity = report.entities.find((e) => e.id === `post-${post.id}`);
  assert.equal(entity?.effectiveTitle, "Fallback Title From Post");
  assert.ok(entity?.effectiveTitle);
});

test("blank description uses valid fallback", () => {
  const post = samplePost({
    seoDescription: "",
    excerpt: "Excerpt fallback description that is long enough for checks.",
  });
  const report = scanMetadataDiagnostics({
    settings: defaultSettings(),
    pages: [],
    posts: [post],
    categories: [],
    redirects: [],
  });
  const entity = report.entities.find((e) => e.id === `post-${post.id}`);
  assert.match(entity?.effectiveDescription || "", /Excerpt fallback/);
});

test("noindex + sitemap enabled is advisory", () => {
  const post = samplePost({ robotsIndex: false, sitemapInclude: true });
  const report = scanMetadataDiagnostics({
    settings: defaultSettings(),
    pages: [],
    posts: [post],
    categories: [],
    redirects: [],
  });
  const entity = report.entities.find((e) => e.id === `post-${post.id}`);
  assert.ok(entity?.issues.includes("NOINDEX_SITEMAP_INCLUDED"));
});

test("canonical target noindex", () => {
  const settings = settingsWith({
    about: pageSeo({
      title: "About",
      description: "About description long enough for diagnostics checks.",
      canonicalUrl: "/contact/",
    }),
    contact: pageSeo({
      title: "Contact",
      description: "Contact description long enough for diagnostics checks.",
      robotsIndex: false,
    }),
  });
  const report = scanMetadataDiagnostics({
    settings,
    pages: [],
    posts: [],
    categories: [],
    redirects: [],
  });
  const about = report.entities.find((e) => e.id === "page-about");
  assert.ok(about?.issues.includes("CANONICAL_TARGET_NOINDEX"));
});

test("editorial title and description length warnings", () => {
  assert.equal(editorialTitleHint(10), "SHORT");
  assert.equal(editorialTitleHint(SIDHU_SEO_TITLE_GUIDE + 5), "LONG");
  assert.equal(editorialTitleHint(50), "WITHIN_EDITORIAL_RANGE");
  assert.equal(editorialDescriptionHint(20), "SHORT");
  assert.equal(editorialDescriptionHint(SIDHU_SEO_DESCRIPTION_GUIDE + 5), "LONG");

  const settings = settingsWith({
    contact: pageSeo({
      title: "Hi",
      description: "Short",
    }),
  });
  const report = scanMetadataDiagnostics({
    settings,
    pages: [],
    posts: [],
    categories: [],
    redirects: [],
  });
  const contact = report.entities.find((e) => e.id === "page-contact");
  assert.ok(contact?.issues.includes("TITLE_SHORT"));
  assert.ok(contact?.issues.includes("DESCRIPTION_SHORT"));
});

test("edit-source mapping for page post category", () => {
  const post = samplePost();
  const category = sampleCategory();
  const report = scanMetadataDiagnostics({
    settings: defaultSettings(),
    pages: [],
    posts: [post],
    categories: [category],
    redirects: [],
  });
  assert.equal(report.entities.find((e) => e.id === "page-home")?.editHref, "/sidhu/pages/home/");
  assert.equal(report.entities.find((e) => e.id === `post-${post.id}`)?.editHref, `/sidhu/blog/${post.id}/`);
  assert.equal(
    report.entities.find((e) => e.id === `category-${category.id}`)?.editHref,
    `/sidhu/blog/category/${category.id}/`,
  );
});

test("draft posts and inactive categories excluded; CMS redirect collision path", () => {
  const redirects: RedirectRule[] = [
    {
      id: "r1",
      sourcePath: "/old/",
      destinationPath: "/welcome/",
      statusCode: 301,
      active: true,
      createdAt: "",
      updatedAt: "",
    },
  ];
  const report = scanMetadataDiagnostics({
    settings: defaultSettings(),
    pages: [],
    posts: [samplePost({ status: "draft", slug: "draft-post", title: "Draft" })],
    categories: [sampleCategory({ active: false, slug: "dead" })],
    redirects,
  });
  assert.equal(report.entities.some((e) => e.publicPath.includes("draft-post")), false);
  assert.equal(report.entities.some((e) => e.publicPath.includes("/category/dead/")), false);
});

test("Sidhu metadata diagnostics route wired; no auto-fix", () => {
  const root = process.cwd();
  const page = readFileSync(path.join(root, "app/sidhu/(protected)/seo/metadata-diagnostics/page.tsx"), "utf8");
  const seoNav = readFileSync(path.join(root, "lib/cms/sidhu-seo-nav.ts"), "utf8");
  const report = readFileSync(path.join(root, "components/sidhu/MetadataDiagnosticsReport.tsx"), "utf8");
  assert.match(page, /scanMetadataDiagnostics/);
  assert.match(seoNav, /\/sidhu\/seo\/metadata-diagnostics\//);
  assert.doesNotMatch(report, /Fix now|Rewrite|Generate SEO|Apply canonical|auto-fix/i);
  assert.match(report, /Edit source/);
});

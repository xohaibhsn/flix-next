import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import {
  buildSitemapEntries,
  sitemapPathForPage,
  sitemapUrls,
  SITEMAP_REVALIDATE_SECONDS,
} from "../lib/cms/sitemap-build";
import { defaultSettings } from "../lib/cms/defaults";

function settingsWith(overrides?: {
  excludeHome?: boolean;
  excludeAbout?: boolean;
}) {
  const settings = defaultSettings();
  if (overrides?.excludeHome) settings.pageSeo.home.sitemapInclude = false;
  if (overrides?.excludeAbout) settings.pageSeo.about.sitemapInclude = false;
  return settings;
}

const samplePages = [
  { id: "page-home", slug: "/", status: "published" as const },
  { id: "page-subscriptions", slug: "/iptv-subscription-uk/", status: "published" as const },
  { id: "page-contact", slug: "/contact/", status: "published" as const },
  { id: "page-about", slug: "/about-us/", status: "published" as const },
  { id: "page-terms", slug: "/terms-and-conditions/", status: "published" as const },
  { id: "page-refund", slug: "/refund-policy/", status: "published" as const },
  { id: "page-privacy", slug: "/privacy-policy/", status: "published" as const },
  { id: "page-cookie", slug: "/cookie-policy/", status: "published" as const },
  { id: "page-copyright", slug: "/copyright-policy/", status: "published" as const },
  { id: "page-draft", slug: "/secret-draft/", status: "draft" as const },
];

const samplePosts = [
  {
    slug: "how-to-watch-iptv-on-firestick",
    status: "published" as const,
    sitemapInclude: true,
    updatedAt: "2026-01-10T12:00:00.000Z",
  },
  {
    slug: "draft-only",
    status: "draft" as const,
    sitemapInclude: true,
    updatedAt: "2026-01-11T12:00:00.000Z",
  },
  {
    slug: "excluded-post",
    status: "published" as const,
    sitemapInclude: false,
    updatedAt: "2026-01-12T12:00:00.000Z",
  },
];

const sampleCategories = [
  { slug: "guides", active: true, updatedAt: "2026-02-01T00:00:00.000Z" },
  { slug: "setup", active: true, updatedAt: "2026-02-02T00:00:00.000Z" },
  { slug: "inactive", active: false, updatedAt: "2026-02-03T00:00:00.000Z" },
];

test("sitemap URL set excludes drafts, inactive categories, and redirect sources", () => {
  const entries = buildSitemapEntries({
    origin: "https://theflixiptv.com",
    settings: settingsWith(),
    pages: samplePages,
    posts: samplePosts,
    categories: sampleCategories,
  });
  const urls = sitemapUrls(entries);
  assert.deepEqual(urls, [
    "https://theflixiptv.com/about-us/",
    "https://theflixiptv.com/blogs/",
    "https://theflixiptv.com/blogs/how-to-watch-iptv-on-firestick/",
    "https://theflixiptv.com/category/guides/",
    "https://theflixiptv.com/category/setup/",
    "https://theflixiptv.com/contact/",
    "https://theflixiptv.com/cookie-policy/",
    "https://theflixiptv.com/copyright-policy/",
    "https://theflixiptv.com/iptv-subscription-uk/",
    "https://theflixiptv.com/privacy-policy/",
    "https://theflixiptv.com/refund-policy/",
    "https://theflixiptv.com/terms-and-conditions/",
    "https://theflixiptv.com/welcome/",
  ]);
  assert.equal(urls.some((url) => url.includes("/secret-draft")), false);
  assert.equal(urls.some((url) => url.includes("/draft-only")), false);
  assert.equal(urls.some((url) => url.includes("/excluded-post")), false);
  assert.equal(urls.some((url) => url.includes("/category/inactive")), false);
  assert.equal(urls.some((url) => url.includes("/iptv-subscriptions")), false);
  assert.equal(urls.some((url) => url.includes("/blog/")), false);
  assert.equal(urls.some((url) => url.includes("/sidhu")), false);
  assert.equal(urls.some((url) => url.includes("/api/")), false);
});

test("pageSeo sitemapInclude exclusions are honored", () => {
  const entries = buildSitemapEntries({
    origin: "https://theflixiptv.com",
    settings: settingsWith({ excludeAbout: true }),
    pages: samplePages,
    posts: [],
    categories: [],
  });
  const urls = sitemapUrls(entries);
  assert.equal(urls.includes("https://theflixiptv.com/about-us/"), false);
  assert.equal(urls.includes("https://theflixiptv.com/welcome/"), true);
});

test("page lastModified is omitted; posts/categories use stored timestamps", () => {
  const entries = buildSitemapEntries({
    origin: "https://theflixiptv.com",
    settings: settingsWith(),
    pages: samplePages,
    posts: samplePosts,
    categories: sampleCategories,
  });
  const welcome = entries.find((entry) => entry.url.endsWith("/welcome/"));
  const contact = entries.find((entry) => entry.url.endsWith("/contact/"));
  const post = entries.find((entry) => entry.url.includes("/blogs/how-to-watch"));
  const category = entries.find((entry) => entry.url.includes("/category/guides"));
  assert.equal(welcome?.lastModified, undefined);
  assert.equal(contact?.lastModified, undefined);
  assert.ok(post?.lastModified instanceof Date);
  assert.equal((post?.lastModified as Date).toISOString(), "2026-01-10T12:00:00.000Z");
  assert.ok(category?.lastModified instanceof Date);
  assert.equal((category?.lastModified as Date).toISOString(), "2026-02-01T00:00:00.000Z");
});

test("home page maps to /welcome/ and does not invent request-time lastModified", () => {
  assert.equal(sitemapPathForPage("page-home", "/"), "/welcome/");
  const before = Date.now();
  const entries = buildSitemapEntries({
    origin: "https://example.com",
    settings: settingsWith(),
    pages: [{ id: "page-home", slug: "/", status: "published" }],
    posts: [],
    categories: [],
  });
  const after = Date.now();
  for (const entry of entries) {
    if (entry.lastModified) {
      const ms = new Date(entry.lastModified).getTime();
      assert.equal(ms >= before && ms <= after, false, "must not use request-time new Date()");
    }
  }
});

test("sitemap source SQL avoids page_sections and post content", () => {
  const source = readFileSync(path.join(process.cwd(), "lib/cms/sitemap-source.ts"), "utf8");
  assert.match(source, /SELECT id, slug, status FROM pages/);
  assert.match(source, /SELECT slug, status, sitemap_include, updated_at FROM blog_posts/);
  assert.match(source, /SELECT slug, is_active, updated_at FROM blog_categories/);
  assert.equal(/FROM page_sections/.test(source), false);
  assert.equal(/section_data/.test(source), false);
  assert.equal(/SELECT \* FROM blog_posts/.test(source), false);
  assert.match(source, /loadedPageSections:\s*false/);
});

test("sitemap route uses revalidate and does not force connection()", () => {
  const file = readFileSync(path.join(process.cwd(), "app/sitemap.ts"), "utf8");
  assert.match(file, /export const revalidate\s*=\s*3600/);
  assert.equal(file.includes("connection("), false);
  assert.equal(SITEMAP_REVALIDATE_SECONDS, 3600);
  assert.equal(SITEMAP_REVALIDATE_SECONDS < 86400 * 2, true);
});

test("category saves revalidate sitemap", () => {
  const file = readFileSync(path.join(process.cwd(), "lib/cms/revalidate.ts"), "utf8");
  const block = file.slice(file.indexOf("export function revalidateCategory"));
  assert.match(block, /revalidatePath\("\/sitemap\.xml"\)/);
});

test("production-like URL membership matches known public set shape", () => {
  const entries = buildSitemapEntries({
    origin: "https://theflixiptv.com",
    settings: settingsWith(),
    pages: samplePages,
    posts: [
      ...samplePosts.filter((post) => post.status === "published" && post.sitemapInclude),
      {
        slug: "best-iptv-apps-for-smart-tvs",
        status: "published",
        sitemapInclude: true,
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
      {
        slug: "getting-started-with-the-flixiptv",
        status: "published",
        sitemapInclude: true,
        updatedAt: "2026-01-02T00:00:00.000Z",
      },
      {
        slug: "hd-vs-4k-streaming",
        status: "published",
        sitemapInclude: true,
        updatedAt: "2026-01-03T00:00:00.000Z",
      },
    ],
    categories: [
      { slug: "devices", active: true, updatedAt: "2026-02-01T00:00:00.000Z" },
      { slug: "guides", active: true, updatedAt: "2026-02-01T00:00:00.000Z" },
      { slug: "quality", active: true, updatedAt: "2026-02-01T00:00:00.000Z" },
      { slug: "setup", active: true, updatedAt: "2026-02-01T00:00:00.000Z" },
    ],
  });
  assert.equal(sitemapUrls(entries).length, 18);
});

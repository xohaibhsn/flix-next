import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BlogCategoryNav } from "../components/blog/BlogCategoryNav";
import { blogIndexCategoryNavLinks } from "../lib/cms/blog-category-nav";
import { blogsPathFromLegacyBlogPath, isLegacyBlogPostPath } from "../lib/cms/blog-paths";
import { defaultSettings } from "../lib/cms/defaults";
import { builtInRedirectDestination, scanInternalLinks } from "../lib/cms/internal-links";
import { buildSitemapEntries, sitemapUrls } from "../lib/cms/sitemap-build";
import type { BlogCategory } from "../lib/cms/types";

// next.config.ts sets trailingSlash: true; next build injects this flag, so mirror it outside Next.
process.env.__NEXT_TRAILING_SLASH = "true";

const root = process.cwd();
const blogIndexSource = readFileSync(path.join(root, "app/blogs/page.tsx"), "utf8");
const navSource = readFileSync(path.join(root, "components/blog/BlogCategoryNav.tsx"), "utf8");

function category(overrides: Partial<BlogCategory> = {}): BlogCategory {
  return {
    id: "cat-streaming-tips",
    name: "Streaming Tips",
    slug: "streaming-tips",
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

function renderNav(categories: BlogCategory[]) {
  return renderToStaticMarkup(createElement(BlogCategoryNav, { links: blogIndexCategoryNavLinks(categories) }));
}

test("active categories render as crawlable <a href> links to /category/[slug]/", () => {
  const html = renderNav([category()]);
  assert.match(html, /<nav aria-label="Blog categories"/);
  assert.match(html, /<a [^>]*href="\/category\/streaming-tips\/"[^>]*>Streaming Tips<\/a>/);
  assert.doesNotMatch(html, /onClick|javascript:/i);
});

test("inactive categories do not render", () => {
  const links = blogIndexCategoryNavLinks([
    category(),
    category({ id: "cat-old", name: "Retired Topic", slug: "retired-topic", active: false }),
  ]);
  assert.deepEqual(
    links.map((link) => link.href),
    ["/category/streaming-tips/"],
  );
  assert.doesNotMatch(renderNav([category({ active: false })]), /retired|streaming-tips/i);
});

test("names and slugs come from the CMS model; a renamed category uses its new name", () => {
  const renamed = category({ name: "Picture Quality Explained", slug: "quality" });
  const links = blogIndexCategoryNavLinks([renamed]);
  assert.deepEqual(links, [{ id: renamed.id, label: "Picture Quality Explained", href: "/category/quality/" }]);
  for (const hardcoded of ["Devices", "Guides", "Quality", "Setup", "/category/"]) {
    assert.equal(navSource.includes(hardcoded), false, `component must not hard-code ${hardcoded}`);
  }
  assert.equal(blogIndexSource.includes("/category/"), false);
});

test("multiple categories render in repository order, and new active categories appear automatically", () => {
  const categories = [
    category({ id: "c1", name: "Alpha", slug: "alpha" }),
    category({ id: "c2", name: "Bravo", slug: "bravo", active: false }),
    category({ id: "c3", name: "Charlie", slug: "charlie" }),
    category({ id: "c4", name: "Brand New Topic", slug: "brand-new-topic" }),
  ];
  const links = blogIndexCategoryNavLinks(categories);
  assert.deepEqual(
    links.map((link) => link.label),
    ["Alpha", "Charlie", "Brand New Topic"],
  );
  const html = renderNav(categories);
  assert.equal((html.match(/<a /g) || []).length, 3);
  assert.ok(html.indexOf("/category/alpha/") < html.indexOf("/category/charlie/"));
});

test("no active categories renders nothing instead of breaking /blogs/", () => {
  assert.deepEqual(blogIndexCategoryNavLinks([]), []);
  assert.equal(renderNav([]), "");
  assert.equal(renderNav([category({ active: false })]), "");
  assert.deepEqual(blogIndexCategoryNavLinks([category({ slug: "  " }), category({ name: "" })]), []);
});

test("/blogs/ reuses its existing single category read and keeps the post listing", () => {
  assert.equal((blogIndexSource.match(/cms\.listCategories\(\)/g) || []).length, 1);
  assert.match(blogIndexSource, /<BlogCategoryNav links=\{blogIndexCategoryNavLinks\(categories\)\} \/>/);
  assert.match(blogIndexSource, /published\.map\(\(post\) => \(\s*<PostCard/);
  assert.match(blogIndexSource, /No published posts yet\./);
  assert.doesNotMatch(navSource, /"use client"/);
});

test("/blogs/ metadata wiring is unchanged", () => {
  assert.match(
    blogIndexSource,
    /pageSeoMetadata\("blog", "Blog", "Guides and updates from Flix IPTV\.", BLOG_INDEX_SLUG\)/,
  );
});

test("legacy /blog/ redirects remain unchanged", () => {
  assert.equal(builtInRedirectDestination("/blog/"), "/blogs/");
  assert.equal(isLegacyBlogPostPath("/blog/how-to-watch-iptv-on-firestick/"), true);
  assert.equal(
    blogsPathFromLegacyBlogPath("/blog/how-to-watch-iptv-on-firestick/"),
    "/blogs/how-to-watch-iptv-on-firestick/",
  );
});

test("sitemap category entries are unchanged by the navigation block", () => {
  const urls = sitemapUrls(
    buildSitemapEntries({
      origin: "https://theflixiptv.com",
      settings: defaultSettings(),
      pages: [],
      posts: [],
      categories: [
        { slug: "guides", active: true, updatedAt: "2026-02-01T00:00:00.000Z", sitemapInclude: null },
        { slug: "inactive", active: false, updatedAt: "2026-02-03T00:00:00.000Z", sitemapInclude: null },
      ],
    }),
  ).filter((url) => url.includes("/category/"));
  assert.deepEqual(urls, ["https://theflixiptv.com/category/guides/"]);
});

test("internal-link scan records the generated /blogs/ category links and clears their orphan notes", () => {
  const active = category({ id: "cat-devices", name: "Devices From CMS", slug: "devices" });
  const inactive = category({ id: "cat-hidden", name: "Hidden", slug: "hidden", active: false });
  const scan = scanInternalLinks({
    settings: defaultSettings(),
    pages: [],
    posts: [],
    categories: [active, inactive],
    redirects: [],
    codeLinks: [],
  });
  const navFindings = scan.findings.filter((finding) => finding.context === "BlogCategoryNav");
  assert.equal(navFindings.length, 1);
  assert.equal(navFindings[0].sourceUrl, "/blogs/");
  assert.equal(navFindings[0].storedHref, "/category/devices/");
  assert.equal(navFindings[0].anchorText, "Devices From CMS");
  assert.equal(navFindings[0].editHref, "/sidhu/blog/category/cat-devices/");
  assert.deepEqual(navFindings[0].issues, ["VALID"]);
  assert.equal(scan.orphans.some((orphan) => orphan.path === "/category/devices/"), false);
  assert.equal(scan.findings.some((finding) => finding.storedHref === "/category/hidden/"), false);
});

test("internal-link scan with no active categories adds no generated links", () => {
  const scan = scanInternalLinks({
    settings: defaultSettings(),
    pages: [],
    posts: [],
    categories: [category({ active: false })],
    redirects: [],
    codeLinks: [],
  });
  assert.equal(scan.findings.some((finding) => finding.context === "BlogCategoryNav"), false);
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import {
  categoryEffectiveDescription,
  categoryEffectiveRobotsFollow,
  categoryEffectiveRobotsIndex,
  categoryEffectiveSitemapInclude,
  categoryEffectiveTitle,
  categoryPublicPath,
  categorySeoAsPageSeo,
  emptyCategorySeoFields,
  readTriStateFlag,
} from "../lib/cms/category-seo";
import { buildSitemapEntries, sitemapUrls } from "../lib/cms/sitemap-build";
import { defaultBlogCategories, defaultSettings } from "../lib/cms/defaults";
import { sanitizeCategory } from "../lib/cms/validation";
import { CURRENT_CMS_SCHEMA_VERSION } from "../lib/db/schema";
import { sidhuPreviewFromCategory, sidhuSeoOverviewRows } from "../lib/cms/sidhu-seo-preview";

function baseCategory(overrides: Partial<ReturnType<typeof sanitizeCategory>> = {}) {
  return sanitizeCategory({
    id: "cat-guides",
    name: "Guides",
    slug: "guides",
    description: "Getting started with The Flix.",
    active: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...emptyCategorySeoFields(),
    ...overrides,
  });
}

test("existing category with no SEO data preserves live defaults", () => {
  const category = baseCategory();
  assert.equal(category.seoTitle, "");
  assert.equal(category.robotsIndex, null);
  assert.equal(category.sitemapInclude, null);
  assert.equal(categoryEffectiveTitle(category), "Guides");
  assert.equal(categoryEffectiveDescription(category), "Getting started with The Flix.");
  assert.equal(categoryPublicPath(category.slug), "/category/guides/");
  assert.equal(categoryEffectiveRobotsIndex(category), true);
  assert.equal(categoryEffectiveRobotsFollow(category), true);
  assert.equal(categoryEffectiveSitemapInclude(category), true);
  const seo = categorySeoAsPageSeo(category);
  assert.equal(seo.title, "");
  assert.equal(seo.canonicalUrl, "");
  assert.equal(seo.robotsIndex, true);
  assert.equal(seo.sitemapInclude, true);
});

test("new category with no SEO data uses empty/null defaults", () => {
  const category = sanitizeCategory({
    id: "cat-new",
    name: "New",
    slug: "new",
    description: "",
    active: true,
    createdAt: "",
    updatedAt: "",
    ...emptyCategorySeoFields(),
  });
  assert.equal(category.robotsIndex, null);
  assert.equal(category.sitemapInclude, null);
  assert.equal(categoryEffectiveSitemapInclude(category), true);
});

test("custom SEO overrides do not change H1/name/description content fields", () => {
  const category = baseCategory({
    seoTitle: "Best IPTV Guides UK",
    seoDescription: "Custom meta for archives.",
    canonicalUrl: "https://theflixiptv.com/category/guides/",
    robotsIndex: false,
    robotsFollow: false,
    sitemapInclude: false,
    ogTitle: "OG Guides",
    ogDescription: "OG desc",
  });
  assert.equal(category.name, "Guides");
  assert.equal(category.description, "Getting started with The Flix.");
  assert.equal(categoryEffectiveTitle(category), "Best IPTV Guides UK");
  assert.equal(categoryEffectiveDescription(category), "Custom meta for archives.");
  assert.equal(categoryEffectiveRobotsIndex(category), false);
  assert.equal(categoryEffectiveRobotsFollow(category), false);
  assert.equal(categoryEffectiveSitemapInclude(category), false);
});

test("partial SEO record falls back for empty fields only", () => {
  const category = baseCategory({ seoTitle: "Only title set" });
  assert.equal(categoryEffectiveTitle(category), "Only title set");
  assert.equal(categoryEffectiveDescription(category), "Getting started with The Flix.");
  assert.equal(categoryEffectiveSitemapInclude(category), true);
});

test("inactive category is excluded from sitemap regardless of SEO", () => {
  const category = baseCategory({ active: false, sitemapInclude: true });
  assert.equal(categoryEffectiveSitemapInclude(category), false);
  assert.equal(categoryEffectiveRobotsIndex(category), false);
});

test("explicit sitemap exclusion removes only that category", () => {
  const settings = defaultSettings();
  const entries = buildSitemapEntries({
    origin: "https://theflixiptv.com",
    settings,
    pages: [],
    posts: [],
    categories: [
      { slug: "guides", active: true, updatedAt: "2026-01-01T00:00:00.000Z", sitemapInclude: null },
      { slug: "setup", active: true, updatedAt: "2026-01-01T00:00:00.000Z", sitemapInclude: false },
    ],
  });
  const urls = sitemapUrls(entries);
  assert.ok(urls.includes("https://theflixiptv.com/category/guides/"));
  assert.equal(urls.includes("https://theflixiptv.com/category/setup/"), false);
});

test("default sitemap inclusion keeps untouched active categories", () => {
  const settings = defaultSettings();
  const entries = buildSitemapEntries({
    origin: "https://theflixiptv.com",
    settings,
    pages: [],
    posts: [],
    categories: defaultBlogCategories().map((category) => ({
      slug: category.slug,
      active: category.active,
      updatedAt: category.updatedAt,
      sitemapInclude: category.sitemapInclude,
    })),
  });
  assert.equal(
    sitemapUrls(entries).filter((url) => url.includes("/category/")).length,
    4,
  );
});

test("tri-state flag parsing distinguishes unset/enabled/disabled", () => {
  assert.equal(readTriStateFlag(null), null);
  assert.equal(readTriStateFlag(undefined), null);
  assert.equal(readTriStateFlag(1), true);
  assert.equal(readTriStateFlag(0), false);
  assert.equal(readTriStateFlag("1"), true);
  assert.equal(readTriStateFlag("0"), false);
});

test("category preview and overview reflect overrides", () => {
  const category = baseCategory({
    seoTitle: "Custom",
    seoDescription: "Custom desc",
    robotsIndex: false,
    sitemapInclude: false,
    ogImage: { id: "og1", publicId: "x", secureUrl: "https://res.cloudinary.com/demo/image/upload/x.png" },
  });
  const preview = sidhuPreviewFromCategory(category, { siteName: "Flix IPTV" });
  assert.equal(preview.effectiveTitle, "Custom");
  assert.equal(preview.robotsIndex, false);
  assert.equal(preview.sitemapInclude, false);
  assert.ok(preview.warnings.some((item) => item.id === "noindex"));
  assert.ok(preview.warnings.some((item) => item.id === "sitemap-off"));
  const rows = sidhuSeoOverviewRows(defaultSettings(), [], [category]);
  const row = rows.find((item) => item.kind === "Category");
  assert.equal(row?.indexLabel, "Noindex");
  assert.equal(row?.sitemapLabel, "Excluded");
  assert.equal(row?.ogLabel, "Yes");
  assert.equal(row?.editHref, "/sidhu/blog/category/cat-guides/");
});

test("schema version bumped for category SEO columns", () => {
  assert.ok(CURRENT_CMS_SCHEMA_VERSION >= 2);
  const schema = readFileSync(path.join(process.cwd(), "lib/db/schema.ts"), "utf8");
  assert.match(schema, /seo_title VARCHAR\(200\)/);
  assert.match(schema, /sitemap_include TINYINT\(1\) NULL/);
  const migrate = readFileSync(path.join(process.cwd(), "lib/cms/mysql-migrate.ts"), "utf8");
  assert.match(migrate, /blog_categories", column: "seo_title"/);
  assert.match(migrate, /blog_categories", column: "sitemap_include"/);
});

test("sitemap source stays lightweight with only sitemap_include addition", () => {
  const source = readFileSync(path.join(process.cwd(), "lib/cms/sitemap-source.ts"), "utf8");
  assert.match(source, /sitemap_include FROM blog_categories/);
  assert.equal(/FROM page_sections/.test(source), false);
  assert.equal(/section_data/.test(source), false);
  assert.equal(/SELECT \* FROM blog_posts/.test(source), false);
});

test("category editor route and action permissions stay on blog", () => {
  const action = readFileSync(path.join(process.cwd(), "lib/cms/actions.ts"), "utf8");
  assert.match(action, /saveCategoryAction[\s\S]*requireAdminAction\("blog"\)/);
  const perms = readFileSync(path.join(process.cwd(), "lib/auth/permissions.ts"), "utf8");
  assert.match(perms, /startsWith\("\/sidhu\/blog\/"\)/);
  assert.ok(perms.includes('return "blog"'));
  const editor = readFileSync(path.join(process.cwd(), "components/sidhu/CategoryEditor.tsx"), "utf8");
  assert.match(editor, /SeoPreview/);
  assert.match(editor, /SEO title/);
});

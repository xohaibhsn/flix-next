import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import {
  articleModifiedTime,
  articleOpenGraphFields,
  articlePublishedTime,
  articleTimestamp,
} from "../lib/cms/article-seo";
import { blogPostUrl, resolveBlogPostCanonical } from "../lib/cms/blog-paths";
import { blogPostingJsonLd } from "../lib/cms/json-ld";
import { defaultSettings } from "../lib/cms/defaults";
import { defaultPageSeo, seoToMetadata } from "../lib/seo";
import type { BlogPost } from "../lib/cms/types";

function samplePost(overrides: Partial<BlogPost> = {}): BlogPost {
  return {
    id: "post-firestick",
    title: "How to Watch IPTV on Firestick",
    slug: "how-to-watch-iptv-on-firestick",
    excerpt: "Step-by-step Firestick setup.",
    content: "<p>Body</p>",
    categoryId: null,
    featuredImage: null,
    status: "published",
    featured: false,
    publishedAt: "2024-06-15T10:00:00.000Z",
    createdAt: "2024-06-14T09:00:00.000Z",
    updatedAt: "2024-07-01T12:30:00.000Z",
    seoTitle: "How to Watch IPTV on Firestick UK",
    seoDescription: "Install and watch IPTV on Amazon Firestick.",
    focusKeyword: "iptv firestick",
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

test("published post Open Graph uses article type and stored timestamps", () => {
  const post = samplePost();
  const fields = articleOpenGraphFields(post);
  assert.equal(fields.type, "article");
  assert.equal(fields.publishedTime, "2024-06-15T10:00:00.000Z");
  assert.equal(fields.modifiedTime, "2024-07-01T12:30:00.000Z");
});

test("publishedTime prefers publishedAt then createdAt; never invents dates", () => {
  assert.equal(
    articlePublishedTime({ publishedAt: null, createdAt: "2024-01-02T00:00:00.000Z" }),
    "2024-01-02T00:00:00.000Z",
  );
  assert.equal(articlePublishedTime({ publishedAt: null, createdAt: "" }), undefined);
  assert.equal(articlePublishedTime({ publishedAt: "not-a-date", createdAt: "also-bad" }), undefined);
  assert.equal(articleTimestamp(""), undefined);
  assert.equal(articleTimestamp(null), undefined);
});

test("modifiedTime uses only updatedAt when parseable", () => {
  assert.equal(articleModifiedTime({ updatedAt: "2024-08-01T00:00:00.000Z" }), "2024-08-01T00:00:00.000Z");
  assert.equal(articleModifiedTime({ updatedAt: "" }), undefined);
  assert.equal(articleModifiedTime({ updatedAt: "garbage" }), undefined);
});

test("generic page SEO remains website type", () => {
  const settings = defaultSettings();
  const meta = seoToMetadata(
    defaultPageSeo("Blog", "Guides and updates.", "/blogs/"),
    settings,
    "Blog",
    "Guides and updates.",
    "/blogs/",
  );
  assert.equal((meta.openGraph as { type?: string } | undefined)?.type, "website");
  assert.equal(meta.alternates?.canonical, "/blogs/");
  assert.equal(meta.openGraph?.url, "/blogs/");
  assert.equal(meta.title, "Blog");
});

test("normal CMS page SEO remains website type", () => {
  const settings = defaultSettings();
  const meta = seoToMetadata(
    defaultPageSeo("Welcome", "Welcome to Flix.", "/welcome/"),
    settings,
    "Welcome",
    "Welcome to Flix.",
    "/welcome/",
  );
  assert.equal((meta.openGraph as { type?: string } | undefined)?.type, "website");
});

test("post canonical and OG URL path stay on /blogs/[slug]/", () => {
  const post = samplePost();
  const canonical = resolveBlogPostCanonical(post);
  assert.equal(canonical, "/blogs/how-to-watch-iptv-on-firestick/");
  const settings = defaultSettings();
  const meta = seoToMetadata(
    {
      title: post.seoTitle,
      description: post.seoDescription,
      focusKeyword: post.focusKeyword,
      canonicalUrl: canonical,
      robotsIndex: post.robotsIndex,
      robotsFollow: post.robotsFollow,
      ogTitle: post.ogTitle,
      ogDescription: post.ogDescription,
      ogImage: post.ogImage || post.featuredImage,
      sitemapInclude: post.sitemapInclude,
      customJsonLd: "",
    },
    settings,
    post.title,
    post.excerpt,
    canonical,
  );
  assert.equal(meta.alternates?.canonical, canonical);
  assert.equal(meta.openGraph?.url, canonical);
  assert.equal(meta.title, post.seoTitle);
  assert.equal(meta.description, post.seoDescription);
  assert.equal((meta.openGraph as { type?: string } | undefined)?.type, "website");
  const article = { ...meta.openGraph, ...articleOpenGraphFields(post) };
  assert.equal(article.type, "article");
  assert.equal(article.url, canonical);
  assert.equal(article.title, meta.openGraph?.title);
  assert.equal(article.description, meta.openGraph?.description);
});

test("BlogPosting url and mainEntityOfPage match the public post URL", () => {
  const post = samplePost();
  const settings = defaultSettings();
  const data = blogPostingJsonLd(post, settings);
  const expected = blogPostUrl(post.slug);
  assert.equal(data.url, expected);
  assert.equal(data.mainEntityOfPage, expected);
  assert.equal(data["@id"], expected);
  assert.equal(data.headline, post.seoTitle);
  assert.equal(data.datePublished, "2024-06-15T10:00:00.000Z");
  assert.equal(data.dateModified, "2024-07-01T12:30:00.000Z");
  assert.equal(data.author?.["@type"], "Organization");
  assert.equal(data.publisher?.["@type"], "Organization");
  assert.equal(resolveBlogPostCanonical(post), "/blogs/how-to-watch-iptv-on-firestick/");
  assert.ok(String(expected).endsWith(resolveBlogPostCanonical(post)));
});

test("BlogPosting omits invalid dates instead of inventing request time", () => {
  const post = samplePost({
    publishedAt: null,
    createdAt: "",
    updatedAt: "nope",
  });
  const data = blogPostingJsonLd(post, defaultSettings());
  assert.equal("datePublished" in data, false);
  assert.equal("dateModified" in data, false);
});

test("OG image fallback hierarchy is preserved for posts without custom OG image", () => {
  const settings = defaultSettings();
  const post = samplePost({
    ogImage: null,
    featuredImage: {
      id: "media-1",
      publicId: "flix/hero",
      secureUrl: "https://res.cloudinary.com/demo/image/upload/v1/flix/hero.jpg",
    },
  });
  const canonical = resolveBlogPostCanonical(post);
  const meta = seoToMetadata(
    {
      title: post.seoTitle,
      description: post.seoDescription,
      focusKeyword: "",
      canonicalUrl: canonical,
      robotsIndex: true,
      robotsFollow: true,
      ogTitle: "",
      ogDescription: "",
      ogImage: post.ogImage || post.featuredImage,
      sitemapInclude: true,
      customJsonLd: "",
    },
    settings,
    post.title,
    post.excerpt,
    canonical,
  );
  const images = meta.openGraph?.images;
  assert.ok(Array.isArray(images) && images.length > 0);
  const first = images[0] as { url?: string };
  assert.match(String(first.url || first), /flix\/hero/);
});

test("draft/private robots and sitemap flags remain under post control", () => {
  const post = samplePost({ robotsIndex: false, robotsFollow: false, sitemapInclude: false });
  const settings = defaultSettings();
  const canonical = resolveBlogPostCanonical(post);
  const meta = seoToMetadata(
    {
      title: post.seoTitle,
      description: post.seoDescription,
      focusKeyword: "",
      canonicalUrl: canonical,
      robotsIndex: post.robotsIndex,
      robotsFollow: post.robotsFollow,
      ogTitle: "",
      ogDescription: "",
      ogImage: null,
      sitemapInclude: post.sitemapInclude,
      customJsonLd: "",
    },
    settings,
    post.title,
    post.excerpt,
    canonical,
  );
  assert.equal((meta.robots as { index?: boolean })?.index, false);
  assert.equal((meta.robots as { follow?: boolean })?.follow, false);
  assert.equal(post.sitemapInclude, false);
});

test("blog post page wires postSeoMetadata; listing stays on pageSeoMetadata", () => {
  const root = path.join(process.cwd());
  const postPage = readFileSync(path.join(root, "app/blogs/[slug]/page.tsx"), "utf8");
  const listPage = readFileSync(path.join(root, "app/blogs/page.tsx"), "utf8");
  const metaSrc = readFileSync(path.join(root, "lib/metadata.ts"), "utf8");
  assert.match(postPage, /postSeoMetadata\(post\)/);
  assert.match(listPage, /pageSeoMetadata\(/);
  assert.doesNotMatch(listPage, /postSeoMetadata/);
  assert.match(metaSrc, /articleOpenGraphFields\(post\)/);
  assert.doesNotMatch(metaSrc, /new Date\(\)/);
});

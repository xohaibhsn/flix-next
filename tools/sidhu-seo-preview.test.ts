import assert from "node:assert/strict";
import { test } from "node:test";
import { emptyPost } from "../lib/cms/blog";
import { defaultBlogCategories, defaultSettings } from "../lib/cms/defaults";
import { defaultPageSeo } from "../lib/seo";
import {
  SIDHU_SEO_PUBLIC_ORIGIN,
  buildSidhuSeoPreview,
  sidhuCanonicalIssue,
  sidhuKeywordFound,
  sidhuPagePreviewPath,
  sidhuPreviewFromPageSeo,
  sidhuPreviewFromPost,
  sidhuSeoOverviewRows,
} from "../lib/cms/sidhu-seo-preview";

test("preview paths use live public URLs, not redirect sources", () => {
  assert.equal(sidhuPagePreviewPath("home"), "/welcome/");
  assert.equal(sidhuPagePreviewPath("subscriptions"), "/iptv-subscription-uk/");
  assert.equal(sidhuPagePreviewPath("blog"), "/blogs/");
  assert.equal(sidhuPagePreviewPath("contact"), "/contact/");
});

test("canonical helper flags http, www, and malformed values", () => {
  assert.equal(sidhuCanonicalIssue(""), null);
  assert.equal(sidhuCanonicalIssue("/welcome/"), null);
  assert.equal(sidhuCanonicalIssue("https://theflixiptv.com/welcome/"), null);
  assert.equal(sidhuCanonicalIssue("http://theflixiptv.com/welcome/")?.id, "canonical-http");
  assert.equal(sidhuCanonicalIssue("https://www.theflixiptv.com/welcome/")?.id, "canonical-www");
  assert.equal(sidhuCanonicalIssue("not a url")?.id, "canonical-malformed");
});

test("focus keyword hints stay editorial Found / Not found", () => {
  assert.equal(sidhuKeywordFound("IPTV on Firestick", "firestick"), true);
  assert.equal(sidhuKeywordFound("how-to-watch-iptv-on-firestick", "Firestick"), true);
  assert.equal(sidhuKeywordFound("Smart TV setup", "firestick"), false);
});

test("empty SEO title previews the metadata fallback without changing saved fields", () => {
  const seo = defaultPageSeo("", "", "/welcome/");
  const preview = sidhuPreviewFromPageSeo(seo, {
    key: "home",
    fallbackTitle: "Welcome",
    fallbackDescription: "",
    siteName: "Flix IPTV",
    siteTagline: "Your Entertainment. Your Way.",
  });
  assert.equal(seo.title, "");
  assert.equal(preview.effectiveTitle, "Welcome");
  assert.equal(preview.displayUrl, `${SIDHU_SEO_PUBLIC_ORIGIN}/welcome/`);
  assert.ok(preview.warnings.some((item) => item.id === "title-empty"));
  assert.ok(preview.warnings.some((item) => item.id === "description-empty"));
  assert.ok(preview.warnings.some((item) => item.id === "og-missing"));
  assert.equal(preview.keywordHints.length, 0);
});

test("post preview includes article keyword hint and does not invent a score", () => {
  const post = emptyPost();
  post.title = "How to watch IPTV on Firestick";
  post.slug = "how-to-watch-iptv-on-firestick";
  post.excerpt = "A setup guide for Firestick.";
  post.content = "<p>Watch IPTV on Firestick with a simple setup.</p>";
  post.focusKeyword = "Firestick";
  post.robotsIndex = false;
  post.sitemapInclude = false;
  const preview = sidhuPreviewFromPost(post, { siteName: "Flix IPTV" });
  assert.equal(preview.displayUrl, `${SIDHU_SEO_PUBLIC_ORIGIN}/blogs/how-to-watch-iptv-on-firestick/`);
  assert.equal(preview.effectiveTitle, post.title);
  assert.ok(preview.warnings.some((item) => item.id === "noindex"));
  assert.ok(preview.warnings.some((item) => item.id === "sitemap-off"));
  const start = preview.keywordHints.find((item) => item.label === "Start of article");
  assert.equal(start?.found, true);
  assert.equal(
    preview.keywordHints.every((item) => item.found === true || item.found === false),
    true,
  );
});

test("advisory canonical http warning does not rewrite the stored value", () => {
  const preview = buildSidhuSeoPreview({
    seoTitle: "Contact",
    metaDescription: "Get in touch.",
    fallbackTitle: "Contact",
    fallbackDescription: "Fallback",
    canonical: "http://theflixiptv.com/contact/",
    publicPath: "/contact/",
    robotsIndex: true,
    robotsFollow: true,
    sitemapInclude: true,
    ogTitle: "",
    ogDescription: "",
    ogImage: null,
    siteName: "Flix IPTV",
    focusKeyword: "",
  });
  assert.equal(preview.canonicalInput, "http://theflixiptv.com/contact/");
  assert.equal(preview.displayUrl, "http://theflixiptv.com/contact/");
  assert.ok(preview.warnings.some((item) => item.id === "canonical-http"));
});

test("SEO overview lists pages, posts, and editable categories", () => {
  const settings = defaultSettings();
  settings.pageSeo.home.robotsIndex = false;
  settings.pageSeo.home.sitemapInclude = false;
  const post = emptyPost();
  post.id = "post-test";
  post.title = "Firestick guide";
  post.slug = "firestick-guide";
  post.updatedAt = "2026-03-01T00:00:00.000Z";
  const categories = defaultBlogCategories();
  const rows = sidhuSeoOverviewRows(settings, [post], categories);
  const home = rows.find((row) => row.id === "page-home");
  const postRow = rows.find((row) => row.id === "post-test");
  const category = rows.find((row) => row.kind === "Category");
  assert.equal(home?.kind, "Page");
  assert.equal(home?.updated, "—");
  assert.ok(home?.flags.includes("Noindex"));
  assert.ok(home?.flags.includes("Sitemap excluded"));
  assert.equal(postRow?.kind, "Blog Post");
  assert.equal(postRow?.updated, "2026-03-01");
  assert.equal(postRow?.editHref, "/sidhu/blog/post-test/");
  assert.match(category?.editHref || "", /^\/sidhu\/blog\/category\//);
  assert.equal(category?.note, undefined);
  assert.equal(category?.indexLabel, "Index (default)");
  assert.equal(category?.sitemapLabel, "Included (default)");
  assert.match(category?.publicUrl || "", /^https:\/\/theflixiptv.com\/category\//);
});

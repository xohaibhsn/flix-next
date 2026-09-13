import assert from "node:assert/strict";
import { test } from "node:test";
import {
  blogPostPath,
  blogPostPathLegacy,
  blogsPathFromLegacyBlogPath,
  isLegacyBlogPostPath,
  migratePublicBlogHref,
  resolveBlogPostCanonical,
} from "../lib/cms/blog-paths";
import { renderCmsHtml } from "../lib/cms/html";

test("post paths only change the prefix", () => {
  assert.equal(blogPostPath("how-to-watch-iptv-on-firestick"), "/blogs/how-to-watch-iptv-on-firestick/");
  assert.equal(blogPostPathLegacy("how-to-watch-iptv-on-firestick"), "/blog/how-to-watch-iptv-on-firestick/");
});

test("legacy post matcher does not catch /blog/ or /blogs/", () => {
  assert.equal(isLegacyBlogPostPath("/blog/"), false);
  assert.equal(isLegacyBlogPostPath("/blogs/"), false);
  assert.equal(isLegacyBlogPostPath("/blogs/how-to-watch-iptv-on-firestick/"), false);
  assert.equal(isLegacyBlogPostPath("/blog/how-to-watch-iptv-on-firestick/"), true);
  assert.equal(isLegacyBlogPostPath("/sidhu/blog/post-firestick/"), false);
});

test("legacy post path maps to the new prefix", () => {
  assert.equal(
    blogsPathFromLegacyBlogPath("/blog/how-to-watch-iptv-on-firestick/"),
    "/blogs/how-to-watch-iptv-on-firestick/",
  );
  assert.equal(blogsPathFromLegacyBlogPath("/blog/"), "/blogs/");
});

test("canonical uses the new path for empty or self-canonical old URLs", () => {
  assert.equal(resolveBlogPostCanonical({ slug: "firestick", canonicalUrl: "" }), "/blogs/firestick/");
  assert.equal(resolveBlogPostCanonical({ slug: "firestick", canonicalUrl: "/blog/firestick/" }), "/blogs/firestick/");
  assert.equal(
    resolveBlogPostCanonical({ slug: "firestick", canonicalUrl: "https://theflixiptv.com/blog/firestick/" }),
    "/blogs/firestick/",
  );
  assert.equal(
    resolveBlogPostCanonical({ slug: "firestick", canonicalUrl: "https://example.com/canonical/" }),
    "https://example.com/canonical/",
  );
});

test("public href rewrite migrates post and listing links only", () => {
  assert.equal(migratePublicBlogHref("/blog/"), "/blogs/");
  assert.equal(migratePublicBlogHref("/blog/firestick/"), "/blogs/firestick/");
  assert.equal(migratePublicBlogHref("/blogs/firestick/"), "/blogs/firestick/");
  assert.equal(migratePublicBlogHref("/sidhu/blog/abc/"), "/sidhu/blog/abc/");
  assert.equal(migratePublicBlogHref("/category/setup/"), "/category/setup/");
  assert.equal(
    migratePublicBlogHref("https://theflixiptv.com/blog/firestick/"),
    "https://theflixiptv.com/blogs/firestick/",
  );
});

test("CMS HTML rewrites old post hrefs when rendered", () => {
  const html = renderCmsHtml('<p><a href="/blog/firestick/">Read</a></p>');
  assert.match(html, /href="\/blogs\/firestick\/"/);
  assert.doesNotMatch(html, /href="\/blog\/firestick\/"/);
});

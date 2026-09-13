import assert from "node:assert/strict";
import { test } from "node:test";
import {
  BLOG_INDEX_REDIRECT_ID,
  BLOG_INDEX_SLUG,
  BLOG_INDEX_SLUG_LEGACY,
  applyBlogIndexRedirectUpsert,
  remapSettingsForBlogIndex,
} from "../lib/cms/blog-index";
import { knownLocalDestinations } from "../lib/cms/page-paths";
import { defaultSettings } from "../lib/cms/defaults";
import type { RedirectRule } from "../lib/cms/types";

function rule(partial: Partial<RedirectRule> & Pick<RedirectRule, "id" | "sourcePath" | "destinationPath">): RedirectRule {
  return {
    statusCode: 301,
    active: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...partial,
  };
}

test("upserts exact /blog/ to /blogs/ without catching post URLs", () => {
  const first = applyBlogIndexRedirectUpsert([
    rule({ id: "post-like", sourcePath: "/blog/how-to-watch-iptv-on-firestick/", destinationPath: "/elsewhere/" }),
  ]);
  const blog = first.rules.find((item) => item.sourcePath === BLOG_INDEX_SLUG_LEGACY);
  assert.equal(blog?.id, BLOG_INDEX_REDIRECT_ID);
  assert.equal(blog?.destinationPath, BLOG_INDEX_SLUG);
  assert.equal(blog?.statusCode, 301);
  assert.equal(blog?.active, true);
  const post = first.rules.find((item) => item.sourcePath === "/blog/how-to-watch-iptv-on-firestick/");
  assert.equal(post?.destinationPath, "/elsewhere/");

  const second = applyBlogIndexRedirectUpsert(first.rules);
  assert.equal(second.changed, false);
  assert.equal(second.rules.filter((item) => item.sourcePath === BLOG_INDEX_SLUG_LEGACY).length, 1);
});

test("disables a /blogs/ self-redirect so the listing can return 200", () => {
  const result = applyBlogIndexRedirectUpsert([
    rule({ id: "self", sourcePath: BLOG_INDEX_SLUG, destinationPath: BLOG_INDEX_SLUG }),
  ]);
  const self = result.rules.find((item) => item.id === "self");
  assert.equal(self?.active, false);
  const index = result.rules.find((item) => item.sourcePath === BLOG_INDEX_SLUG_LEGACY);
  assert.equal(index?.destinationPath, BLOG_INDEX_SLUG);
});

test("/blogs/ is a known local redirect destination and /blog/ listing is not required", () => {
  const known = knownLocalDestinations([], [], []);
  assert.equal(known.has(BLOG_INDEX_SLUG), true);
  assert.equal(known.has("/blog/how-to-watch-iptv-on-firestick/"), false);
});

test("nav remap rewrites exact /blog/ only", () => {
  const settings = defaultSettings();
  settings.headerNav = [
    { id: "nav-blog", label: "Blog", href: "/blog/", visible: true },
    { id: "nav-post", label: "Post", href: "/blog/how-to-watch-iptv-on-firestick/", visible: true },
  ];
  const remapped = remapSettingsForBlogIndex(settings);
  assert.equal(remapped.settings.headerNav[0]?.href, BLOG_INDEX_SLUG);
  assert.equal(remapped.settings.headerNav[1]?.href, "/blog/how-to-watch-iptv-on-firestick/");
});

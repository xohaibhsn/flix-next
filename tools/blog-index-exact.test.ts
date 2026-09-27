import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import {
  BLOG_INDEX_REDIRECT_ID,
  BLOG_INDEX_SLUG,
  BLOG_INDEX_SLUG_LEGACY,
  applyBlogIndexRedirectUpsert,
  resolveBlogIndexManagedRedirect,
} from "../lib/cms/blog-index";
import { isLegacyBlogPostPath, blogsPathFromLegacyBlogPath } from "../lib/cms/blog-paths";
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

test("correct /blog/ redirect → exact resolve, no write", () => {
  const existing = rule({
    id: BLOG_INDEX_REDIRECT_ID,
    sourcePath: BLOG_INDEX_SLUG_LEGACY,
    destinationPath: BLOG_INDEX_SLUG,
    statusCode: 301,
    active: true,
  });
  const result = resolveBlogIndexManagedRedirect(existing);
  assert.equal(result.changed, false);
  assert.equal(result.rule.id, existing.id);
  assert.equal(result.rule.destinationPath, BLOG_INDEX_SLUG);
});

test("missing /blog/ redirect → create managed row", () => {
  const result = resolveBlogIndexManagedRedirect(null);
  assert.equal(result.changed, true);
  assert.equal(result.rule.id, BLOG_INDEX_REDIRECT_ID);
  assert.equal(result.rule.sourcePath, BLOG_INDEX_SLUG_LEGACY);
  assert.equal(result.rule.destinationPath, BLOG_INDEX_SLUG);
  assert.equal(result.rule.statusCode, 301);
  assert.equal(result.rule.active, true);
});

test("inactive or wrong /blog/ row repairs to previous semantics", () => {
  const existing = rule({
    id: "custom-blog-row",
    sourcePath: BLOG_INDEX_SLUG_LEGACY,
    destinationPath: "/welcome/",
    statusCode: 302,
    active: false,
  });
  const result = resolveBlogIndexManagedRedirect(existing);
  assert.equal(result.changed, true);
  assert.equal(result.rule.id, "custom-blog-row");
  assert.equal(result.rule.destinationPath, BLOG_INDEX_SLUG);
  assert.equal(result.rule.statusCode, 301);
  assert.equal(result.rule.active, true);
});

test("unrelated Junaid redirects are untouched by exact blog resolve", () => {
  const junaid = rule({
    id: "redir-junaid-example",
    sourcePath: "/old-campaign/",
    destinationPath: "/welcome/",
  });
  const onlyBlog = resolveBlogIndexManagedRedirect(null);
  assert.equal(onlyBlog.rule.sourcePath, BLOG_INDEX_SLUG_LEGACY);
  assert.notEqual(onlyBlog.rule.id, junaid.id);
  assert.equal(junaid.sourcePath, "/old-campaign/");
  assert.equal(junaid.destinationPath, "/welcome/");
  assert.equal(junaid.statusCode, 301);
});

test("exact resolve matches managed-row outcome of full upsert for /blog/", () => {
  const empty = applyBlogIndexRedirectUpsert([]);
  const fromExact = resolveBlogIndexManagedRedirect(null);
  const created = empty.rules.find((item) => item.sourcePath === BLOG_INDEX_SLUG_LEGACY);
  assert.equal(created?.destinationPath, fromExact.rule.destinationPath);
  assert.equal(created?.statusCode, fromExact.rule.statusCode);
  assert.equal(created?.active, fromExact.rule.active);

  const correct = rule({
    id: BLOG_INDEX_REDIRECT_ID,
    sourcePath: BLOG_INDEX_SLUG_LEGACY,
    destinationPath: BLOG_INDEX_SLUG,
  });
  assert.equal(applyBlogIndexRedirectUpsert([correct]).changed, false);
  assert.equal(resolveBlogIndexManagedRedirect(correct).changed, false);
});

test("ensureBlogIndexRedirect uses exact source lookup, not full list", () => {
  const source = readFileSync(path.join(process.cwd(), "lib/cms/mysql-migrate.ts"), "utf8");
  const fnStart = source.indexOf("export async function ensureBlogIndexRedirect");
  const fnEnd = source.indexOf("export async function", fnStart + 10);
  const body = source.slice(fnStart, fnEnd === -1 ? undefined : fnEnd);
  assert.match(body, /loadRedirectBySourcePath\(BLOG_INDEX_SLUG_LEGACY\)/);
  assert.match(body, /resolveBlogIndexManagedRedirect/);
  assert.equal(body.includes("SELECT id, source_path, destination_path, status_code, is_active, created_at, updated_at FROM redirects\""), false);
  assert.equal(body.includes("applyBlogIndexRedirectUpsert"), false);
});

test("/blog/[slug]/ dynamic legacy behavior is unaffected", () => {
  assert.equal(isLegacyBlogPostPath("/blog/how-to-watch-iptv-on-firestick/"), true);
  assert.equal(
    blogsPathFromLegacyBlogPath("/blog/how-to-watch-iptv-on-firestick/"),
    "/blogs/how-to-watch-iptv-on-firestick/",
  );
  assert.equal(isLegacyBlogPostPath("/blog/"), false);
});

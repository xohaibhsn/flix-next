import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { findActiveRedirectBySourcePath, withSlash } from "../lib/cms/redirects";
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

const catalog = [
  rule({
    id: "redir-root-welcome",
    sourcePath: "/",
    destinationPath: "/welcome/",
    statusCode: 308,
  }),
  rule({
    id: "redir-iptv-subscriptions-uk",
    sourcePath: "/iptv-subscriptions-uk/",
    destinationPath: "/iptv-subscription-uk/",
  }),
  rule({
    id: "redir-inactive",
    sourcePath: "/old-promo/",
    destinationPath: "/welcome/",
    active: false,
  }),
];

test("exact active redirect is returned with destination and status unchanged", () => {
  const match = findActiveRedirectBySourcePath(catalog, "/iptv-subscriptions-uk");
  assert.equal(match?.id, "redir-iptv-subscriptions-uk");
  assert.equal(match?.destinationPath, "/iptv-subscription-uk/");
  assert.equal(match?.statusCode, 301);
  assert.equal(match?.active, true);
});

test("inactive redirect is not returned", () => {
  assert.equal(findActiveRedirectBySourcePath(catalog, "/old-promo/"), null);
});

test("unknown source returns null", () => {
  assert.equal(findActiveRedirectBySourcePath(catalog, "/does-not-exist/"), null);
});

test("exact path semantics preserve root and slash normalization", () => {
  const root = findActiveRedirectBySourcePath(catalog, "/");
  assert.equal(root?.statusCode, 308);
  assert.equal(root?.destinationPath, "/welcome/");
  assert.equal(withSlash("/iptv-subscriptions-uk"), "/iptv-subscriptions-uk/");
  assert.equal(
    findActiveRedirectBySourcePath(catalog, "/iptv-subscriptions-uk/")?.id,
    findActiveRedirectBySourcePath(catalog, "/iptv-subscriptions-uk")?.id,
  );
});

test("MySQL exact lookup SQL is parameterized and limits to one active row", () => {
  const mysqlSource = readFileSync(path.join(process.cwd(), "lib/cms/mysql-catalog.ts"), "utf8");
  const match = mysqlSource.match(
    /GET_ACTIVE_REDIRECT_BY_SOURCE_SQL\s*=\s*"([^"]+)"/,
  );
  assert.ok(match?.[1], "expected GET_ACTIVE_REDIRECT_BY_SOURCE_SQL constant");
  const sql = match[1];
  assert.match(sql, /source_path = \?/);
  assert.match(sql, /is_active = 1/);
  assert.match(sql, /LIMIT 1/i);
  assert.equal(sql.includes("${"), false);
  assert.match(mysqlSource, /query<RedirectRow\[\]>\(GET_ACTIVE_REDIRECT_BY_SOURCE_SQL, \[source\]\)/);
});

test("full redirect listing API remains on the catalog contract for Sidhu", () => {
  const catalogSource = readFileSync(path.join(process.cwd(), "lib/cms/catalog.ts"), "utf8");
  assert.match(catalogSource, /listRedirects\(\): Promise<RedirectRule\[\]>/);
  assert.match(catalogSource, /listActiveRedirects\(\): Promise<RedirectRule\[\]>/);
  assert.match(catalogSource, /getActiveRedirectBySourcePath\(sourcePath: string\): Promise<RedirectRule \| null>/);
});

test("proxy public lookup uses exact path method, not the full active list", () => {
  const proxySource = readFileSync(path.join(process.cwd(), "proxy.ts"), "utf8");
  assert.match(proxySource, /getActiveRedirectBySourcePath\(/);
  assert.equal(proxySource.includes("listActiveRedirects("), false);
  assert.match(proxySource, /isLegacyBlogPostPath\(/);
});

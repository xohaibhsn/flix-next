import assert from "node:assert/strict";
import { test } from "node:test";
import { withSlash } from "../lib/cms/redirects";

test("public page cache keys collapse slash variants to one slug", () => {
  assert.equal(withSlash("/iptv-subscription-uk"), "/iptv-subscription-uk/");
  assert.equal(withSlash("/iptv-subscription-uk/"), withSlash("/iptv-subscription-uk"));
  assert.equal(withSlash("/refund-policy/"), "/refund-policy/");
});

test("public page cache keys stay primitive strings", () => {
  const key = withSlash("/category/guides/");
  assert.equal(typeof key, "string");
  assert.equal(key, withSlash(key));
});

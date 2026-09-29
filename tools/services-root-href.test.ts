import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { resolveServicesCardHref } from "../components/sections/Services";
import {
  builtInRedirectDestination,
  resolveInternalRedirectPath,
} from "../lib/cms/internal-links";

const editorSource = readFileSync(
  path.join(process.cwd(), "components/sidhu/SectionEditor.tsx"),
  "utf8",
);

test("Services runtime maps root and falsy hrefs to /welcome/", () => {
  assert.equal(resolveServicesCardHref("/"), "/welcome/");
  assert.equal(resolveServicesCardHref(""), "/welcome/");
  assert.equal(resolveServicesCardHref(undefined), "/welcome/");
  assert.equal(resolveServicesCardHref(null), "/welcome/");
});

test("Services runtime preserves valid non-root hrefs", () => {
  assert.equal(resolveServicesCardHref("/iptv-subscription-uk/"), "/iptv-subscription-uk/");
  assert.equal(resolveServicesCardHref("/contact/"), "/contact/");
});

test("Services runtime never intentionally emits href=/", () => {
  assert.notEqual(resolveServicesCardHref("/"), "/");
  assert.notEqual(resolveServicesCardHref(""), "/");
  assert.notEqual(resolveServicesCardHref(undefined), "/");
});

test("Sidhu Services + Add card defaults to subscription path, not /", () => {
  const addCardBlock = editorSource.match(
    /label="\+ Add card"[\s\S]*?linkHref:\s*"([^"]+)"[\s\S]*?tone:\s*"red"/,
  );
  assert.ok(addCardBlock, "expected Services Add card block");
  const href = addCardBlock?.[1] ?? "";
  assert.equal(href, "/iptv-subscription-uk/");
  assert.notEqual(href, "/");
});

test("root redirect hop remains / → /welcome/", () => {
  assert.equal(builtInRedirectDestination("/"), "/welcome/");
  const resolved = resolveInternalRedirectPath("/", []);
  assert.equal(resolved.redirected, true);
  assert.equal(resolved.finalPath, "/welcome/");
});

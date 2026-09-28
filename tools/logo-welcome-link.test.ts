import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import {
  DEFAULT_CODE_DEFINED_LINKS,
  builtInRedirectDestination,
  resolveInternalRedirectPath,
  scanInternalLinks,
} from "../lib/cms/internal-links";
import { defaultSettings } from "../lib/cms/defaults";
import type { CmsPage } from "../lib/cms/types";

const logoSource = readFileSync(path.join(process.cwd(), "components/layout/Logo.tsx"), "utf8");

test("shared Logo image and fallback branches both link to /welcome/", () => {
  const hrefs = [...logoSource.matchAll(/<Link\s+href="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(hrefs.length, 2);
  assert.deepEqual(hrefs, ["/welcome/", "/welcome/"]);
  assert.equal(logoSource.includes('href="/"'), false);
});

test("DEFAULT_CODE_DEFINED_LINKS header-logo targets /welcome/ and is not REDIRECTED", () => {
  const logo = DEFAULT_CODE_DEFINED_LINKS.find((link) => link.id === "header-logo");
  assert.ok(logo);
  assert.equal(logo?.href, "/welcome/");

  const pages: CmsPage[] = [
    {
      id: "page-home",
      name: "Home",
      slug: "/",
      status: "published",
      cmsEnabled: true,
      sections: [],
    },
  ];
  const scan = scanInternalLinks({
    settings: defaultSettings(),
    pages,
    posts: [],
    categories: [],
    redirects: [],
  });
  const finding = scan.findings.find((item) => item.sourceId === "header-logo");
  assert.ok(finding);
  assert.equal(finding?.storedHref, "/welcome/");
  assert.equal(finding?.finalPath, "/welcome/");
  assert.equal(finding?.issues.includes("REDIRECTED"), false);
  assert.ok(finding?.issues.includes("VALID"));
});

test("root redirect hop remains / → /welcome/", () => {
  assert.equal(builtInRedirectDestination("/"), "/welcome/");
  const resolved = resolveInternalRedirectPath("/", []);
  assert.equal(resolved.redirected, true);
  assert.equal(resolved.finalPath, "/welcome/");
});

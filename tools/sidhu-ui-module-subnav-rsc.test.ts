import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { isModuleSubNavItemActive } from "../lib/cms/module-subnav";
import { SIDHU_SEO_NAV, isSeoNavActive } from "../lib/cms/sidhu-seo-nav";

const root = process.cwd();

function read(rel: string) {
  return readFileSync(path.join(root, rel), "utf8");
}

test("SeoModuleChrome does not pass function props into ModuleSubNav", () => {
  const chrome = read("components/sidhu/SeoModuleChrome.tsx");
  const nav = read("components/sidhu/ui/ModuleSubNav.tsx");

  assert.match(chrome, /ModuleSubNav/);
  assert.match(chrome, /SIDHU_SEO_NAV/);
  assert.doesNotMatch(chrome, /\bisActive\s*=/);
  assert.doesNotMatch(chrome, /isSeoNavActive/);

  assert.match(nav, /"use client"/);
  assert.doesNotMatch(nav, /isActive\??\s*:/);
  assert.doesNotMatch(nav, /\bisActive\b/);
  assert.match(nav, /isModuleSubNavItemActive/);
});

test("ModuleSubNav public props stay JSON-serializable", () => {
  const props = {
    items: SIDHU_SEO_NAV.map((item) => ({ ...item })),
    ariaLabel: "SEO sections",
  };
  const roundTrip = JSON.parse(JSON.stringify(props)) as typeof props;
  assert.deepEqual(roundTrip, props);
  for (const item of props.items) {
    assert.equal(typeof item.id, "string");
    assert.equal(typeof item.label, "string");
    assert.equal(typeof item.href, "string");
    if (item.exact !== undefined) {
      assert.equal(typeof item.exact, "boolean");
    }
  }
});

test("SEO nav active matching covers all subsections with Overview exact", () => {
  type SidhuSeoId = (typeof SIDHU_SEO_NAV)[number]["id"];

  assert.equal(SIDHU_SEO_NAV.length, 9);
  assert.deepEqual(
    SIDHU_SEO_NAV.map((item) => item.label),
    [
      "Overview",
      "Issues",
      "Opportunities",
      "Planning",
      "Content",
      "Metadata",
      "Links",
      "Media",
      "Advanced",
    ],
  );
  assert.equal(SIDHU_SEO_NAV[0]?.exact, true);

  const cases: Array<{ path: string; activeId: SidhuSeoId }> = [
    { path: "/sidhu/seo/", activeId: "overview" },
    { path: "/sidhu/seo", activeId: "overview" },
    { path: "/sidhu/seo/health/", activeId: "issues" },
    { path: "/sidhu/seo/opportunities/", activeId: "opportunities" },
    { path: "/sidhu/seo/planning/", activeId: "planning" },
    { path: "/sidhu/seo/planning/demo/", activeId: "planning" },
    { path: "/sidhu/seo/content/", activeId: "content" },
    { path: "/sidhu/seo/metadata-diagnostics/", activeId: "metadata" },
    { path: "/sidhu/seo/internal-links/", activeId: "links" },
    { path: "/sidhu/seo/image-diagnostics/", activeId: "media" },
    { path: "/sidhu/seo/advanced/", activeId: "advanced" },
  ];

  for (const { path: pathname, activeId } of cases) {
    for (const item of SIDHU_SEO_NAV) {
      const active = isModuleSubNavItemActive(pathname, item);
      assert.equal(
        active,
        item.id === activeId,
        `${pathname} → ${item.id} expected ${item.id === activeId}`,
      );
    }
  }

  assert.equal(isSeoNavActive("/sidhu/seo/health/", "/sidhu/seo/"), false);
  assert.equal(isSeoNavActive("/sidhu/seo/", "/sidhu/seo/"), true);
  assert.equal(isSeoNavActive("/sidhu/seo/opportunities/", "/sidhu/seo/opportunities/"), true);
  assert.match(read("lib/cms/sidhu-seo-nav.ts"), /Opportunities/);
  assert.doesNotMatch(read("lib/cms/sidhu-seo-nav.ts"), /History|Performance|GSC/i);
});

test("shared matcher lives outside the client module so Server Components stay clean", () => {
  const matcher = read("lib/cms/module-subnav.ts");
  const nav = read("components/sidhu/ui/ModuleSubNav.tsx");
  assert.doesNotMatch(matcher, /"use client"/);
  assert.match(matcher, /export function isModuleSubNavItemActive/);
  assert.match(nav, /from ["']@\/lib\/cms\/module-subnav["']/);
});

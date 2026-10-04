import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { test } from "node:test";
import { Alert } from "../components/sidhu/ui/Alert";
import { PageHeader } from "../components/sidhu/ui/PageHeader";
import { Banner, Field, TextInput, inputClass } from "../components/sidhu/fields";
import {
  filterSidhuNavGroups,
  filterSidhuNavItems,
  isSidhuNavActive,
  SIDHU_NAV_ITEMS,
} from "../lib/cms/sidhu-nav";

const root = process.cwd();

const LEGACY_NAV_HREFS = [
  "/sidhu/",
  "/sidhu/pages/",
  "/sidhu/blog/",
  "/sidhu/pricing/",
  "/sidhu/faqs/",
  "/sidhu/seo/",
  "/sidhu/media/",
  "/sidhu/redirects/",
  "/sidhu/settings/",
  "/sidhu/messages/",
  "/sidhu/users/",
];

test("grouped nav preserves every previous permission-gated route", () => {
  const hrefs = SIDHU_NAV_ITEMS.map((item) => item.href).sort();
  assert.deepEqual(hrefs, [...LEGACY_NAV_HREFS].sort());
});

test("permission filtering hides unauthorized modules and keeps authorized ones", () => {
  const custom = filterSidhuNavItems("custom", ["blog", "seo"]);
  const hrefs = custom.map((item) => item.href);
  assert.deepEqual(hrefs, ["/sidhu/blog/", "/sidhu/seo/"]);
  assert.ok(!hrefs.includes("/sidhu/users/"));
  assert.ok(!hrefs.includes("/sidhu/settings/"));

  const groups = filterSidhuNavGroups("custom", ["blog", "seo"]);
  assert.deepEqual(
    groups.map((group) => group.id),
    ["content", "seo"],
  );
  assert.equal(
    groups.flatMap((group) => group.items.map((item) => item.href)).join(","),
    "/sidhu/blog/,/sidhu/seo/",
  );
});

test("super_admin sees all nav destinations", () => {
  assert.equal(filterSidhuNavItems("super_admin", []).length, LEGACY_NAV_HREFS.length);
});

test("active route matching matches previous AdminShell behavior", () => {
  assert.equal(isSidhuNavActive("/sidhu/", "/sidhu/"), true);
  assert.equal(isSidhuNavActive("/sidhu", "/sidhu/"), true);
  assert.equal(isSidhuNavActive("/sidhu/blog/new/", "/sidhu/blog/"), true);
  assert.equal(isSidhuNavActive("/sidhu/pages/", "/sidhu/blog/"), false);
  assert.equal(isSidhuNavActive("/sidhu/seo/health/", "/sidhu/seo/"), true);
});

test("AdminShell keeps mobile menu control, logout, and grouped navigation", () => {
  const shell = readFileSync(path.join(root, "components/sidhu/AdminShell.tsx"), "utf8");
  const nav = readFileSync(path.join(root, "lib/cms/sidhu-nav.ts"), "utf8");
  assert.match(shell, /Open navigation menu/);
  assert.match(shell, /LogoutButton/);
  assert.match(shell, /filterSidhuNavGroups/);
  assert.match(shell, /PageHeader/);
  assert.match(shell, /Account/);
  assert.match(nav, /label: "Overview"/);
  assert.match(nav, /label: "Content"/);
  assert.match(nav, /label: "Operations"/);
  assert.doesNotMatch(shell, /#f3f4f7|#0c0e14/);
  assert.doesNotMatch(shell, /AnalyticsConsent/);
});

test("PageHeader renders title, subtitle, breadcrumbs, and actions", () => {
  const html = renderToStaticMarkup(
    createElement(PageHeader, {
      title: "Pages",
      subtitle: "Manage CMS pages",
      breadcrumbs: [{ label: "Content" }, { label: "Pages" }],
      actions: createElement("button", { type: "button" }, "Primary"),
    }),
  );
  assert.match(html, /Pages/);
  assert.match(html, /Manage CMS pages/);
  assert.match(html, /Content/);
  assert.match(html, /Primary/);
  assert.match(html, /aria-label="Breadcrumb"/);
});

test("field primitives keep labels/hints and safer focus styles", () => {
  const html = renderToStaticMarkup(
    createElement(Field, {
      label: "SEO title",
      hint: "Shown in search results.",
      children: createElement(TextInput, { defaultValue: "About Us" }),
    }),
  );
  assert.match(html, /SEO title/);
  assert.match(html, /Shown in search results/);
  assert.match(html, /About Us/);
  assert.match(inputClass, /focus-visible:ring-2/);
  assert.match(inputClass, /disabled:bg-paper/);
});

test("Banner / Alert tones render without undefined panel classes", () => {
  const ok = renderToStaticMarkup(createElement(Banner, { tone: "ok", children: "Saved" }));
  const err = renderToStaticMarkup(createElement(Banner, { tone: "error", children: "Failed" }));
  const info = renderToStaticMarkup(createElement(Alert, { tone: "info", children: "Note" }));
  assert.match(ok, /Saved/);
  assert.match(err, /Failed/);
  assert.match(info, /Note/);
  assert.doesNotMatch(ok + err + info, /bg-panel/);

  const advisory = readFileSync(path.join(root, "components/sidhu/SeoPostSaveAdvisoryPanel.tsx"), "utf8");
  assert.doesNotMatch(advisory, /bg-panel/);
  assert.match(advisory, /bg-paper/);
});

test("package.json has no new UI framework dependencies", () => {
  const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  const all = { ...pkg.dependencies, ...pkg.devDependencies };
  for (const name of ["@mui/material", "antd", "@chakra-ui/react", "shadcn", "framer-motion"]) {
    assert.equal(all[name], undefined);
  }
});

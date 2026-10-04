/* eslint-disable react/no-children-prop -- createElement tests need children in props for TypeScript */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { test } from "node:test";
import { SeoOverviewHub } from "../components/sidhu/SeoOverviewHub";
import { ListActionButton, ListActionLink, ListActions } from "../components/sidhu/ui/ListActions";
import { SIDHU_SEO_NAV, isSeoNavActive } from "../lib/cms/sidhu-seo-nav";

const root = process.cwd();

function read(rel: string) {
  return readFileSync(path.join(root, rel), "utf8");
}

test("SEO nav exposes current subsections only", () => {
  assert.deepEqual(
    SIDHU_SEO_NAV.map((item) => item.label),
    ["Overview", "Issues", "Opportunities", "Content", "Metadata", "Links", "Media", "Advanced"],
  );
  assert.deepEqual(
    SIDHU_SEO_NAV.map((item) => item.href),
    [
      "/sidhu/seo/",
      "/sidhu/seo/health/",
      "/sidhu/seo/opportunities/",
      "/sidhu/seo/content/",
      "/sidhu/seo/metadata-diagnostics/",
      "/sidhu/seo/internal-links/",
      "/sidhu/seo/image-diagnostics/",
      "/sidhu/seo/advanced/",
    ],
  );
  const src = read("lib/cms/sidhu-seo-nav.ts");
  assert.match(src, /Opportunities/);
  assert.doesNotMatch(src, /Performance|History|GSC|AI Content/i);
});

test("SEO nav active matching keeps Overview exact", () => {
  assert.equal(isSeoNavActive("/sidhu/seo/", "/sidhu/seo/"), true);
  assert.equal(isSeoNavActive("/sidhu/seo", "/sidhu/seo/"), true);
  assert.equal(isSeoNavActive("/sidhu/seo/health/", "/sidhu/seo/"), false);
  assert.equal(isSeoNavActive("/sidhu/seo/content/", "/sidhu/seo/content/"), true);
  assert.equal(isSeoNavActive("/sidhu/seo/health/", "/sidhu/seo/health/"), true);
  assert.equal(isSeoNavActive("/sidhu/seo/advanced/", "/sidhu/seo/content/"), false);
});

test("SEO Overview is a control-center hub without inventory table or auto scans", () => {
  const page = read("app/sidhu/(protected)/seo/page.tsx");
  const hub = read("components/sidhu/SeoOverviewHub.tsx");
  const healthState = read("lib/cms/seo-health-state.ts");
  assert.match(page, /SeoOverviewHub/);
  assert.match(page, /SeoModuleChrome/);
  assert.match(page, /getSeoHealthState/);
  assert.doesNotMatch(page, /SeoOverviewTable|SeoForm|runSeoHealthScan|scanMetadata|scanInternal|scanImage|openai|explainSeo/i);
  assert.doesNotMatch(hub, /SeoOverviewTable/);
  assert.match(hub, /Open Issues/);
  assert.match(hub, /Open Opportunities/);
  assert.match(hub, /UK Content Opportunities/);
  assert.match(hub, /Open Content/);
  assert.match(hub, /Open Metadata/);
  assert.match(hub, /Open Links/);
  assert.match(hub, /Open Media/);
  assert.match(hub, /Open Advanced/);
  assert.match(hub, /AI SEO Assistant/);
  assert.match(hub, /Last saved scan/);
  assert.match(hub, /No SEO Health scan has been run yet/);
  assert.doesNotMatch(hub, /GSC|fake score|\/\s*100|live score|real-time/i);
  assert.doesNotMatch(hub, /researchUkContentOpportunitiesAction/);
  assert.match(healthState, /Pure read/);
  assert.doesNotMatch(healthState, /readJsonFile/);
  assert.match(healthState, /export async function saveSeoHealthState/);

  const html = renderToStaticMarkup(
    createElement(SeoOverviewHub, {
      inventoryCount: 12,
      lastScanAt: null,
      openFindingCount: null,
    }),
  );
  assert.match(html, /SEO Health/);
  assert.match(html, /Content SEO/);
  assert.match(html, /12 items in the inventory/);
  assert.doesNotMatch(html, /<table/i);
});

test("SEO Content workspace renders inventory with edit destinations preserved", () => {
  const page = read("app/sidhu/(protected)/seo/content/page.tsx");
  const table = read("components/sidhu/SeoOverviewTable.tsx");
  assert.match(page, /SeoOverviewTable/);
  assert.match(page, /sidhuSeoOverviewRows/);
  assert.match(page, /SeoModuleChrome/);
  assert.match(table, /row\.editHref/);
  assert.match(table, /Edit/);
  assert.match(table, /publicUrl/);
  assert.match(table, /indexLabel/);
  assert.match(table, /sitemapLabel/);
  assert.match(table, /canonicalLabel/);
  assert.match(table, /ogLabel/);
});

test("SEO Advanced keeps schema editor and existing save contract", () => {
  const page = read("app/sidhu/(protected)/seo/advanced/page.tsx");
  const form = read("components/sidhu/SeoForm.tsx");
  assert.match(page, /SeoForm/);
  assert.match(page, /SeoModuleChrome/);
  assert.match(form, /saveSeoSettingsAction/);
  assert.match(form, /siteCustomJsonLd/);
  assert.match(form, /Save site-wide schema/);
  assert.doesNotMatch(form, /SeoOverviewTable|Open SEO Health|diagnostic/i);
});

test("SEO Issues / diagnostics pages keep behavior and gain module chrome", () => {
  const health = read("app/sidhu/(protected)/seo/health/page.tsx");
  const metadata = read("app/sidhu/(protected)/seo/metadata-diagnostics/page.tsx");
  const links = read("app/sidhu/(protected)/seo/internal-links/page.tsx");
  const media = read("app/sidhu/(protected)/seo/image-diagnostics/page.tsx");

  for (const src of [health, metadata, links, media]) {
    assert.match(src, /SeoModuleChrome/);
  }

  assert.match(health, /runRequested/);
  assert.match(health, /runSeoHealthScan\(cms\)/);
  assert.match(health, /explainSeoHealthFindingAction/);
  assert.match(health, /acceptSeoHealthFindingAction/);
  assert.match(metadata, /scanMetadataDiagnostics/);
  assert.match(links, /scanInternalLinks/);
  assert.match(media, /scanImageDiagnostics/);
});

test("ModuleSubNav is semantic with aria-current support", () => {
  const src = read("components/sidhu/ui/ModuleSubNav.tsx");
  assert.match(src, /<nav/);
  assert.match(src, /aria-current/);
  assert.match(src, /aria-label/);
  assert.match(src, /flex-wrap/);
  assert.doesNotMatch(src, /\bisActive\b/);
  assert.match(read("components/sidhu/SeoModuleChrome.tsx"), /items=\{SIDHU_SEO_NAV\}/);
  assert.doesNotMatch(read("components/sidhu/SeoModuleChrome.tsx"), /\bisActive\s*=/);
});

test("Blog keeps one primary New Post in PageHeader and quiet View / secondary Edit / danger Delete", () => {
  const blogPage = read("app/sidhu/(protected)/blog/page.tsx");
  const blogList = read("components/sidhu/BlogList.tsx");
  assert.match(blogPage, /\/sidhu\/blog\/new\//);
  assert.match(blogPage, /sidhuButtonClass\("primary"\)/);
  assert.equal((blogList.match(/New Post/g) || []).length, 1);
  assert.match(blogList, /variant="secondary"/);
  assert.match(blogList, /variant="quiet"/);
  assert.match(blogList, /variant="danger"/);
});

test("List action hierarchy uses quiet / secondary / danger styles", () => {
  const src = read("components/sidhu/ui/ListActions.tsx");
  assert.match(src, /quiet:/);
  assert.match(src, /text-muted/);
  assert.match(src, /text-red-700/);
  assert.doesNotMatch(src, /primary:.*"text-brand"/);

  const html = renderToStaticMarkup(
    createElement(ListActions, {
      children: [
        createElement(ListActionLink, {
          key: "e",
          href: "/sidhu/blog/1/",
          variant: "secondary",
          children: "Edit",
        }),
        createElement(ListActionLink, {
          key: "v",
          href: "/blog/demo/",
          variant: "quiet",
          children: "View",
        }),
        createElement(ListActionButton, {
          key: "d",
          variant: "danger",
          children: "Delete",
        }),
      ],
    }),
  );
  assert.match(html, /Edit/);
  assert.match(html, /View/);
  assert.match(html, /Delete/);
  assert.match(html, /text-muted/);
  assert.match(html, /text-red-700/);
});

test("SEO permission path prefix still covers new SEO workspaces", () => {
  const src = read("lib/auth/permissions.ts");
  assert.match(src, /startsWith\("\/sidhu\/seo\/"\)/);
  assert.match(src, /return "seo"/);
});

test("no public route/output changes from SEO IA shell files", () => {
  const overview = read("app/sidhu/(protected)/seo/page.tsx");
  const content = read("app/sidhu/(protected)/seo/content/page.tsx");
  const advanced = read("app/sidhu/(protected)/seo/advanced/page.tsx");
  for (const src of [overview, content, advanced]) {
    assert.doesNotMatch(src, /robots\.txt|sitemap\.xml|generateMetadata|canonical/i);
  }
  assert.doesNotMatch(read("components/sidhu/SeoForm.tsx"), /revalidatePath\(|redirect\(/);
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { test } from "node:test";
import { ListActionButton, ListActionLink, ListActions } from "../components/sidhu/ui/ListActions";
import { RelatedWorkspaces } from "../components/sidhu/ui/RelatedWorkspaces";
import { SeoHealthReport } from "../components/sidhu/SeoHealthReport";
import { SeoOpportunitiesPanel } from "../components/sidhu/SeoOpportunitiesPanel";
import { StickyEditorBar } from "../components/sidhu/ui/StickyEditorBar";
import { SIDHU_SEO_NAV } from "../lib/cms/sidhu-seo-nav";

const root = process.cwd();

function read(rel: string) {
  return readFileSync(path.join(root, rel), "utf8");
}

test("SEO Issues related destinations use RelatedWorkspaces tiles, not raw inline link row", () => {
  const html = renderToStaticMarkup(createElement(SeoHealthReport, { report: null }));
  assert.match(html, /Related SEO workspaces/);
  assert.match(html, /data-sidhu-related-workspaces/);
  assert.match(html, /SEO Overview/);
  assert.match(html, /Metadata Report/);
  assert.match(html, /Internal Links/);
  assert.match(html, /Image Report/);
  assert.match(html, /href="\/sidhu\/seo\/?"/);
  assert.match(html, /href="\/sidhu\/seo\/metadata-diagnostics\/?"/);
  assert.match(html, /href="\/sidhu\/seo\/internal-links\/?"/);
  assert.match(html, /href="\/sidhu\/seo\/image-diagnostics\/?"/);
  assert.doesNotMatch(html, /← SEO overview/);
  assert.doesNotMatch(html, /Detailed metadata report/);
  assert.doesNotMatch(html, /Detailed internal-link report/);
  assert.doesNotMatch(html, /Detailed image report/);
});

test("SEO Issues primary Run SEO Health action remains unchanged", () => {
  const html = renderToStaticMarkup(createElement(SeoHealthReport, { report: null }));
  assert.match(html, /Run SEO Health Check/);
  assert.match(html, /action="\/sidhu\/seo\/health\/"/);
  assert.match(html, /name="run"/);
  assert.match(html, /value="1"/);
  assert.match(html, /type="submit"/);
});

test("RelatedWorkspaces uses restrained dark Sidhu surfaces with light readable text", () => {
  const source = read("components/sidhu/ui/RelatedWorkspaces.tsx");
  assert.match(source, /bg-admin-sidebar/);
  assert.match(source, /text-white/);
  assert.match(source, /text-admin-sidebar-muted/);
  assert.match(source, /hover:bg-ink-soft/);
  assert.doesNotMatch(source, /bg-paper|text-brand hover:underline|gradient/);
});

test("ListActions preserve href/button semantics and distinct danger style", () => {
  const html = renderToStaticMarkup(
    createElement(
      ListActions,
      null,
      createElement(ListActionLink, { href: "/sidhu/blog/1/", variant: "quiet" } as never, "View"),
      createElement(ListActionLink, { href: "/sidhu/blog/1/", variant: "secondary" } as never, "Edit"),
      createElement(ListActionButton, { variant: "danger", type: "button" } as never, "Delete"),
    ),
  );
  assert.match(html, /<a[^>]+href="\/sidhu\/blog\/1\/?"/);
  assert.match(html, />View<\/a>/);
  assert.match(html, />Edit<\/a>/);
  assert.match(html, /<button[^>]*type="button"[^>]*>Delete<\/button>/);
  assert.match(html, /text-red-700/);
});

test("editor Sticky Save action remains primary button wording", () => {
  const html = renderToStaticMarkup(
    createElement(StickyEditorBar, {
      title: "Edit post",
      dirty: true,
      saving: false,
      onSave: () => undefined,
      saveLabel: "Save changes",
    }),
  );
  assert.match(html, /Save changes/);
  assert.match(html, /type="button"/);
});

test("Opportunities Research UK opportunities CTA remains primary and deliberate", () => {
  const html = renderToStaticMarkup(
    createElement(SeoOpportunitiesPanel, {
      proceedAction: async () => ({ ok: false as const, error: "unused" }),
      aiConfigured: true,
      researchAction: async () => ({
        ok: false as const,
        code: "unavailable" as const,
        error: "unused",
      }),
      gscProbeAction: async () => ({
        ok: false as const,
        code: "unauthorized" as const,
        error: "unused",
      }),
    }),
  );
  assert.match(html, /Research UK opportunities/);
  assert.doesNotMatch(html, /data-sidhu-related-workspaces/);
});

test("SEO diagnostic reports use RelatedWorkspaces instead of brand underline dumps", () => {
  for (const file of [
    "components/sidhu/MetadataDiagnosticsReport.tsx",
    "components/sidhu/InternalLinksReport.tsx",
    "components/sidhu/ImageDiagnosticsReport.tsx",
  ]) {
    const source = read(file);
    assert.match(source, /RelatedWorkspaces/);
    assert.doesNotMatch(source, /← SEO overview/);
    assert.doesNotMatch(source, /text-brand hover:underline/);
  }
});

test("SEO subnav includes Experiment Ledger and Planning after Opportunities", () => {
  assert.deepEqual(
    SIDHU_SEO_NAV.map((item) => item.id),
    [
      "overview",
      "issues",
      "opportunities",
      "ledger",
      "planning",
      "content",
      "metadata",
      "links",
      "media",
      "advanced",
    ],
  );
});

test("Phase 4A introduces no new API routes, packages, or GSC/OpenAI provider changes", () => {
  const pkg = JSON.parse(read("package.json")) as { dependencies: Record<string, string> };
  assert.ok(pkg.dependencies["google-auth-library"]);
  assert.equal(pkg.dependencies.googleapis, undefined);

  const health = read("components/sidhu/SeoHealthReport.tsx");
  assert.doesNotMatch(health, /querySearchAnalytics|google-auth-library|OPENAI_|fetch\(/);

  const related = read("components/sidhu/ui/RelatedWorkspaces.tsx");
  assert.doesNotMatch(related, /fetch\(|useEffect|setInterval/);
});

test("ModuleSubNav RSC boundary remains serializable (no function props in chrome)", () => {
  const chrome = read("components/sidhu/SeoModuleChrome.tsx");
  assert.doesNotMatch(chrome, /isActive=\{/);
  assert.match(chrome, /ModuleSubNav/);
});

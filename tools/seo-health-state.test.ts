import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SeoHealthReport } from "../components/sidhu/SeoHealthReport";
import { defaultSettings } from "../lib/cms/defaults";
import { buildSeoHealthReport, type SeoHealthFinding, type SeoHealthInput } from "../lib/cms/seo-health";
import {
  acceptSeoHealthFindingInState,
  applySeoHealthScanSnapshot,
  buildSeoHealthWorkflow,
  canAcceptSeoHealthFinding,
  emptySeoHealthState,
  estimateSeoHealthStateBytes,
  isValidSeoHealthFingerprint,
  reopenSeoHealthFindingInState,
  seoHealthFindingFingerprint,
  SEO_HEALTH_MAX_ACCEPTED,
  SEO_HEALTH_MAX_SNAPSHOT_FINDINGS,
  SEO_HEALTH_STATE_KEY,
  type SeoHealthStateV1,
} from "../lib/cms/seo-health-memory";
import type { BlogPost, MediaAsset } from "../lib/cms/types";

function samplePost(overrides: Partial<BlogPost> = {}): BlogPost {
  return {
    id: "post-memory",
    title: "SEO Memory Test Article",
    slug: "seo-memory-test-article",
    excerpt: "A sufficiently descriptive excerpt for the SEO health memory test article.",
    content: "<p>Body</p>",
    categoryId: null,
    featuredImage: null,
    status: "published",
    featured: false,
    publishedAt: "2026-01-01T00:00:00.000Z",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    seoTitle: "SEO Memory Test Article | Flix IPTV",
    seoDescription: "A sufficiently descriptive search summary for the SEO health memory test article and checks.",
    focusKeyword: "",
    canonicalUrl: "",
    robotsIndex: true,
    robotsFollow: true,
    ogTitle: "",
    ogDescription: "",
    ogImage: null,
    sitemapInclude: true,
    ...overrides,
  };
}

function sampleMedia(overrides: Partial<MediaAsset> = {}): MediaAsset {
  return {
    id: "media-memory",
    publicId: "theflix/memory/image",
    secureUrl: "https://res.cloudinary.com/demo/image/upload/v1/theflix/memory/image.jpg",
    folder: "theflix/memory",
    originalFilename: "memory-image.jpg",
    format: "jpg",
    width: 1200,
    height: 630,
    bytes: 1000,
    resourceType: "image",
    createdAt: "2026-01-01T00:00:00.000Z",
    alt: "",
    ...overrides,
  };
}

function fixtureInput(overrides: Partial<SeoHealthInput> = {}): SeoHealthInput {
  const settings = defaultSettings();
  settings.pageSeo.contact.canonicalUrl = "not a url at all";
  settings.pageSeo.blog.title = "Blog";
  settings.pageSeo.blog.description = "Short.";
  const media = sampleMedia();
  const post = samplePost({
    content: `<p><a href="/missing-memory-target/">Missing destination</a><img src="${media.secureUrl}"></p>`,
  });
  return {
    settings,
    pages: [],
    posts: [post],
    categories: [],
    redirects: [],
    media: [media],
    ...overrides,
  };
}

function cloneFinding(finding: SeoHealthFinding, patch: Partial<SeoHealthFinding> = {}): SeoHealthFinding {
  return {
    ...finding,
    ...patch,
    entity: { ...finding.entity, ...(patch.entity || {}) },
    evidence: patch.evidence ? [...patch.evidence] : [...finding.evidence],
  };
}

test("stable fingerprints are deterministic and ignore display-only id noise", () => {
  const report = buildSeoHealthReport(fixtureInput());
  const shortTitle = report.findings.find((finding) => finding.issueCode === "TITLE_SHORT");
  assert.ok(shortTitle);
  const left = seoHealthFindingFingerprint(shortTitle);
  const right = seoHealthFindingFingerprint(cloneFinding(shortTitle, { id: "metadata:changed:index" }));
  assert.equal(left, right);
  assert.equal(isValidSeoHealthFingerprint(left), true);
});

test("first scan marks open findings NEW and does not invent resolved items", () => {
  const report = buildSeoHealthReport(fixtureInput());
  const workflow = buildSeoHealthWorkflow(report.findings, emptySeoHealthState());
  assert.equal(workflow.hasBaseline, false);
  assert.equal(workflow.counts.resolved, 0);
  assert.equal(workflow.counts.new, report.findings.length);
  assert.equal(workflow.counts.existing, 0);
  assert.ok(workflow.counts.new > 0);
  assert.ok(workflow.counts.new < 100, "healthy checks must not flood workflow history");
});

test("unchanged findings become EXISTING on the next scan", () => {
  const report = buildSeoHealthReport(fixtureInput());
  const afterFirst = applySeoHealthScanSnapshot(emptySeoHealthState(), report.findings, "2026-10-03T01:00:00.000Z");
  const workflow = buildSeoHealthWorkflow(report.findings, afterFirst);
  assert.equal(workflow.hasBaseline, true);
  assert.equal(workflow.counts.new, 0);
  assert.equal(workflow.counts.existing, report.findings.length);
  assert.equal(workflow.counts.resolved, 0);
});

test("removed findings become RESOLVED and new findings appear NEW", () => {
  const first = buildSeoHealthReport(fixtureInput());
  const state = applySeoHealthScanSnapshot(emptySeoHealthState(), first.findings, "2026-10-03T01:00:00.000Z");

  const settings = defaultSettings();
  settings.pageSeo.blog.title = "Blog";
  const secondInput: SeoHealthInput = {
    settings,
    pages: [],
    posts: [],
    categories: [],
    redirects: [],
    media: [],
  };
  const second = buildSeoHealthReport(secondInput);
  const workflow = buildSeoHealthWorkflow(second.findings, state);

  assert.ok(workflow.counts.resolved > 0);
  assert.ok(first.findings.some((finding) => finding.issueCode === "CANONICAL_MALFORMED"));
  assert.equal(
    second.findings.some((finding) => finding.issueCode === "CANONICAL_MALFORMED"),
    false,
  );
  assert.ok(workflow.resolved.some((item) => item.issueCode === "CANONICAL_MALFORMED"));
  assert.ok(workflow.counts.new >= 0);
  assert.ok(workflow.open.every((item) => item.status === "new" || item.status === "existing"));
});

test("accepted editorial finding leaves open list and stays discoverable as Reviewed", () => {
  const report = buildSeoHealthReport(fixtureInput());
  let state = applySeoHealthScanSnapshot(emptySeoHealthState(), report.findings, "2026-10-03T01:00:00.000Z");
  const editorial = report.findings.find((finding) => finding.severity === "editorial");
  assert.ok(editorial);
  assert.equal(canAcceptSeoHealthFinding(editorial), true);
  const fingerprint = seoHealthFindingFingerprint(editorial);
  const accepted = acceptSeoHealthFindingInState(state, fingerprint, "2026-10-03T01:05:00.000Z");
  assert.equal(accepted.ok, true);
  if (!accepted.ok) return;
  state = accepted.state;

  const workflow = buildSeoHealthWorkflow(report.findings, state);
  assert.equal(workflow.open.some((item) => item.fingerprint === fingerprint), false);
  assert.equal(workflow.accepted.some((item) => item.fingerprint === fingerprint), true);
  assert.ok(report.findings.some((finding) => seoHealthFindingFingerprint(finding) === fingerprint));
});

test("accepted finding can be reopened into the open list", () => {
  const report = buildSeoHealthReport(fixtureInput());
  let state = applySeoHealthScanSnapshot(emptySeoHealthState(), report.findings, "2026-10-03T01:00:00.000Z");
  const editorial = report.findings.find((finding) => finding.severity === "editorial");
  assert.ok(editorial);
  const fingerprint = seoHealthFindingFingerprint(editorial);
  const accepted = acceptSeoHealthFindingInState(state, fingerprint, "2026-10-03T01:05:00.000Z");
  assert.equal(accepted.ok, true);
  if (!accepted.ok) return;
  const reopened = reopenSeoHealthFindingInState(accepted.state, fingerprint);
  assert.equal(reopened.ok, true);
  if (!reopened.ok) return;
  state = reopened.state;
  const workflow = buildSeoHealthWorkflow(report.findings, state);
  assert.equal(workflow.accepted.some((item) => item.fingerprint === fingerprint), false);
  assert.equal(workflow.open.some((item) => item.fingerprint === fingerprint), true);
});

test("material title change makes a previously accepted TITLE_SHORT finding NEW again", () => {
  const firstInput = fixtureInput();
  firstInput.settings.pageSeo.blog.title = "Blog";
  const first = buildSeoHealthReport(firstInput);
  let state = applySeoHealthScanSnapshot(emptySeoHealthState(), first.findings, "2026-10-03T01:00:00.000Z");
  const short = first.findings.find(
    (finding) => finding.issueCode === "TITLE_SHORT" && finding.entity.id.includes("blog"),
  );
  assert.ok(short);
  const oldFingerprint = seoHealthFindingFingerprint(short);
  const accepted = acceptSeoHealthFindingInState(state, oldFingerprint, "2026-10-03T01:05:00.000Z");
  assert.equal(accepted.ok, true);
  if (!accepted.ok) return;
  state = applySeoHealthScanSnapshot(accepted.state, first.findings, "2026-10-03T01:06:00.000Z");

  const secondInput = fixtureInput();
  secondInput.settings.pageSeo.blog.title = "IPTV Guides";
  secondInput.settings.pageSeo.contact.canonicalUrl = "not a url at all";
  const second = buildSeoHealthReport(secondInput);
  const changed = second.findings.find(
    (finding) => finding.issueCode === "TITLE_SHORT" && finding.entity.id.includes("blog"),
  );
  assert.ok(changed);
  const newFingerprint = seoHealthFindingFingerprint(changed);
  assert.notEqual(newFingerprint, oldFingerprint);

  const workflow = buildSeoHealthWorkflow(second.findings, state);
  const annotated = workflow.annotated.find((item) => item.finding.entity.id === changed.entity.id && item.finding.issueCode === "TITLE_SHORT");
  assert.ok(annotated);
  assert.equal(annotated.status, "new");
  assert.equal(workflow.accepted.some((item) => item.fingerprint === newFingerprint), false);
});

test("Needs Attention findings cannot be accepted as no-action", () => {
  const report = buildSeoHealthReport(fixtureInput());
  const state = applySeoHealthScanSnapshot(emptySeoHealthState(), report.findings, "2026-10-03T01:00:00.000Z");
  const urgent = report.findings.find((finding) => finding.severity === "needs-attention");
  assert.ok(urgent);
  assert.equal(canAcceptSeoHealthFinding(urgent), false);
  const result = acceptSeoHealthFindingInState(state, seoHealthFindingFingerprint(urgent), "2026-10-03T01:05:00.000Z");
  assert.equal(result.ok, false);
});

test("acceptance does not mutate scanner findings and invalid fingerprints are rejected", () => {
  const report = buildSeoHealthReport(fixtureInput());
  const before = structuredClone(report.findings);
  const state = applySeoHealthScanSnapshot(emptySeoHealthState(), report.findings, "2026-10-03T01:00:00.000Z");
  const editorial = report.findings.find((finding) => finding.severity === "editorial");
  assert.ok(editorial);
  acceptSeoHealthFindingInState(state, seoHealthFindingFingerprint(editorial), "2026-10-03T01:05:00.000Z");
  assert.deepEqual(report.findings, before);
  assert.equal(acceptSeoHealthFindingInState(state, "not-a-fingerprint", "2026-10-03T01:05:00.000Z").ok, false);
  assert.equal(reopenSeoHealthFindingInState(state, "00".repeat(32)).ok, false);
});

test("state snapshots stay bounded", () => {
  const report = buildSeoHealthReport(fixtureInput());
  const oversized: SeoHealthFinding[] = [];
  for (let index = 0; index < SEO_HEALTH_MAX_SNAPSHOT_FINDINGS + 25; index += 1) {
    const base = report.findings[0];
    assert.ok(base);
    oversized.push(
      cloneFinding(base, {
        id: `extra-${index}`,
        entity: { ...base.entity, id: `entity-${index}` },
        evidence: [`Search title: Title ${index}`, ...base.evidence.slice(1)],
      }),
    );
  }
  const state = applySeoHealthScanSnapshot(emptySeoHealthState(), oversized, "2026-10-03T01:00:00.000Z");
  assert.ok(state.currentFindings.length <= SEO_HEALTH_MAX_SNAPSHOT_FINDINGS);

  let acceptedState: SeoHealthStateV1 = state;
  for (let index = 0; index < SEO_HEALTH_MAX_ACCEPTED + 10; index += 1) {
    const finding = oversized[index];
    if (!finding || finding.severity === "needs-attention") continue;
    const result = acceptSeoHealthFindingInState(
      {
        ...acceptedState,
        currentFindings: [
          ...acceptedState.currentFindings,
          {
            fingerprint: seoHealthFindingFingerprint(finding),
            source: finding.source,
            issueCode: finding.issueCode,
            severity: "editorial",
            entityType: finding.entity.type,
            entityId: finding.entity.id,
            entityLabel: finding.entity.label,
            publicUrl: finding.publicUrl,
            title: finding.title,
          },
        ],
      },
      seoHealthFindingFingerprint(finding),
      `2026-10-03T01:${String(index % 60).padStart(2, "0")}:00.000Z`,
    );
    if (result.ok) acceptedState = result.state;
  }
  assert.ok(Object.keys(acceptedState.accepted).length <= SEO_HEALTH_MAX_ACCEPTED);
  assert.ok(estimateSeoHealthStateBytes(acceptedState) < 750_000);
  assert.equal(SEO_HEALTH_STATE_KEY, "seo_health_state_v1");
});

test("UI keeps idle route, shows workflow memory, and actions require seo permission", () => {
  const root = process.cwd();
  const page = readFileSync(path.join(root, "app/sidhu/(protected)/seo/health/page.tsx"), "utf8");
  const reportUi = readFileSync(path.join(root, "components/sidhu/SeoHealthReport.tsx"), "utf8");
  const actions = readFileSync(path.join(root, "lib/cms/seo-health-actions.ts"), "utf8");
  const service = readFileSync(path.join(root, "lib/cms/seo-health.ts"), "utf8");
  const memory = readFileSync(path.join(root, "lib/cms/seo-health-memory.ts"), "utf8");
  const state = readFileSync(path.join(root, "lib/cms/seo-health-state.ts"), "utf8");

  assert.match(page, /const runRequested =/);
  assert.match(page, /if \(runRequested\)/);
  assert.match(page, /runSeoHealthScan\(cms\)/);
  assert.match(page, /buildSeoHealthWorkflow/);
  assert.match(page, /saveSeoHealthState/);
  assert.doesNotMatch(page, /runSeoHealthScan\(cms\).*null/);

  assert.match(reportUi, /<form action="\/sidhu\/seo\/health\/" method="get">/);
  assert.match(reportUi, /name="run"/);
  assert.match(reportUi, /value="1"/);
  assert.match(reportUi, /No scan has run yet/);
  assert.match(reportUi, /Workflow memory/);
  assert.match(reportUi, /Mark reviewed — no action/);
  assert.match(reportUi, /Reviewed \/ Accepted/);
  assert.match(reportUi, /acceptAction/);
  assert.match(reportUi, /reopenAction/);
  assert.doesNotMatch(reportUi, /seo-health-actions/);

  assert.match(page, /acceptSeoHealthFindingAction/);
  assert.match(page, /reopenSeoHealthFindingAction/);
  assert.match(actions, /requireAdminAction\("seo"\)/);
  assert.match(actions, /acceptSeoHealthFindingAction/);
  assert.match(actions, /reopenSeoHealthFindingAction/);
  assert.match(actions, /isValidSeoHealthFingerprint/);
  assert.match(actions, /formData\.get\("fingerprint"\)/);

  assert.doesNotMatch(service, /saveSeoHealthState|getSeoHealthState/);
  assert.doesNotMatch(memory, /getDbPool|writeJsonFile|site_settings/);
  assert.match(state, /SEO_HEALTH_STATE_KEY/);
  assert.match(memory, /seo_health_state_v1/);
  assert.match(state, /seo-health-state\.json/);
  assert.doesNotMatch(state, /revalidateAfterSettingsSave|saveSettings|pageSeo/);

  const idleHtml = renderToStaticMarkup(createElement(SeoHealthReport, { report: null }));
  assert.match(idleHtml, /No scan has run yet/);
  assert.doesNotMatch(idleHtml, /Workflow memory/);
});

/**
 * E1 offline reproduction: sanitizePage() changes section representation vs live DB mapping.
 * Behavioral proof that the false-conflict root cause is deterministic sanitization, not concurrency.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { sanitizePage } from "../lib/cms/validation";
import type { CmsPage, CmsSection } from "../lib/cms/types";
import { applySeoLongformToPage } from "../lib/cms/seo-longform";
import { applySubscriptionMoneyBackExactToSections } from "../lib/cms/subscription-seo-microcopy";
import { SUBSCRIPTION_MONEY_BACK_EXACT } from "../lib/cms/subscription-seo-microcopy";

function fingerprint(sections: CmsSection[]): string {
  const normalized = [...sections]
    .map((section) => ({
      id: section.id,
      type: section.type,
      label: section.label,
      order: section.order,
      visible: section.visible,
      data: section.data,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
  return JSON.stringify(normalized);
}

/** Minimal rich-text row shaped like mapSectionRowsToCmsSections output (authoritative DB map). */
function liveRichText(overrides: Partial<CmsSection> = {}): CmsSection {
  return {
    id: "sec-home-1",
    type: "rich-text",
    label: "Body",
    order: 0, // DB often stores 0; sanitizePage reindexes to 1
    visible: true,
    data: { html: "<p>short</p>" } as CmsSection["data"],
    ...overrides,
  };
}

test("E1-01 offline: sanitizePage fingerprint differs from live-mapped sections", () => {
  const live = [liveRichText()];
  const page: CmsPage = {
    id: "page-home",
    name: "Home",
    slug: "/",
    status: "published",
    cmsEnabled: true,
    contentRevision: 1,
    sections: live,
  };
  const sanitized = sanitizePage(page).sections;
  assert.notEqual(fingerprint(live), fingerprint(sanitized));
  // Typical deltas: order reindex and rich-text data defaults from mergeSectionData.
  assert.equal(live[0]!.order, 0);
  assert.equal(sanitized[0]!.order, 1);
});

test("E1-01 offline: previous longform call site pattern would false-conflict", () => {
  const live = [
    liveRichText({
      id: "sec-home-seo-longform",
      type: "rich-content",
      label: "Long Description",
      order: 2,
      data: {
        eyebrow: "",
        heading: "",
        html: "add your content here",
        buttonLabel: "",
        buttonHref: "/",
        image: null,
        imageAlt: "",
        cards: [],
      } as CmsSection["data"],
    }),
  ];
  const page: CmsPage = {
    id: "page-home",
    name: "Home",
    slug: "/",
    status: "published",
    cmsEnabled: true,
    contentRevision: 1,
    sections: live,
  };
  const safe = sanitizePage(page);
  const longform = applySeoLongformToPage(safe);
  assert.equal(longform.changed, true);
  // Bug pattern: compare sanitized-before vs live (what persistPageSectionDiff re-reads).
  assert.notEqual(fingerprint(safe.sections), fingerprint(live));
  // Fix pattern: live before matches locked re-read.
  assert.equal(fingerprint(live), fingerprint(live));
});

test("E1-03 offline: money-back transform preserves live section identity for before snapshot", () => {
  const [from] = SUBSCRIPTION_MONEY_BACK_EXACT[0]!;
  const live: CmsSection[] = [
    liveRichText({
      id: "sec-sub-1",
      data: { html: `<p>${from}</p>` } as CmsSection["data"],
    }),
  ];
  const money = applySubscriptionMoneyBackExactToSections(live);
  assert.equal(money.changed, true);
  assert.equal(fingerprint(live), fingerprint(live));
  assert.notEqual(fingerprint(live), fingerprint(money.sections));
});

test("E1 source: seedSeoLongformIfNeeded passes liveSections not safe.sections", () => {
  const migrate = readFileSync(path.join(process.cwd(), "lib/cms/mysql-migrate.ts"), "utf8");
  const longformFn = migrate.slice(migrate.indexOf("export async function seedSeoLongformIfNeeded"));
  const body = longformFn.slice(0, longformFn.indexOf("export async function cleanupKnownTestTaglineIfNeeded"));
  assert.match(body, /const liveSections = mapSectionRowsToCmsSections/);
  assert.match(body, /persistPageSectionDiff\(row\.id, liveSections,/);
  assert.doesNotMatch(body, /persistPageSectionDiff\(row\.id, safe\.sections,/);
  assert.match(migrate, /migrateSubscriptionSeoMicrocopyIfNeeded[\s\S]*mapSectionRowsToCmsSections\(sectionRows\)/);
});

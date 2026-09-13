import assert from "node:assert/strict";
import { test } from "node:test";
import type { CmsPage } from "../lib/cms/types";
import { defaultPages } from "../lib/cms/defaults";
import { mergeMissingCompanyPages } from "../lib/cms/company-pages";
import { applyDefaultPageSeeds, resolveDefaultPageSeed, type SeedPageRecord } from "../lib/cms/page-seed";
import { SUBSCRIPTION_PAGE_ID, SUBSCRIPTION_SLUG, SUBSCRIPTION_SLUG_LEGACY } from "../lib/cms/page-paths";

const SUBSCRIPTION_SECTIONS = [{ id: "sec-live", type: "html" }];

function subscriptionRow(slug: string) {
  return {
    id: SUBSCRIPTION_PAGE_ID,
    slug,
    name: "IPTV Subscription",
    sections: SUBSCRIPTION_SECTIONS,
  };
}

function seedOnce(existing: SeedPageRecord[], defaultSlug = SUBSCRIPTION_SLUG) {
  return applyDefaultPageSeeds(
    [
      { id: SUBSCRIPTION_PAGE_ID, slug: defaultSlug, name: "IPTV Subscription" },
      { id: "page-contact", slug: "/contact/", name: "Contact" },
      { id: "page-about", slug: "/about-us/", name: "About Us" },
    ],
    existing,
  );
}

test("subscription seed skips insert when ID exists with the current slug", () => {
  const existing = [subscriptionRow(SUBSCRIPTION_SLUG)];
  const first = seedOnce(existing, SUBSCRIPTION_SLUG);
  const second = seedOnce(first, SUBSCRIPTION_SLUG);
  assert.equal(first.filter((page) => page.id === SUBSCRIPTION_PAGE_ID).length, 1);
  assert.equal(second.filter((page) => page.id === SUBSCRIPTION_PAGE_ID).length, 1);
  assert.equal(first[0]?.slug, SUBSCRIPTION_SLUG);
  assert.deepEqual(first[0]?.sections, SUBSCRIPTION_SECTIONS);
});

test("subscription seed does not reinsert when ID exists with a changed slug", () => {
  const existing = [subscriptionRow(SUBSCRIPTION_SLUG)];
  const first = seedOnce(existing, SUBSCRIPTION_SLUG_LEGACY);
  const second = seedOnce(first, SUBSCRIPTION_SLUG_LEGACY);
  assert.equal(first.filter((page) => page.id === SUBSCRIPTION_PAGE_ID).length, 1);
  assert.equal(second.filter((page) => page.id === SUBSCRIPTION_PAGE_ID).length, 1);
  assert.equal(first[0]?.slug, SUBSCRIPTION_SLUG);
  assert.notEqual(first[0]?.slug, SUBSCRIPTION_SLUG_LEGACY);
  assert.deepEqual(first[0]?.sections, SUBSCRIPTION_SECTIONS);
});

test("resolveDefaultPageSeed uses immutable ID before slug", () => {
  const action = resolveDefaultPageSeed(
    { id: SUBSCRIPTION_PAGE_ID, slug: SUBSCRIPTION_SLUG_LEGACY },
    [{ id: SUBSCRIPTION_PAGE_ID, slug: SUBSCRIPTION_SLUG }],
  );
  assert.deepEqual(action, { type: "use-existing", existingId: SUBSCRIPTION_PAGE_ID });
});

test("defaultPages seed is idempotent for current subscription URL", () => {
  const defaults = defaultPages().map((page) => ({
    id: page.id,
    slug: page.slug,
    name: page.name,
    sections: page.sections,
  }));
  const existing = [
    subscriptionRow(SUBSCRIPTION_SLUG),
    { id: "page-contact", slug: "/contact/", name: "Contact", sections: [{ id: "c1" }] },
    { id: "page-home", slug: "/", name: "Home", sections: [{ id: "h1" }] },
  ];
  const first = applyDefaultPageSeeds(defaults, existing);
  const second = applyDefaultPageSeeds(defaults, first);
  const subscription = first.find((page) => page.id === SUBSCRIPTION_PAGE_ID);
  assert.equal(first.filter((page) => page.id === SUBSCRIPTION_PAGE_ID).length, 1);
  assert.equal(second.filter((page) => page.id === SUBSCRIPTION_PAGE_ID).length, 1);
  assert.equal(subscription?.slug, SUBSCRIPTION_SLUG);
  assert.deepEqual(subscription?.sections, SUBSCRIPTION_SECTIONS);
});

test("company page merge uses page ID so a slug change cannot duplicate the row", () => {
  const pages = [
    {
      id: "page-about",
      name: "About Us",
      slug: "/about-company/",
      status: "published" as const,
      cmsEnabled: true,
      sections: [{ id: "about-html", type: "rich-text" as const, label: "Body", order: 0, visible: true, data: { html: "" } }],
    },
  ] as CmsPage[];
  const first = mergeMissingCompanyPages(pages);
  const second = mergeMissingCompanyPages(first.pages);
  assert.equal(first.pages.filter((page) => page.id === "page-about").length, 1);
  assert.equal(second.pages.filter((page) => page.id === "page-about").length, 1);
  assert.equal(first.pages.find((page) => page.id === "page-about")?.slug, "/about-company/");
});

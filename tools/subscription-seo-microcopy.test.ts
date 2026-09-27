import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { defaultSettings } from "../lib/cms/defaults";
import { SUBSCRIPTION_PAGE_ID } from "../lib/cms/page-paths";
import { SUBSCRIPTION_SEO_MICROCOPY_V1, runCompletedMigrationOnce } from "../lib/cms/migration-flags";
import {
  SUBSCRIPTION_SEO_META_AFTER,
  SUBSCRIPTION_SEO_META_BEFORE,
  SUBSCRIPTION_SEO_TITLE_AFTER,
  SUBSCRIPTION_SEO_TITLE_BEFORE,
  applyExactFieldUpdate,
  applySubscriptionMoneyBackExactToFaqs,
  applySubscriptionMoneyBackExactToPage,
  applySubscriptionSeoMicrocopyToSettings,
  applySubscriptionSeoTitleRepair,
  hasBroadMoneyBackClaim,
} from "../lib/cms/subscription-seo-microcopy";
import type { CmsPage, CmsSection, FaqItem, SiteSettings } from "../lib/cms/types";

function memoryFlags() {
  const flags = new Set<string>();
  return {
    flags,
    hasCompleted: async (key: string) => flags.has(key),
    markCompleted: async (key: string) => {
      flags.add(key);
    },
  };
}

function sampleFaq(partial: Partial<FaqItem> & Pick<FaqItem, "id" | "question" | "answer">): FaqItem {
  return {
    category: "Subscription",
    sortOrder: 1,
    visible: true,
    createdAt: "",
    updatedAt: "",
    ...partial,
  };
}

function samplePage(sections: CmsSection[]): CmsPage {
  return {
    id: SUBSCRIPTION_PAGE_ID,
    name: "IPTV Subscription",
    slug: "/iptv-subscription-uk/",
    status: "published",
    cmsEnabled: true,
    sections,
  };
}

test("expected current title → updated", () => {
  const settings = defaultSettings();
  settings.pageSeo.subscriptions.title = SUBSCRIPTION_SEO_TITLE_BEFORE;
  settings.pageSeo.subscriptions.description = "custom keep";
  const result = applySubscriptionSeoMicrocopyToSettings(settings);
  assert.equal(result.titleResult, "updated");
  assert.equal(result.settings.pageSeo.subscriptions.title, SUBSCRIPTION_SEO_TITLE_AFTER);
  assert.equal(result.settings.pageSeo.subscriptions.description, "custom keep");
  assert.equal(result.changed, true);
});

test("custom/different title → NOT overwritten", () => {
  const settings = defaultSettings();
  settings.pageSeo.subscriptions.title = "Custom Subscription Title | Flix IPTV";
  settings.pageSeo.subscriptions.description = SUBSCRIPTION_SEO_META_BEFORE;
  const result = applySubscriptionSeoMicrocopyToSettings(settings);
  assert.equal(result.titleResult, "skipped_mismatch");
  assert.equal(result.settings.pageSeo.subscriptions.title, "Custom Subscription Title | Flix IPTV");
  assert.equal(result.descriptionResult, "updated");
  assert.equal(result.settings.pageSeo.subscriptions.description, SUBSCRIPTION_SEO_META_AFTER);
});

test("expected old meta → updated", () => {
  const result = applyExactFieldUpdate(
    SUBSCRIPTION_SEO_META_BEFORE,
    SUBSCRIPTION_SEO_META_BEFORE,
    SUBSCRIPTION_SEO_META_AFTER,
  );
  assert.equal(result.result, "updated");
  assert.equal(result.value, SUBSCRIPTION_SEO_META_AFTER);
});

test("custom/different meta → NOT overwritten", () => {
  const settings = defaultSettings();
  settings.pageSeo.subscriptions.title = SUBSCRIPTION_SEO_TITLE_BEFORE;
  settings.pageSeo.subscriptions.description = "Completely custom meta written by editor.";
  const result = applySubscriptionSeoMicrocopyToSettings(settings);
  assert.equal(result.descriptionResult, "skipped_mismatch");
  assert.equal(result.settings.pageSeo.subscriptions.description, "Completely custom meta written by editor.");
  assert.equal(result.titleResult, "updated");
});

test("repeated migration idempotent", async () => {
  const store = memoryFlags();
  let runs = 0;
  const run = async () => {
    runs += 1;
  };
  assert.equal(
    await runCompletedMigrationOnce({
      flagKey: SUBSCRIPTION_SEO_MICROCOPY_V1,
      hasCompleted: store.hasCompleted,
      markCompleted: store.markCompleted,
      run,
    }),
    "ran",
  );
  assert.equal(
    await runCompletedMigrationOnce({
      flagKey: SUBSCRIPTION_SEO_MICROCOPY_V1,
      hasCompleted: store.hasCompleted,
      markCompleted: store.markCompleted,
      run,
    }),
    "skipped",
  );
  assert.equal(runs, 1);
  assert.equal(store.flags.has(SUBSCRIPTION_SEO_MICROCOPY_V1), true);
});

test("failure → completion flag absent", async () => {
  const store = memoryFlags();
  await assert.rejects(
    () =>
      runCompletedMigrationOnce({
        flagKey: SUBSCRIPTION_SEO_MICROCOPY_V1,
        hasCompleted: store.hasCompleted,
        markCompleted: store.markCompleted,
        run: async () => {
          throw new Error("microcopy failed");
        },
      }),
    /microcopy failed/,
  );
  assert.equal(store.flags.has(SUBSCRIPTION_SEO_MICROCOPY_V1), false);
});

test("correct money-back text untouched", () => {
  const compliant =
    "Choose a plan, message us on WhatsApp, then receive payment details and setup from our team. Try the service with confidence. Eligible 1 Year plans and above include a 7-day money-back guarantee.";
  const page = samplePage([
    {
      id: "sec-sub-how",
      type: "how-it-works",
      label: "How It Works",
      order: 1,
      visible: true,
      data: { eyebrow: "", heading: "How to get started", description: compliant, steps: [] },
    },
  ]);
  const result = applySubscriptionMoneyBackExactToPage(page);
  assert.equal(result.changed, false);
  assert.equal((result.page.sections[0].data as { description: string }).description, compliant);
  assert.equal(hasBroadMoneyBackClaim(compliant), false);
});

test("known broad money-back text safely corrected", () => {
  const broad =
    "We offer a 7-Day Money Back Guarantee. If the service is not suitable, contact us on WhatsApp within the applicable 7-day period.";
  const faqs = [sampleFaq({ id: "faq-refund", question: "Do you offer a refund or trial?", answer: broad })];
  const result = applySubscriptionMoneyBackExactToFaqs(faqs);
  assert.equal(result.changed, true);
  assert.equal(result.updatedIds[0], "faq-refund");
  assert.match(result.faqs[0].answer, /eligible 1 Year plans and above/i);
  assert.doesNotMatch(result.faqs[0].answer, /applicable 7-day period/);

  const page = samplePage([
    {
      id: "sec-sub-longform",
      type: "rich-content",
      label: "Longform",
      order: 1,
      visible: true,
      data: {
        eyebrow: "",
        heading: "Guide",
        html: "<h2>7-Day Money Back Guarantee</h2><p>Details</p>",
        buttonLabel: "",
        buttonHref: "",
        width: "normal",
        scrollable: true,
        scrollHeight: "tall",
        ctaSource: "whatsapp",
      },
    },
  ]);
  const pageResult = applySubscriptionMoneyBackExactToPage(page);
  assert.equal(pageResult.changed, true);
  assert.match(String((pageResult.page.sections[0].data as { html: string }).html), /eligible 1 Year plans and above/i);
});

test("unrelated content untouched", () => {
  const settings = defaultSettings() as SiteSettings;
  settings.pageSeo.home.title = "IPTV Providers UK | Firestick & Smart TV | Flix IPTV";
  settings.pageSeo.home.description = "Home meta stays.";
  settings.pageSeo.subscriptions.title = SUBSCRIPTION_SEO_TITLE_BEFORE;
  settings.pageSeo.subscriptions.description = SUBSCRIPTION_SEO_META_BEFORE;
  const result = applySubscriptionSeoMicrocopyToSettings(settings);
  assert.equal(result.settings.pageSeo.home.title, "IPTV Providers UK | Firestick & Smart TV | Flix IPTV");
  assert.equal(result.settings.pageSeo.home.description, "Home meta stays.");
  assert.equal(result.settings.pageSeo.subscriptions.title, SUBSCRIPTION_SEO_TITLE_AFTER);

  const otherPage: CmsPage = {
    id: "page-home",
    name: "Home",
    slug: "/",
    status: "published",
    cmsEnabled: true,
    sections: [
      {
        id: "sec-home",
        type: "rich-text",
        label: "Intro",
        order: 1,
        visible: true,
        data: {
          heading: "",
          html: "<p>We offer a 7-Day Money Back Guarantee. If the service is not suitable, contact us on WhatsApp within the applicable 7-day period.</p>",
        },
      },
    ],
  };
  const homeResult = applySubscriptionMoneyBackExactToPage(otherPage);
  assert.equal(homeResult.changed, false);
});

test("prices untouched by microcopy helpers", () => {
  const page = samplePage([
    {
      id: "sec-sub-pricing",
      type: "pricing",
      label: "Pricing",
      order: 1,
      visible: true,
      data: {
        eyebrow: "",
        heading: "Simple, Transparent Pricing",
        description: "Choose the streaming package that best suits your needs.",
        useCentralPlans: true,
        plans: [
          {
            id: "plan-1",
            name: "1 Month Plan",
            price: "14.99",
            duration: "/ month",
            badge: "",
            popular: false,
            features: ["Live TV"],
            buttonLabel: "Choose Plan",
            buttonHref: "/contact/",
          },
        ],
      },
    },
  ]);
  const result = applySubscriptionMoneyBackExactToPage(page);
  assert.equal(result.changed, false);
  assert.equal((result.page.sections[0].data as { plans: Array<{ price: string }> }).plans[0].price, "14.99");
});

test("H1 / hero heading field not rewritten by SEO title helper", () => {
  const settings = defaultSettings();
  settings.pageSeo.subscriptions.title = SUBSCRIPTION_SEO_TITLE_BEFORE;
  const result = applySubscriptionSeoMicrocopyToSettings(settings);
  const page = samplePage([
    {
      id: "sec-sub-hero",
      type: "page-hero",
      label: "Page Hero",
      order: 1,
      visible: true,
      data: {
        eyebrow: "UK IPTV subscriptions",
        heading: "IPTV Subscription for UK Viewers",
        highlight: "",
        description: "Watch live TV and on-demand entertainment.",
      },
    },
  ]);
  const money = applySubscriptionMoneyBackExactToPage(page);
  assert.equal((money.page.sections[0].data as { heading: string }).heading, "IPTV Subscription for UK Viewers");
  assert.equal(result.settings.pageSeo.subscriptions.canonicalUrl, settings.pageSeo.subscriptions.canonicalUrl);
});

test("URL/canonical untouched", () => {
  const settings = defaultSettings();
  settings.pageSeo.subscriptions.title = SUBSCRIPTION_SEO_TITLE_BEFORE;
  settings.pageSeo.subscriptions.description = SUBSCRIPTION_SEO_META_BEFORE;
  settings.pageSeo.subscriptions.canonicalUrl = "/iptv-subscription-uk/";
  const result = applySubscriptionSeoMicrocopyToSettings(settings);
  assert.equal(result.settings.pageSeo.subscriptions.canonicalUrl, "/iptv-subscription-uk/");
  assert.equal(result.settings.pageSeo.subscriptions.robotsIndex, true);
  assert.equal(result.settings.pageSeo.subscriptions.robotsFollow, true);
});

test("title repair recognizes Firestick title with any pound glyph", () => {
  const seo = defaultSettings().pageSeo.subscriptions;
  seo.title = "Best IPTV Subscription UK for Firestick | From £14.99 | Flix IPTV";
  const a = applySubscriptionSeoTitleRepair(seo);
  assert.equal(a.changed, true);
  assert.equal(a.seo.title, SUBSCRIPTION_SEO_TITLE_AFTER);

  seo.title = "Best IPTV Subscription UK for Firestick | From \u00A314.99 | Flix IPTV";
  assert.equal(applySubscriptionSeoTitleRepair(seo).changed, true);

  seo.title = "Custom editor title";
  const skipped = applySubscriptionSeoTitleRepair(seo);
  assert.equal(skipped.changed, false);
  assert.equal(skipped.skipped, true);
});

test("ensureReady wires subscription SEO microcopy after tagline cleanup", () => {
  const source = readFileSync(path.join(process.cwd(), "lib/cms/mysql-repository.ts"), "utf8");
  assert.match(source, /migrateSubscriptionSeoMicrocopyIfNeeded/);
  const migrate = readFileSync(path.join(process.cwd(), "lib/cms/mysql-migrate.ts"), "utf8");
  assert.match(migrate, /SUBSCRIPTION_SEO_MICROCOPY_V1/);
  assert.match(migrate, /SUBSCRIPTION_SEO_MICROCOPY_V2/);
  assert.match(migrate, /applySubscriptionSeoMicrocopyToSettings/);
  assert.match(migrate, /applySubscriptionSeoTitleRepair/);
  const flags = readFileSync(path.join(process.cwd(), "lib/cms/migration-flags.ts"), "utf8");
  assert.match(flags, /subscription_seo_microcopy_v1/);
  assert.match(flags, /subscription_seo_microcopy_v2/);
});

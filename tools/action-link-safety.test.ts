import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveServicesCardHref } from "../components/sections/Services";
import { createDefaultSectionData, defaultSettings } from "../lib/cms/defaults";
import { builtInRedirectDestination } from "../lib/cms/internal-links";
import { lockedSlugForPageId } from "../lib/cms/page-paths";
import type {
  CtaData,
  HeroData,
  PricingData,
  PricingPlan,
  RichContentData,
} from "../lib/cms/types";
import {
  sanitizeHref,
  sanitizeNavHref,
  sanitizeOptionalActionHref,
  sanitizePage,
  sanitizePricingPlan,
  sanitizeRequiredActionHref,
  sanitizeSettings,
} from "../lib/cms/validation";
import { isBrowseCtaLabel, isSalesCtaLabel, resolveBrowseHref, resolveSalesHref } from "../lib/cms/whatsapp-messages";

const SUB = "/iptv-subscription-uk/";
const CONTACT = "/contact/";

function sanitizeHero(data: Partial<HeroData>): HeroData {
  const page = sanitizePage({
    id: "page-test-hero",
    name: "Hero test",
    slug: "/hero-test/",
    status: "published",
    cmsEnabled: true,
    sections: [
      {
        id: "sec-hero",
        type: "hero",
        label: "Hero",
        order: 1,
        visible: true,
        data: { ...createDefaultSectionData("hero"), ...data } as HeroData,
      },
    ],
  });
  return page.sections[0]?.data as HeroData;
}

function sanitizeCta(buttonHref: string): CtaData {
  const page = sanitizePage({
    id: "page-test-cta",
    name: "CTA test",
    slug: "/cta-test/",
    status: "published",
    cmsEnabled: true,
    sections: [
      {
        id: "sec-cta",
        type: "cta",
        label: "CTA",
        order: 1,
        visible: true,
        data: { ...createDefaultSectionData("cta"), buttonHref } as CtaData,
      },
    ],
  });
  return page.sections[0]?.data as CtaData;
}

function sanitizeInlinePricing(buttonHref: string): PricingData {
  const base = createDefaultSectionData("pricing") as PricingData;
  const page = sanitizePage({
    id: "page-test-pricing",
    name: "Pricing test",
    slug: "/pricing-test/",
    status: "published",
    cmsEnabled: true,
    sections: [
      {
        id: "sec-pricing",
        type: "pricing",
        label: "Pricing",
        order: 1,
        visible: true,
        data: {
          ...base,
          useCentralPlans: false,
          plans: base.plans.map((plan, index) =>
            index === 0 ? { ...plan, buttonHref } : plan,
          ),
        },
      },
    ],
  });
  return page.sections[0]?.data as PricingData;
}

function sanitizeRich(buttonHref: string): RichContentData {
  const page = sanitizePage({
    id: "page-test-rich",
    name: "Rich test",
    slug: "/rich-test/",
    status: "published",
    cmsEnabled: true,
    sections: [
      {
        id: "sec-rich",
        type: "rich-content",
        label: "Rich",
        order: 1,
        visible: true,
        data: {
          ...createDefaultSectionData("rich-content"),
          buttonLabel: "Learn more",
          buttonHref,
          ctaSource: "custom",
        } as RichContentData,
      },
    ],
  });
  return page.sections[0]?.data as RichContentData;
}

test("required action helper maps blank/invalid/root to fallback", () => {
  assert.equal(sanitizeRequiredActionHref("", CONTACT), CONTACT);
  assert.equal(sanitizeRequiredActionHref("   ", CONTACT), CONTACT);
  assert.equal(sanitizeRequiredActionHref("/", CONTACT), CONTACT);
  assert.equal(sanitizeRequiredActionHref("javascript:alert(1)", CONTACT), CONTACT);
  assert.equal(sanitizeRequiredActionHref("random-invalid-value", CONTACT), CONTACT);
  assert.equal(sanitizeRequiredActionHref("/blogs/", CONTACT), "/blogs/");
});

test("optional action helper maps blank/invalid/root to empty", () => {
  assert.equal(sanitizeOptionalActionHref(""), "");
  assert.equal(sanitizeOptionalActionHref("   "), "");
  assert.equal(sanitizeOptionalActionHref("/"), "");
  assert.equal(sanitizeOptionalActionHref("javascript:alert(1)"), "");
  assert.equal(sanitizeOptionalActionHref("data:text/html,x"), "");
  assert.equal(sanitizeOptionalActionHref("/about-us/"), "/about-us/");
});

test("header CTA uses subscription fallback for blank/invalid/root", () => {
  for (const href of ["", "   ", "/", "javascript:alert(1)", "not-a-url"]) {
    const settings = sanitizeSettings({ ...defaultSettings(), headerCtaHref: href });
    assert.equal(settings.headerCtaHref, SUB);
  }
  const kept = sanitizeSettings({ ...defaultSettings(), headerCtaHref: CONTACT });
  assert.equal(kept.headerCtaHref, CONTACT);
});

test("hero primary/secondary blank invalid root fall back to subscription", () => {
  const blank = sanitizeHero({ primaryHref: "", secondaryHref: "" });
  assert.equal(blank.primaryHref, SUB);
  assert.equal(blank.secondaryHref, SUB);

  const root = sanitizeHero({ primaryHref: "/", secondaryHref: "/" });
  assert.equal(root.primaryHref, SUB);
  assert.equal(root.secondaryHref, SUB);

  const unsafe = sanitizeHero({
    primaryHref: "javascript:alert(1)",
    secondaryHref: "data:text/html,x",
  });
  assert.equal(unsafe.primaryHref, SUB);
  assert.equal(unsafe.secondaryHref, SUB);
  assert.doesNotMatch(unsafe.primaryHref, /^javascript:/i);
  assert.doesNotMatch(unsafe.secondaryHref, /^data:/i);

  const kept = sanitizeHero({ primaryHref: CONTACT, secondaryHref: "/blogs/" });
  assert.equal(kept.primaryHref, CONTACT);
  assert.equal(kept.secondaryHref, "/blogs/");
});

test("hero sales and browse runtime overrides remain intact", () => {
  assert.equal(isSalesCtaLabel("Get Started"), true);
  assert.equal(isBrowseCtaLabel("View Plans"), true);
  assert.equal(
    resolveSalesHref("Get Started", SUB, "https://wa.me/123"),
    "https://wa.me/123",
  );
  assert.equal(resolveBrowseHref("View Plans", SUB), "#pricing");
});

test("CTA section blank invalid root fall back to /contact/", () => {
  assert.equal(sanitizeCta("").buttonHref, CONTACT);
  assert.equal(sanitizeCta("/").buttonHref, CONTACT);
  assert.equal(sanitizeCta("javascript:alert(1)").buttonHref, CONTACT);
  assert.equal(sanitizeCta(SUB).buttonHref, SUB);
});

test("inline pricing blank invalid root fall back to /contact/", () => {
  assert.equal(sanitizeInlinePricing("").plans[0]?.buttonHref, CONTACT);
  assert.equal(sanitizeInlinePricing("/").plans[0]?.buttonHref, CONTACT);
  assert.equal(sanitizeInlinePricing("bad-value").plans[0]?.buttonHref, CONTACT);
  assert.equal(sanitizeInlinePricing(SUB).plans[0]?.buttonHref, SUB);
});

test("central PricingPlan blank invalid root fall back to /contact/", () => {
  const now = new Date().toISOString();
  const base: PricingPlan = {
    id: "plan-x",
    name: "Plan",
    slug: "plan-x",
    price: "14.99",
    duration: "/ month",
    badge: "",
    popular: false,
    features: ["One"],
    buttonLabel: "Choose Plan",
    buttonHref: "/",
    sortOrder: 1,
    active: true,
    createdAt: now,
    updatedAt: now,
  };
  assert.equal(sanitizePricingPlan({ ...base, buttonHref: "" }).buttonHref, CONTACT);
  assert.equal(sanitizePricingPlan({ ...base, buttonHref: "/" }).buttonHref, CONTACT);
  assert.equal(sanitizePricingPlan({ ...base, buttonHref: "javascript:x" }).buttonHref, CONTACT);
  assert.equal(sanitizePricingPlan({ ...base, buttonHref: SUB }).buttonHref, SUB);
});

test("rich content optional CTA blank invalid root become empty", () => {
  assert.equal(sanitizeRich("").buttonHref, "");
  assert.equal(sanitizeRich("   ").buttonHref, "");
  assert.equal(sanitizeRich("/").buttonHref, "");
  assert.equal(sanitizeRich("javascript:alert(1)").buttonHref, "");
  assert.equal(sanitizeRich(CONTACT).buttonHref, CONTACT);
  const omitted = sanitizeRich("/");
  assert.equal(omitted.buttonHref, "");
  assert.equal(Boolean(omitted.buttonLabel && omitted.buttonHref), false);
});

test("protected global nav services and root redirect behavior unchanged", () => {
  assert.equal(sanitizeHref(""), "/");
  assert.equal(sanitizeHref("/"), "/");
  assert.equal(sanitizeNavHref("/"), "/welcome/");
  assert.equal(resolveServicesCardHref("/"), "/welcome/");
  assert.equal(builtInRedirectDestination("/"), "/welcome/");
  assert.equal(lockedSlugForPageId("page-home"), "/");
});

test("existing editor defaults remain sensible", () => {
  assert.equal(defaultSettings().headerCtaHref, SUB);
  const hero = createDefaultSectionData("hero") as HeroData;
  assert.equal(hero.primaryHref, SUB);
  assert.equal(hero.secondaryHref, SUB);
  assert.equal((createDefaultSectionData("cta") as CtaData).buttonHref, CONTACT);
  assert.equal((createDefaultSectionData("pricing") as PricingData).plans[0]?.buttonHref, CONTACT);
  assert.equal((createDefaultSectionData("rich-content") as RichContentData).buttonHref, "");
});

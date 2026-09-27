import type { CmsPage, CmsSection, FaqItem, PageSeo, SiteSettings } from "@/lib/cms/types";
import { SUBSCRIPTION_PAGE_ID } from "@/lib/cms/page-paths";

/** Exact live/CMS SEO title before F4 (must match character-for-character). */
export const SUBSCRIPTION_SEO_TITLE_BEFORE =
  "Best IPTV Subscription UK for Firestick | From £14.99 | Flix IPTV";

export const SUBSCRIPTION_SEO_TITLE_AFTER = "Best IPTV Subscription UK | From £14.99 | Flix IPTV";

export const SUBSCRIPTION_SEO_META_BEFORE =
  "Get a premium IPTV subscription in the UK with HD & 4K streaming, reliable service, 24/7 support and free trials subject to availability. Join Flix IPTV & start watching today.";

export const SUBSCRIPTION_SEO_META_AFTER =
  "Get an IPTV subscription in the UK with HD & 4K streaming, flexible plans from £14.99, reliable service and 24/7 support.";

/** Known broad money-back phrases → eligible 1 Year+ wording (exact match only). */
export const SUBSCRIPTION_MONEY_BACK_EXACT: Array<[string, string]> = [
  [
    "We offer a 7-Day Money Back Guarantee. If the service is not suitable, contact us on WhatsApp within the applicable 7-day period.",
    "We offer a 7-day money-back guarantee on eligible 1 Year plans and above. If the service is not suitable, contact us on WhatsApp within 7 days.",
  ],
  [
    "A 7-Day Money Back Guarantee. If the service is not suitable, contact us on WhatsApp within the applicable 7-day period.",
    "A 7-day money-back guarantee on eligible 1 Year plans and above. If the service is not suitable, contact us on WhatsApp within 7 days.",
  ],
  [
    "<h2>7-Day Money Back Guarantee</h2>",
    "<h2>7-day money-back guarantee on eligible 1 Year plans and above</h2>",
  ],
  [
    "Choose a plan, message us on WhatsApp, then receive payment details and setup from our team. Try the service with confidence. If it is not suitable, contact us on WhatsApp within the applicable 7-day guarantee period.",
    "Choose a plan, message us on WhatsApp, then receive payment details and setup from our team. Try the service with confidence. Eligible 1 Year plans and above include a 7-day money-back guarantee.",
  ],
  [
    "A UK-focused streaming service with a 7-Day Money Back Guarantee if it is not the right fit.",
    "A UK-focused streaming service with a 7-day money-back guarantee on eligible 1 Year plans and above.",
  ],
  [
    "A 7-Day Money Back Guarantee if it is not the right fit",
    "A 7-day money-back guarantee on eligible 1 Year plans and above",
  ],
  [
    "A 7-Day Money Back Guarantee if the service is not suitable",
    "A 7-day money-back guarantee on eligible 1 Year plans and above",
  ],
  [
    "and a 7-Day Money Back Guarantee if the service is not suitable",
    "and a 7-day money-back guarantee on eligible 1 Year plans and above",
  ],
  [
    "within the applicable 7-day guarantee period",
    "within 7 days if you have an eligible 1 Year plan or above",
  ],
];

export type FieldUpdateResult = "updated" | "skipped_mismatch" | "already_current" | "unchanged_empty";

export function applyExactFieldUpdate(
  current: string,
  expectedBefore: string,
  after: string,
): { value: string; result: FieldUpdateResult } {
  const value = String(current ?? "");
  if (value === after) return { value, result: "already_current" };
  if (value === expectedBefore) return { value: after, result: "updated" };
  if (!value.trim()) return { value, result: "unchanged_empty" };
  return { value, result: "skipped_mismatch" };
}

export function applySubscriptionSeoTitleMeta(seo: PageSeo): {
  seo: PageSeo;
  titleResult: FieldUpdateResult;
  descriptionResult: FieldUpdateResult;
  ogTitleResult: FieldUpdateResult;
  ogDescriptionResult: FieldUpdateResult;
  changed: boolean;
} {
  const title = applyExactFieldUpdate(seo.title, SUBSCRIPTION_SEO_TITLE_BEFORE, SUBSCRIPTION_SEO_TITLE_AFTER);
  const description = applyExactFieldUpdate(
    seo.description,
    SUBSCRIPTION_SEO_META_BEFORE,
    SUBSCRIPTION_SEO_META_AFTER,
  );
  const ogTitle = applyExactFieldUpdate(seo.ogTitle, SUBSCRIPTION_SEO_TITLE_BEFORE, SUBSCRIPTION_SEO_TITLE_AFTER);
  const ogDescription = applyExactFieldUpdate(
    seo.ogDescription,
    SUBSCRIPTION_SEO_META_BEFORE,
    SUBSCRIPTION_SEO_META_AFTER,
  );

  const next: PageSeo = {
    ...seo,
    title: title.value,
    description: description.value,
    ogTitle: ogTitle.value,
    ogDescription: ogDescription.value,
  };

  const changed =
    title.result === "updated" ||
    description.result === "updated" ||
    ogTitle.result === "updated" ||
    ogDescription.result === "updated";

  return {
    seo: next,
    titleResult: title.result,
    descriptionResult: description.result,
    ogTitleResult: ogTitle.result,
    ogDescriptionResult: ogDescription.result,
    changed,
  };
}

export function applySubscriptionSeoMicrocopyToSettings(settings: SiteSettings): {
  settings: SiteSettings;
  titleResult: FieldUpdateResult;
  descriptionResult: FieldUpdateResult;
  ogTitleResult: FieldUpdateResult;
  ogDescriptionResult: FieldUpdateResult;
  changed: boolean;
} {
  const applied = applySubscriptionSeoTitleMeta(settings.pageSeo.subscriptions);
  if (!applied.changed) {
    return {
      settings,
      titleResult: applied.titleResult,
      descriptionResult: applied.descriptionResult,
      ogTitleResult: applied.ogTitleResult,
      ogDescriptionResult: applied.ogDescriptionResult,
      changed: false,
    };
  }
  return {
    settings: {
      ...settings,
      pageSeo: {
        ...settings.pageSeo,
        subscriptions: applied.seo,
      },
    },
    titleResult: applied.titleResult,
    descriptionResult: applied.descriptionResult,
    ogTitleResult: applied.ogTitleResult,
    ogDescriptionResult: applied.ogDescriptionResult,
    changed: true,
  };
}

function replaceExactMoneyBack(text: string): { text: string; changed: boolean } {
  let next = String(text ?? "");
  let changed = false;
  for (const [from, to] of SUBSCRIPTION_MONEY_BACK_EXACT) {
    if (!next.includes(from)) continue;
    next = next.split(from).join(to);
    changed = true;
  }
  return { text: next, changed };
}

function rewriteDeepStrings(value: unknown): { value: unknown; changed: boolean } {
  if (typeof value === "string") {
    const replaced = replaceExactMoneyBack(value);
    return { value: replaced.text, changed: replaced.changed };
  }
  if (Array.isArray(value)) {
    let changed = false;
    const next = value.map((item) => {
      const result = rewriteDeepStrings(item);
      if (result.changed) changed = true;
      return result.value;
    });
    return { value: next, changed };
  }
  if (value && typeof value === "object") {
    let changed = false;
    const next: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      const result = rewriteDeepStrings(item);
      next[key] = result.value;
      if (result.changed) changed = true;
    }
    return { value: next, changed };
  }
  return { value, changed: false };
}

export function applySubscriptionMoneyBackExactToSections(sections: CmsSection[]): {
  sections: CmsSection[];
  changed: boolean;
  replacements: number;
} {
  let changed = false;
  let replacements = 0;
  const next = sections.map((section) => {
    const result = rewriteDeepStrings(section.data);
    if (!result.changed) return section;
    changed = true;
    replacements += 1;
    return { ...section, data: result.value as CmsSection["data"] };
  });
  return { sections: next, changed, replacements };
}

export function applySubscriptionMoneyBackExactToPage(page: CmsPage): {
  page: CmsPage;
  changed: boolean;
  replacements: number;
} {
  if (page.id !== SUBSCRIPTION_PAGE_ID && page.slug !== "/iptv-subscription-uk/") {
    return { page, changed: false, replacements: 0 };
  }
  const applied = applySubscriptionMoneyBackExactToSections(page.sections);
  if (!applied.changed) return { page, changed: false, replacements: 0 };
  return {
    page: { ...page, sections: applied.sections },
    changed: true,
    replacements: applied.replacements,
  };
}

export function applySubscriptionMoneyBackExactToFaqs(faqs: FaqItem[]): {
  faqs: FaqItem[];
  changed: boolean;
  updatedIds: string[];
} {
  const updatedIds: string[] = [];
  const next = faqs.map((faq) => {
    const question = replaceExactMoneyBack(faq.question);
    const answer = replaceExactMoneyBack(faq.answer);
    if (!question.changed && !answer.changed) return faq;
    updatedIds.push(faq.id);
    return { ...faq, question: question.text, answer: answer.text };
  });
  return { faqs: next, changed: updatedIds.length > 0, updatedIds };
}

/** True when text still contains a known broad (pre-eligibility) money-back phrase. */
export function hasBroadMoneyBackClaim(text: string): boolean {
  return SUBSCRIPTION_MONEY_BACK_EXACT.some(([from]) => String(text ?? "").includes(from));
}

import type {
  BlogCategory,
  BlogPost,
  CmsPage,
  CmsSection,
  ContactMessage,
  CtaData,
  FaqData,
  FaqItem,
  MediaRef,
  NavLink,
  PageSeo,
  PricingData,
  PricingPlan,
  RedirectRule,
  RichContentCtaSource,
  RichContentData,
  RichContentScrollHeight,
  RichContentWidth,
  RichTextData,
  SectionType,
  ServicesData,
  SiteSettings,
  SocialLinks,
  SocialPlatform,
} from "@/lib/cms/types";
import { isIconName } from "@/lib/cms/icons";
import { mergeSectionData, defaultSettings } from "@/lib/cms/defaults";
import { sanitizeHtml } from "@/lib/cms/html";
import { sanitizeHttpUrl } from "@/lib/cms/contact";
import {
  isReservedRedirectSource,
  isSelfRedirect,
  normalizeRedirectSource,
  sanitizeRedirectDestination,
} from "@/lib/cms/redirects";
import { slugify } from "@/lib/cms/slug";

const SECTION_TYPES: SectionType[] = [
  "hero",
  "highlights",
  "how-it-works",
  "services",
  "pricing",
  "devices",
  "trust-stats",
  "why-choose",
  "faq",
  "cta",
  "page-hero",
  "rich-text",
  "rich-content",
  "info-cards",
  "contact-info",
  "contact-form",
  "messaging-cta",
  "hours",
];

export function isSectionType(value: string): value is SectionType {
  return SECTION_TYPES.includes(value as SectionType);
}

export function sanitizeText(value: unknown, max = 4000) {
  if (typeof value !== "string") return "";
  return value.replace(/\0/g, "").slice(0, max);
}

export function sanitizeHref(value: unknown) {
  const href = sanitizeText(value, 500).trim();
  if (!href) return "/";
  const lower = href.toLowerCase();
  if (
    lower.startsWith("javascript:") ||
    lower.startsWith("data:") ||
    lower.startsWith("vbscript:") ||
    href.startsWith("//") ||
    href.startsWith("/\\") ||
    href.includes("\\")
  ) {
    return "/";
  }
  if (
    href.startsWith("/") ||
    href.startsWith("#") ||
    href.startsWith("mailto:") ||
    href.startsWith("tel:") ||
    href.startsWith("https://") ||
    href.startsWith("http://localhost") ||
    href.startsWith("http://127.0.0.1")
  ) {
    return href;
  }
  return "/";
}

export function sanitizeIcon(value: unknown) {
  const name = sanitizeText(value, 40);
  return isIconName(name) ? name : "Zap";
}

export function sanitizeMediaRef(value: unknown): MediaRef | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Partial<MediaRef>;
  const id = sanitizeText(input.id, 80);
  const publicId = sanitizeText(input.publicId, 200);
  const secureUrl = sanitizeText(input.secureUrl, 500);
  if (!id || !publicId || !secureUrl) return null;
  if (publicId.includes("..") || publicId.includes("\\") || publicId.startsWith("/")) {
    return null;
  }
  if (!secureUrl.startsWith("https://res.cloudinary.com/")) return null;
  return { id, publicId, secureUrl };
}

export function sanitizePage(input: CmsPage): CmsPage {
  const sections = Array.isArray(input.sections) ? input.sections : [];
  const normalized = sections
    .filter((section): section is CmsSection => {
      return Boolean(section && typeof section === "object" && isSectionType(String(section.type)));
    })
    .map((section, index) => ({
      ...section,
      id: sanitizeText(section.id, 80) || `sec_${index}`,
      label: sanitizeText(section.label, 80) || section.type,
      order: typeof section.order === "number" ? section.order : index + 1,
      visible: Boolean(section.visible),
      data: sanitizeSectionData(section.type, mergeSectionData(section.type, section.data)),
    }))
    .sort((a, b) => a.order - b.order)
    .map((section, index) => ({ ...section, order: index + 1 }));

  return {
    id: sanitizeText(input.id, 80),
    name: sanitizeText(input.name, 80) || "Untitled",
    slug: sanitizeText(input.slug, 120) || "/",
    status: input.status === "draft" ? "draft" : "published",
    cmsEnabled: Boolean(input.cmsEnabled),
    sections: normalized,
  };
}

export function sanitizeSettings(input: SiteSettings): SiteSettings {
  const fallback = defaultSettings();
  const source = input && typeof input === "object" ? input : fallback;
  const whatsapp = sanitizeText(source.whatsapp, 40).replace(/[^\d]/g, "");
  const next: SiteSettings = {
    siteName: sanitizeText(source.siteName, 80) || "THE FLIX IPTV",
    tagline: sanitizeText(source.tagline, 160),
    email: sanitizeText(source.email, 120),
    phone: sanitizeText(source.phone, 60),
    whatsapp,
    whatsappDisplay: sanitizeText(source.whatsappDisplay, 60),
    whatsappMessage: sanitizeText(source.whatsappMessage, 300),
    whatsappEnabled: coerceEnabled(source.whatsappEnabled, Boolean(whatsapp)),
    hours: sanitizeText(source.hours, 120),
    location: sanitizeText(source.location, 160),
    telegramUrl: "",
    telegramEnabled: false,
    socials: sanitizeSocials(source.socials),
    headerNav: sanitizeNavList(source.headerNav, fallback.headerNav),
    headerCtaLabel: sanitizeText(source.headerCtaLabel, 40) || "Get Started",
    headerCtaHref: sanitizeHref(source.headerCtaHref),
    footerIntro: sanitizeText(source.footerIntro, 400),
    footerCopyright: sanitizeText(source.footerCopyright, 160),
    footerQuickLinks: sanitizeNavList(source.footerQuickLinks, fallback.footerQuickLinks),
    footerSupportLinks: sanitizeNavList(source.footerSupportLinks, fallback.footerSupportLinks),
    footerPaymentImages: Array.isArray(source.footerPaymentImages)
      ? source.footerPaymentImages.map(sanitizeMediaRef).filter((item): item is NonNullable<typeof item> => Boolean(item))
      : [],
    branding: {
      logo: sanitizeMediaRef(source.branding?.logo),
      logoAlt: sanitizeText(source.branding?.logoAlt, 120),
      favicon: sanitizeMediaRef(source.branding?.favicon),
      defaultOgImage: sanitizeMediaRef(source.branding?.defaultOgImage),
    },
    pageSeo: {
      home: sanitizePageSeo(source.pageSeo?.home, fallback.pageSeo.home),
      subscriptions: sanitizePageSeo(source.pageSeo?.subscriptions, fallback.pageSeo.subscriptions),
      contact: sanitizePageSeo(source.pageSeo?.contact, fallback.pageSeo.contact),
      blog: sanitizePageSeo(source.pageSeo?.blog, fallback.pageSeo.blog),
    },
  };

  const telegramUrl =
    sanitizeHttpUrl(sanitizeText(source.telegramUrl, 300)) || next.socials.telegram.url;
  next.telegramUrl = telegramUrl;
  next.telegramEnabled = coerceEnabled(source.telegramEnabled, Boolean(telegramUrl));
  next.socials = {
    ...next.socials,
    telegram: { url: telegramUrl, visible: next.telegramEnabled },
  };
  return next;
}

function coerceEnabled(flag: unknown, hasValue: boolean) {
  if (typeof flag === "boolean") return flag;
  return hasValue;
}

function sanitizeSocialPlatform(value: unknown): SocialPlatform {
  if (typeof value === "string") {
    const url = sanitizeHttpUrl(sanitizeText(value, 300));
    return { url, visible: Boolean(url) };
  }
  if (value && typeof value === "object") {
    const input = value as { url?: unknown; href?: unknown; visible?: unknown };
    const url = sanitizeHttpUrl(sanitizeText((input.url ?? input.href) as string, 300));
    const visible = typeof input.visible === "boolean" ? input.visible : Boolean(url);
    return { url, visible };
  }
  return { url: "", visible: false };
}

function sanitizeSocials(value: unknown): SocialLinks {
  const input = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  return {
    facebook: sanitizeSocialPlatform(input.facebook),
    instagram: sanitizeSocialPlatform(input.instagram),
    twitter: sanitizeSocialPlatform(input.twitter),
    youtube: sanitizeSocialPlatform(input.youtube),
    telegram: sanitizeSocialPlatform(input.telegram),
  };
}

function sanitizeSectionData(type: SectionType, data: CmsSection["data"]): CmsSection["data"] {
  if (type === "rich-text") {
    const current = data as RichTextData;
    return {
      heading: sanitizeText(current.heading, 160),
      html: sanitizeHtml(current.html),
    };
  }
  if (type === "rich-content") {
    const current = data as RichContentData;
    const width: RichContentWidth =
      current.width === "wide" || current.width === "normal" ? current.width : "narrow";
    const scrollHeight: RichContentScrollHeight =
      current.scrollHeight === "compact" || current.scrollHeight === "tall" ? current.scrollHeight : "standard";
    const ctaSource: RichContentCtaSource = current.ctaSource === "whatsapp" ? "whatsapp" : "custom";
    return {
      eyebrow: sanitizeText(current.eyebrow, 80),
      heading: sanitizeText(current.heading, 160),
      html: sanitizeHtml(current.html),
      buttonLabel: sanitizeText(current.buttonLabel, 40),
      buttonHref: current.buttonHref ? sanitizeHref(current.buttonHref) : "",
      width,
      scrollable: Boolean(current.scrollable),
      scrollHeight,
      ctaSource,
    };
  }
  if (type === "cta") {
    const current = data as CtaData;
    return {
      ...current,
      heading: sanitizeText(current.heading, 160),
      description: sanitizeText(current.description, 400),
      buttonLabel: sanitizeText(current.buttonLabel, 40),
      buttonHref: sanitizeHref(current.buttonHref),
    };
  }
  if (type === "services") {
    const current = data as ServicesData;
    return {
      ...current,
      cards: current.cards.map((card) => ({
        ...card,
        title: sanitizeText(card.title, 80),
        description: sanitizeText(card.description, 400),
        linkLabel: sanitizeText(card.linkLabel, 40),
        linkHref: sanitizeHref(card.linkHref),
      })),
    };
  }
  if (type === "pricing") {
    const current = data as PricingData;
    return {
      ...current,
      plans: current.plans.map((plan) => ({
        ...plan,
        buttonHref: sanitizeHref(plan.buttonHref),
      })),
    };
  }
  if (type === "faq") {
    const current = data as FaqData;
    const sourceMode = current.sourceMode === "selected" ? "selected" : "category";
    const selectedFaqIds = Array.isArray(current.selectedFaqIds)
      ? current.selectedFaqIds.map((id) => sanitizeText(id, 80)).filter(Boolean)
      : [];
    const maxItems = Number(current.maxItems);
    return {
      ...current,
      eyebrow: sanitizeText(current.eyebrow, 80),
      heading: sanitizeText(current.heading, 160),
      description: sanitizeText(current.description, 400),
      sourceMode,
      useCentralFaqs: current.useCentralFaqs !== false,
      category: sanitizeText(current.category, 40),
      selectedFaqIds,
      maxItems: Number.isFinite(maxItems) && maxItems > 0 ? Math.min(50, Math.round(maxItems)) : 0,
      items: Array.isArray(current.items)
        ? current.items.map((item) => ({
            ...item,
            id: sanitizeText(item.id, 80),
            question: sanitizeText(item.question, 200),
            answer: sanitizeText(item.answer, 2000),
          }))
        : [],
    };
  }
  return data;
}

function sanitizeNavList(value: unknown, fallback: NavLink[]): NavLink[] {
  if (!Array.isArray(value) || value.length === 0) return fallback;
  return value
    .map((item, index) => ({
      id: sanitizeText(item?.id, 80) || `nav_${index}`,
      label: sanitizeText(item?.label, 60),
      href: sanitizeHref(item?.href),
      visible: item?.visible !== false,
    }))
    .filter((item) => item.label);
}

export function sanitizePageSeo(value: unknown, fallback: PageSeo): PageSeo {
  const input = value && typeof value === "object" ? (value as PageSeo) : fallback;
  return {
    title: sanitizeText(input.title, 70) || fallback.title,
    description: sanitizeText(input.description, 180) || fallback.description,
    focusKeyword: sanitizeText(input.focusKeyword, 80),
    canonicalUrl: sanitizeText(input.canonicalUrl, 200) || fallback.canonicalUrl,
    robotsIndex: input.robotsIndex !== false,
    robotsFollow: input.robotsFollow !== false,
    ogTitle: sanitizeText(input.ogTitle, 70),
    ogDescription: sanitizeText(input.ogDescription, 180),
    ogImage: sanitizeMediaRef(input.ogImage),
    sitemapInclude: input.sitemapInclude !== false,
  };
}

export function sanitizePricingPlan(input: PricingPlan): PricingPlan {
  const now = new Date().toISOString();
  const name = sanitizeText(input.name, 80) || "Plan";
  return {
    id: sanitizeText(input.id, 80) || slugify(name),
    name,
    slug: slugify(sanitizeText(input.slug, 80) || name) || "plan",
    price: sanitizeText(input.price, 20),
    duration: sanitizeText(input.duration, 40),
    badge: sanitizeText(input.badge, 40),
    popular: Boolean(input.popular),
    features: Array.isArray(input.features)
      ? input.features.map((feature) => sanitizeText(feature, 120)).filter(Boolean)
      : [],
    buttonLabel: sanitizeText(input.buttonLabel, 40) || "Choose Plan",
    buttonHref: sanitizeHref(input.buttonHref),
    sortOrder: Number(input.sortOrder) || 0,
    active: input.active !== false,
    createdAt: sanitizeText(input.createdAt, 40) || now,
    updatedAt: now,
  };
}

export function sanitizeFaq(input: FaqItem): FaqItem {
  const now = new Date().toISOString();
  return {
    id: sanitizeText(input.id, 80),
    question: sanitizeText(input.question, 200),
    answer: sanitizeText(input.answer, 2000),
    category: sanitizeText(input.category, 40) || "General",
    sortOrder: Number(input.sortOrder) || 0,
    visible: input.visible !== false,
    createdAt: sanitizeText(input.createdAt, 40) || now,
    updatedAt: now,
  };
}

export function sanitizeCategory(input: BlogCategory): BlogCategory {
  const now = new Date().toISOString();
  const name = sanitizeText(input.name, 80) || "Category";
  return {
    id: sanitizeText(input.id, 80),
    name,
    slug: slugify(sanitizeText(input.slug, 80) || name) || "category",
    description: sanitizeText(input.description, 200),
    active: input.active !== false,
    createdAt: sanitizeText(input.createdAt, 40) || now,
    updatedAt: now,
  };
}

export function sanitizePost(input: BlogPost): BlogPost {
  const now = new Date().toISOString();
  const title = sanitizeText(input.title, 160) || "Untitled";
  const status = input.status === "published" ? "published" : "draft";
  return {
    id: sanitizeText(input.id, 80),
    title,
    slug: slugify(sanitizeText(input.slug, 160) || title) || "post",
    excerpt: sanitizeText(input.excerpt, 400),
    content: sanitizeHtml(typeof input.content === "string" ? input.content : ""),
    categoryId: input.categoryId ? sanitizeText(input.categoryId, 80) : null,
    featuredImage: sanitizeMediaRef(input.featuredImage),
    status,
    featured: Boolean(input.featured),
    publishedAt: status === "published" ? sanitizeText(input.publishedAt, 40) || now : input.publishedAt,
    createdAt: sanitizeText(input.createdAt, 40) || now,
    updatedAt: now,
    seoTitle: sanitizeText(input.seoTitle, 70),
    seoDescription: sanitizeText(input.seoDescription, 180),
    focusKeyword: sanitizeText(input.focusKeyword, 80),
    canonicalUrl: sanitizeText(input.canonicalUrl, 200),
    robotsIndex: input.robotsIndex !== false,
    robotsFollow: input.robotsFollow !== false,
    ogTitle: sanitizeText(input.ogTitle, 70),
    ogDescription: sanitizeText(input.ogDescription, 180),
    ogImage: sanitizeMediaRef(input.ogImage),
    sitemapInclude: input.sitemapInclude !== false,
  };
}

export function sanitizeRedirect(input: RedirectRule): RedirectRule {
  const now = new Date().toISOString();
  const sourcePath = normalizeRedirectSource(input.sourcePath);
  const destinationPath = sanitizeRedirectDestination(input.destinationPath);
  const statusCode =
    input.statusCode === 302 || input.statusCode === 307 || input.statusCode === 308 ? input.statusCode : 301;
  if (!sourcePath || isReservedRedirectSource(sourcePath) || isSelfRedirect(sourcePath, destinationPath)) {
    return {
      id: sanitizeText(input.id, 80),
      sourcePath: sourcePath || "/old-path/",
      destinationPath,
      statusCode,
      active: false,
      createdAt: sanitizeText(input.createdAt, 40) || now,
      updatedAt: now,
    };
  }
  return {
    id: sanitizeText(input.id, 80),
    sourcePath,
    destinationPath,
    statusCode,
    active: input.active !== false,
    createdAt: sanitizeText(input.createdAt, 40) || now,
    updatedAt: now,
  };
}

export function sanitizeMessage(input: ContactMessage): ContactMessage {
  return {
    id: sanitizeText(input.id, 80),
    name: sanitizeText(input.name, 80),
    email: sanitizeText(input.email, 120),
    phone: sanitizeText(input.phone, 40),
    subject: sanitizeText(input.subject, 160),
    message: sanitizeText(input.message, 4000),
    createdAt: sanitizeText(input.createdAt, 40) || new Date().toISOString(),
  };
}

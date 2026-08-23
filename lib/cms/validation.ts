import type {
  CmsPage,
  CmsSection,
  MediaRef,
  SectionType,
  SiteSettings,
} from "@/lib/cms/types";
import { isIconName } from "@/lib/cms/icons";
import { mergeSectionData } from "@/lib/cms/defaults";

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
      data: mergeSectionData(section.type, section.data),
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
  return {
    siteName: sanitizeText(input.siteName, 80) || "THE FLIX IPTV",
    tagline: sanitizeText(input.tagline, 160),
    email: sanitizeText(input.email, 120),
    phone: sanitizeText(input.phone, 60),
    whatsapp: sanitizeText(input.whatsapp, 40).replace(/[^\d]/g, ""),
    hours: sanitizeText(input.hours, 120),
    location: sanitizeText(input.location, 160),
    branding: {
      logo: sanitizeMediaRef(input.branding?.logo),
      logoAlt: sanitizeText(input.branding?.logoAlt, 120),
      favicon: sanitizeMediaRef(input.branding?.favicon),
      defaultOgImage: sanitizeMediaRef(input.branding?.defaultOgImage),
    },
  };
}

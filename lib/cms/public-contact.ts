import { buildWhatsAppUrl, isPlaceholderPhone, telUrl } from "@/lib/cms/contact";
import { planWhatsAppMessage, WHATSAPP_SALES_MESSAGE, WHATSAPP_VISIT_MESSAGE } from "@/lib/cms/whatsapp-messages";
import type { SiteSettings, SocialPlatform } from "@/lib/cms/types";

export type PublicSocial = {
  key: keyof SiteSettings["socials"];
  label: string;
  short: string;
  href: string;
};

const OPTIONAL_SOCIALS: Array<{ key: keyof SiteSettings["socials"]; label: string; short: string }> = [
  { key: "facebook", label: "Facebook", short: "f" },
  { key: "instagram", label: "Instagram", short: "ig" },
  { key: "twitter", label: "X", short: "x" },
  { key: "youtube", label: "YouTube", short: "yt" },
];

function isVisiblePlatform(platform: SocialPlatform) {
  return Boolean(platform.visible && platform.url);
}

export function publicEmail(settings: SiteSettings) {
  return settings.email.trim();
}

export function publicPhone(settings: SiteSettings) {
  if (!settings.phone || isPlaceholderPhone(settings.phone)) return "";
  return settings.phone;
}

export function publicPhoneHref(settings: SiteSettings) {
  const phone = publicPhone(settings);
  return phone ? telUrl(phone) : "";
}

export function publicWhatsAppUrl(settings: SiteSettings, message?: string) {
  if (!settings.whatsappEnabled) return "";
  const text = message === undefined ? settings.whatsappMessage : message;
  return buildWhatsAppUrl(settings.whatsapp, text);
}

export function publicWhatsAppProfileUrl(settings: SiteSettings) {
  if (!settings.whatsappEnabled) return "";
  return buildWhatsAppUrl(settings.whatsapp);
}

export function publicWhatsAppSalesUrl(settings: SiteSettings) {
  return publicWhatsAppUrl(settings, WHATSAPP_SALES_MESSAGE);
}

export function publicWhatsAppVisitUrl(settings: SiteSettings) {
  return publicWhatsAppUrl(settings, WHATSAPP_VISIT_MESSAGE);
}

export function publicWhatsAppPlanUrl(
  settings: SiteSettings,
  plan: { name: string; price: string; duration: string },
  pageUrl?: string,
) {
  return publicWhatsAppUrl(settings, planWhatsAppMessage(plan, pageUrl));
}

export function publicTelegramUrl(settings: SiteSettings) {
  if (!settings.telegramEnabled) return "";
  return settings.telegramUrl || settings.socials.telegram.url;
}

export function publicSocialLinks(settings: SiteSettings): PublicSocial[] {
  const items: PublicSocial[] = OPTIONAL_SOCIALS.filter((item) => isVisiblePlatform(settings.socials[item.key])).map(
    (item) => ({
      ...item,
      href: settings.socials[item.key].url,
    }),
  );
  const telegram = publicTelegramUrl(settings);
  if (telegram) {
    items.push({ key: "telegram", label: "Telegram", short: "tg", href: telegram });
  }
  return items;
}

export function publicSameAs(settings: SiteSettings) {
  const urls = publicSocialLinks(settings).map((item) => item.href);
  const wa = publicWhatsAppProfileUrl(settings);
  if (wa) urls.push(wa);
  return [...new Set(urls)];
}

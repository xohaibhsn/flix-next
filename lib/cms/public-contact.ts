import { isPlaceholderPhone, telUrl, whatsappUrl } from "@/lib/cms/contact";
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

export function publicWhatsAppUrl(settings: SiteSettings) {
  if (!settings.whatsappEnabled) return "";
  return whatsappUrl(settings.whatsapp, settings.whatsappMessage);
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
  const wa = publicWhatsAppUrl(settings);
  if (wa) urls.push(wa);
  return [...new Set(urls)];
}

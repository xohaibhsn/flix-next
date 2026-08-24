import { getSiteOrigin } from "@/lib/site-url";
import type { BlogPost, FaqData, SiteSettings } from "@/lib/cms/types";
import { whatsappUrl } from "@/lib/cms/contact";

export function organizationJsonLd(settings: SiteSettings) {
  const origin = getSiteOrigin();
  const sameAs = Object.values(settings.socials).filter(Boolean);
  if (settings.telegramUrl) sameAs.push(settings.telegramUrl);
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: settings.siteName,
    url: origin,
    description: settings.tagline,
    email: settings.email || undefined,
    telephone: settings.phone || undefined,
    logo: settings.branding.logo?.secureUrl,
    sameAs: sameAs.length ? sameAs : undefined,
  };
}

export function websiteJsonLd(settings: SiteSettings) {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: settings.siteName,
    url: getSiteOrigin(),
    description: settings.tagline,
  };
}

export function faqPageJsonLd(data: FaqData) {
  const entities = data.items.filter((item) => item.question && item.answer);
  if (!entities.length) return null;
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: entities.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.answer,
      },
    })),
  };
}

export function blogPostingJsonLd(post: BlogPost, settings: SiteSettings) {
  const origin = getSiteOrigin();
  return {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.seoTitle || post.title,
    description: post.seoDescription || post.excerpt,
    datePublished: post.publishedAt || post.createdAt,
    dateModified: post.updatedAt,
    image: post.featuredImage?.secureUrl || settings.branding.defaultOgImage?.secureUrl,
    author: {
      "@type": "Organization",
      name: settings.siteName,
    },
    publisher: {
      "@type": "Organization",
      name: settings.siteName,
      logo: settings.branding.logo?.secureUrl
        ? { "@type": "ImageObject", url: settings.branding.logo.secureUrl }
        : undefined,
    },
    mainEntityOfPage: `${origin}/blog/${post.slug}/`,
  };
}

export function whatsappSameAs(settings: SiteSettings) {
  return whatsappUrl(settings.whatsapp, settings.whatsappMessage);
}

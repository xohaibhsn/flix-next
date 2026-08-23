import type { NavItem } from "@/types/content";

export const siteConfig = {
  name: "THE FLIX IPTV",
  shortName: "THE FLIX",
  tagline: "Your Entertainment. Your Way.",
  description:
    "Stream live TV, movies, and series in HD, FHD, and 4K. Local demo site for The Flix — contact values are placeholders.",
  url: "http://localhost:3000",
  email: "support@theflixiptv.com",
  phone: "+1 (234) 567-8900",
  whatsapp: "1234567890",
  hours: "24/7 support (demo placeholder)",
  location: "Available worldwide · local demo",
  nav: [
    { label: "Home", href: "/" },
    { label: "IPTV Subscription", href: "/iptv-subscriptions-uk/" },
    { label: "Blog", href: "/blog/" },
    { label: "Contact", href: "/contact/" },
  ] satisfies NavItem[],
  footerQuickLinks: [
    { label: "Home", href: "/" },
    { label: "IPTV Subscription", href: "/iptv-subscriptions-uk/" },
    { label: "Welcome", href: "/welcome/" },
    { label: "Blog", href: "/blog/" },
  ] satisfies NavItem[],
  footerSupportLinks: [
    { label: "Contact", href: "/contact/" },
    { label: "FAQ", href: "/#faq" },
    { label: "Plans", href: "/iptv-subscriptions-uk/" },
  ] satisfies NavItem[],
  socials: [
    { label: "Facebook", href: "#", short: "f" },
    { label: "X", href: "#", short: "x" },
    { label: "Instagram", href: "#", short: "ig" },
  ],
  payments: ["Visa", "Mastercard", "PayPal"],
} as const;

export const whatsappLink = `https://wa.me/${siteConfig.whatsapp}`;

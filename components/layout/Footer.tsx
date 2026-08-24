import Link from "next/link";
import { Mail, MapPin, Phone } from "lucide-react";
import { Logo, type LogoBranding } from "@/components/layout/Logo";
import { siteConfig, whatsappLink } from "@/lib/site-config";

export function Footer({
  branding,
  siteName,
  tagline,
}: {
  branding?: LogoBranding;
  siteName?: string;
  tagline?: string;
}) {
  return (
    <footer className="bg-[#08090d] text-white">
      <div className="mx-auto grid max-w-6xl gap-10 px-5 py-14 sm:grid-cols-2 lg:grid-cols-4 lg:px-8">
        <div>
          <Logo imageUrl={branding?.imageUrl} alt={branding?.alt} />
          <p className="mt-4 max-w-xs text-sm leading-relaxed text-white/60">
            {tagline ||
              "Premium IPTV with live channels, movies, and series on every device. Reliable streams. Honest pricing."}
          </p>
          <div className="mt-5 flex gap-3">
            {siteConfig.socials.map((s) => (
              <a
                key={s.label}
                href={s.href}
                aria-label={`${s.label} (placeholder)`}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-white/15 text-xs font-bold text-white/80"
              >
                {s.short}
              </a>
            ))}
          </div>
        </div>
        <div>
          <h2 className="text-sm font-bold tracking-wide uppercase">Quick Links</h2>
          <ul className="mt-4 space-y-2 text-sm text-white/65">
            {siteConfig.footerQuickLinks.map((item) => (
              <li key={item.href}>
                <Link href={item.href} className="hover:text-white">
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h2 className="text-sm font-bold tracking-wide uppercase">Support</h2>
          <ul className="mt-4 space-y-2 text-sm text-white/65">
            {siteConfig.footerSupportLinks.map((item) => (
              <li key={item.href + item.label}>
                <Link href={item.href} className="hover:text-white">
                  {item.label}
                </Link>
              </li>
            ))}
            <li>
              <a href={whatsappLink} className="hover:text-white">
                WhatsApp Help
              </a>
            </li>
          </ul>
        </div>
        <div>
          <h2 className="text-sm font-bold tracking-wide uppercase">Contact Us</h2>
          <ul className="mt-4 space-y-3 text-sm text-white/65">
            <li className="flex items-start gap-2">
              <Mail className="mt-0.5 h-4 w-4 text-brand" aria-hidden="true" />
              <a href={`mailto:${siteConfig.email}`} className="hover:text-white">
                {siteConfig.email}
              </a>
            </li>
            <li className="flex items-start gap-2">
              <Phone className="mt-0.5 h-4 w-4 text-brand" aria-hidden="true" />
              <a href={`tel:${siteConfig.phone}`} className="hover:text-white">
                {siteConfig.phone}
              </a>
            </li>
            <li className="flex items-start gap-2">
              <MapPin className="mt-0.5 h-4 w-4 text-brand" aria-hidden="true" />
              <span>{siteConfig.location}</span>
            </li>
          </ul>
          <a
            href={whatsappLink}
            className="mt-5 inline-flex w-full items-center justify-center rounded-md bg-[#25D366] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#1ebe5d]"
          >
            Chat on WhatsApp
          </a>
        </div>
      </div>
      <div className="border-t border-white/10">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-5 py-5 text-xs text-white/45 sm:flex-row lg:px-8">
          <p>
            © {new Date().getFullYear()} {siteName || siteConfig.name}. All rights reserved.
          </p>
          <div className="flex items-center gap-2">
            {siteConfig.payments.map((p) => (
              <span
                key={p}
                className="rounded border border-white/15 px-2 py-1 font-semibold tracking-wide text-white/70"
              >
                {p}
              </span>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}

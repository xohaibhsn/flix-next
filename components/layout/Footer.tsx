import Link from "next/link";
import { Mail, MapPin, MessageCircle, Phone, Send } from "lucide-react";
import { Logo, type LogoBranding } from "@/components/layout/Logo";
import {
  publicEmail,
  publicPhone,
  publicPhoneHref,
  publicSocialLinks,
  publicTelegramUrl,
  publicWhatsAppUrl,
} from "@/lib/cms/public-contact";
import type { SiteSettings } from "@/lib/cms/types";

export function Footer({
  branding,
  settings,
}: {
  branding?: LogoBranding;
  settings: SiteSettings;
}) {
  const wa = publicWhatsAppUrl(settings);
  const telegram = publicTelegramUrl(settings);
  const phone = publicPhone(settings);
  const email = publicEmail(settings);
  const phoneHref = publicPhoneHref(settings);
  const quick = settings.footerQuickLinks.filter((item) => item.visible);
  const support = settings.footerSupportLinks.filter((item) => item.visible);
  const socials = publicSocialLinks(settings);
  const year = new Date().getFullYear();

  return (
    <footer className="bg-[#08090d] text-white">
      <div className="mx-auto grid max-w-6xl gap-10 px-5 py-14 sm:grid-cols-2 lg:grid-cols-4 lg:px-8">
        <div>
          <Logo imageUrl={branding?.imageUrl} alt={branding?.alt} />
          <p className="mt-4 max-w-xs text-sm leading-relaxed text-white/60">
            {settings.footerIntro || settings.tagline}
          </p>
          {socials.length ? (
            <div className="mt-5 flex gap-3">
              {socials.map((item) => (
                <a
                  key={item.label}
                  href={item.href}
                  aria-label={item.label}
                  className="flex h-8 w-8 items-center justify-center rounded-full border border-white/15 text-xs font-bold text-white/80 hover:border-white/40"
                >
                  {item.short}
                </a>
              ))}
            </div>
          ) : null}
        </div>
        <div>
          <h2 className="text-sm font-bold tracking-wide uppercase">Quick Links</h2>
          <ul className="mt-4 space-y-2 text-sm text-white/65">
            {quick.map((item) => (
              <li key={item.id}>
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
            {support.map((item) => (
              <li key={item.id}>
                <Link href={item.href} className="hover:text-white">
                  {item.label}
                </Link>
              </li>
            ))}
            {wa ? (
              <li>
                <a href={wa} className="hover:text-white">
                  WhatsApp Help
                </a>
              </li>
            ) : null}
            {telegram ? (
              <li>
                <a href={telegram} className="inline-flex items-center gap-1 hover:text-white">
                  <Send className="h-3.5 w-3.5" aria-hidden="true" />
                  Telegram
                </a>
              </li>
            ) : null}
          </ul>
        </div>
        <div>
          <h2 className="text-sm font-bold tracking-wide uppercase">Contact Us</h2>
          <ul className="mt-4 space-y-3 text-sm text-white/65">
            {email ? (
              <li className="flex items-start gap-2">
                <Mail className="mt-0.5 h-4 w-4 text-brand" aria-hidden="true" />
                <a href={`mailto:${email}`} className="hover:text-white">
                  {email}
                </a>
              </li>
            ) : null}
            {phone && phoneHref ? (
              <li className="flex items-start gap-2">
                <Phone className="mt-0.5 h-4 w-4 text-brand" aria-hidden="true" />
                <a href={phoneHref} className="hover:text-white">
                  {settings.whatsappDisplay || phone}
                </a>
              </li>
            ) : null}
            {settings.location ? (
              <li className="flex items-start gap-2">
                <MapPin className="mt-0.5 h-4 w-4 text-brand" aria-hidden="true" />
                <span>{settings.location}</span>
              </li>
            ) : null}
          </ul>
          {wa ? (
            <a
              href={wa}
              className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-md bg-[#25D366] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#1ebe5d]"
            >
              <MessageCircle className="h-4 w-4" aria-hidden="true" />
              Chat on WhatsApp
            </a>
          ) : null}
        </div>
      </div>
      <div className="border-t border-white/10">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-5 py-5 text-xs text-white/45 sm:flex-row lg:px-8">
          <p>
            © {year} {settings.siteName}. {settings.footerCopyright || "All rights reserved."}
          </p>
          {settings.footerPaymentImages.length ? (
            <div className="flex flex-wrap items-center gap-2">
              {settings.footerPaymentImages.map((image) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={image.id} src={image.secureUrl} alt="" className="h-6 w-auto opacity-80" />
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </footer>
  );
}

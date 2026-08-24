import type { ReactNode } from "react";
import { connection } from "next/server";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { WhatsAppButton } from "@/components/layout/WhatsAppButton";
import { JsonLd } from "@/components/seo/JsonLd";
import { cms } from "@/lib/cms/repository";
import { organizationJsonLd, websiteJsonLd } from "@/lib/cms/json-ld";
import { publicWhatsAppSalesUrl, publicWhatsAppVisitUrl } from "@/lib/cms/public-contact";
import { isSalesCtaLabel } from "@/lib/cms/whatsapp-messages";
import type { LogoBranding } from "@/components/layout/Logo";

export async function SiteShell({
  children,
  overlayHeader = false,
}: {
  children: ReactNode;
  overlayHeader?: boolean;
}) {
  await connection();
  const settings = await cms.getSettings();
  const branding: LogoBranding = {
    imageUrl: settings.branding.logo?.secureUrl ?? null,
    alt: settings.branding.logoAlt || settings.siteName,
  };

  const salesWhatsApp = publicWhatsAppSalesUrl(settings);
  const headerCtaHref =
    salesWhatsApp && isSalesCtaLabel(settings.headerCtaLabel) ? salesWhatsApp : settings.headerCtaHref;

  return (
    <>
      <JsonLd data={organizationJsonLd(settings)} />
      <JsonLd data={websiteJsonLd(settings)} />
      <Header
        overlay={overlayHeader}
        branding={branding}
        nav={settings.headerNav}
        ctaLabel={settings.headerCtaLabel}
        ctaHref={headerCtaHref}
      />
      <main className="flex-1">{children}</main>
      <Footer branding={branding} settings={settings} />
      <WhatsAppButton href={publicWhatsAppVisitUrl(settings)} />
    </>
  );
}

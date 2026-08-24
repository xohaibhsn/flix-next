import type { ReactNode } from "react";
import { connection } from "next/server";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { WhatsAppButton } from "@/components/layout/WhatsAppButton";
import { JsonLd } from "@/components/seo/JsonLd";
import { cms } from "@/lib/cms/repository";
import { organizationJsonLd, websiteJsonLd } from "@/lib/cms/json-ld";
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

  return (
    <>
      <JsonLd data={organizationJsonLd(settings)} />
      <JsonLd data={websiteJsonLd(settings)} />
      <Header
        overlay={overlayHeader}
        branding={branding}
        nav={settings.headerNav}
        ctaLabel={settings.headerCtaLabel}
        ctaHref={settings.headerCtaHref}
      />
      <main className="flex-1">{children}</main>
      <Footer branding={branding} settings={settings} />
      <WhatsAppButton number={settings.whatsapp} message={settings.whatsappMessage} />
    </>
  );
}

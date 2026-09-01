import type { ReactNode } from "react";
import { connection } from "next/server";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { WhatsAppButton } from "@/components/layout/WhatsAppButton";
import { CustomHeadCode } from "@/components/seo/CustomHeadCode";
import { JsonLd } from "@/components/seo/JsonLd";
import { cms } from "@/lib/cms/repository";
import { organizationJsonLd, websiteJsonLd } from "@/lib/cms/json-ld";
import { parseJsonLdInput } from "@/lib/cms/json-ld-input";
import { publicWhatsAppSalesUrl, publicWhatsAppVisitUrl } from "@/lib/cms/public-contact";
import { isSalesCtaLabel } from "@/lib/cms/whatsapp-messages";
import type { LogoBranding } from "@/components/layout/Logo";
import type { SiteSettings } from "@/lib/cms/types";

function StoredJsonLd({ raw }: { raw: string }) {
  const parsed = parseJsonLdInput(raw);
  if (!parsed.ok || !parsed.data) return null;
  return <JsonLd data={parsed.data} />;
}

export async function SiteShell({
  children,
  overlayHeader = false,
  showOrganization = false,
  pageSeoKey,
}: {
  children: ReactNode;
  overlayHeader?: boolean;
  showOrganization?: boolean;
  pageSeoKey?: keyof SiteSettings["pageSeo"];
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
      <CustomHeadCode html={settings.customHeadCode || ""} />
      {showOrganization ? <JsonLd data={organizationJsonLd(settings)} /> : null}
      <JsonLd data={websiteJsonLd(settings)} />
      <StoredJsonLd raw={settings.siteCustomJsonLd || ""} />
      {pageSeoKey ? <StoredJsonLd raw={settings.pageSeo[pageSeoKey].customJsonLd || ""} /> : null}
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

import type { ReactNode } from "react";
import { connection } from "next/server";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { WhatsAppButton } from "@/components/layout/WhatsAppButton";
import { cms } from "@/lib/cms/repository";
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
      <Header overlay={overlayHeader} branding={branding} />
      <main className="flex-1">{children}</main>
      <Footer branding={branding} siteName={settings.siteName} tagline={settings.tagline} />
      <WhatsAppButton />
    </>
  );
}

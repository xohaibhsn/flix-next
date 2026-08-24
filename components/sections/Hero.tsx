import { ArrowRight } from "lucide-react";
import { DeviceShowcase } from "@/components/sections/DeviceShowcase";
import { ButtonLink } from "@/components/ui/ButtonLink";
import { Container } from "@/components/ui/Container";
import { getIcon } from "@/lib/cms/icons";
import type { HeroData, SiteSettings } from "@/lib/cms/types";
import { createDefaultSectionData } from "@/lib/cms/defaults";
import { publicWhatsAppSalesUrl } from "@/lib/cms/public-contact";
import { resolveBrowseHref, resolveSalesHref } from "@/lib/cms/whatsapp-messages";

export function Hero({ data, settings }: { data?: HeroData; settings?: SiteSettings }) {
  const content = data ?? (createDefaultSectionData("hero") as HeroData);
  const salesUrl = settings ? publicWhatsAppSalesUrl(settings) : "";
  const primaryHref = resolveSalesHref(content.primaryLabel, content.primaryHref, salesUrl);
  const secondaryHref = resolveBrowseHref(content.secondaryLabel, content.secondaryHref);

  return (
    <section className="hero-grid relative overflow-hidden pt-[76px]">
      <Container className="grid items-center gap-10 py-16 lg:grid-cols-[1.05fr_1fr] lg:py-20">
        <div>
          {content.badge ? (
            <span className="inline-flex items-center rounded-full border border-brand/40 bg-brand/10 px-3.5 py-1 text-[12px] font-medium text-white/90">
              {content.badge}
            </span>
          ) : null}
          <h1 className="mt-5 text-4xl leading-[1.08] font-extrabold tracking-tight text-white sm:text-5xl lg:text-[56px]">
            {content.heading}
            <br />
            <span className="text-brand">{content.highlight}</span>
          </h1>
          <p className="mt-5 max-w-md text-[15px] leading-relaxed text-white/70">
            {content.description}
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <ButtonLink href={primaryHref}>
              {content.primaryLabel}
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </ButtonLink>
            <ButtonLink href={secondaryHref} variant="ghost">
              {content.secondaryLabel}
            </ButtonLink>
          </div>
          <div className="mt-10 flex flex-wrap gap-x-6 gap-y-3 text-[13px] text-white/75">
            {(Array.isArray(content.trustItems) ? content.trustItems : []).map((item) => {
              const Icon = getIcon(item.icon);
              return (
                <span key={item.id} className="inline-flex items-center gap-2">
                  <Icon className="h-4 w-4 text-brand" aria-hidden="true" />
                  {item.label}
                </span>
              );
            })}
          </div>
        </div>
        <DeviceShowcase
          content={{
            brand: content.showcaseBrand,
            eyebrow: content.showcaseEyebrow,
            title: content.showcaseTitle,
            meta: content.showcaseMeta,
            rowLabel: content.showcaseRowLabel,
            posters: content.posters,
          }}
        />
      </Container>
    </section>
  );
}

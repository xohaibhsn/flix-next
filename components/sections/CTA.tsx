import { ArrowRight } from "lucide-react";
import { ButtonLink } from "@/components/ui/ButtonLink";
import type { CtaData, SiteSettings } from "@/lib/cms/types";
import { createDefaultSectionData } from "@/lib/cms/defaults";
import { publicWhatsAppSalesUrl } from "@/lib/cms/public-contact";
import { isBrowseCtaLabel, resolveSalesHref } from "@/lib/cms/whatsapp-messages";

export function CTA({ data, settings }: { data?: CtaData; settings?: SiteSettings }) {
  const content = data ?? (createDefaultSectionData("cta") as CtaData);
  const salesUrl = settings ? publicWhatsAppSalesUrl(settings) : "";
  const href = isBrowseCtaLabel(content.buttonLabel)
    ? "#pricing"
    : resolveSalesHref(content.buttonLabel, content.buttonHref, salesUrl);

  return (
    <section className="bg-ink py-16">
      <div className="mx-auto max-w-3xl px-5 text-center">
        <h2 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
          {content.heading}
        </h2>
        <p className="mt-3 text-sm text-white/65">{content.description}</p>
        <ButtonLink href={href} className="mt-8 min-h-11">
          {content.buttonLabel}
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </ButtonLink>
      </div>
    </section>
  );
}

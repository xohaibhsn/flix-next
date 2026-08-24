import { Check } from "lucide-react";
import { ButtonLink } from "@/components/ui/ButtonLink";
import { Container } from "@/components/ui/Container";
import { SectionHeading } from "@/components/ui/SectionHeading";
import type { PricingData, SiteSettings } from "@/lib/cms/types";
import { createDefaultSectionData } from "@/lib/cms/defaults";
import { publicWhatsAppPlanUrl } from "@/lib/cms/public-contact";

export function Pricing({
  data,
  settings,
  pageUrl,
}: {
  data?: PricingData;
  settings?: SiteSettings;
  pageUrl?: string;
}) {
  const content = data ?? (createDefaultSectionData("pricing") as PricingData);

  return (
    <section id="pricing" className="scroll-mt-24 bg-white py-20">
      <Container>
        <SectionHeading
          eyebrow={content.eyebrow || undefined}
          title={content.heading}
          description={content.description || undefined}
        />
        <div className="mt-14 grid items-stretch gap-6 lg:grid-cols-3">
          {content.plans.map((plan) => {
            const planUrl = settings ? publicWhatsAppPlanUrl(settings, plan, pageUrl) : "";
            const href = planUrl || plan.buttonHref || "/contact/";
            return (
              <article
                key={plan.id}
                className={`relative flex flex-col rounded-2xl border bg-white p-8 ${
                  plan.popular
                    ? "border-brand shadow-xl shadow-brand/10 lg:-translate-y-3"
                    : "border-line shadow-sm"
                }`}
              >
                {plan.popular || plan.badge ? (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-brand px-4 py-1 text-[11px] font-bold tracking-wide text-white uppercase">
                    {plan.badge || "Most Popular"}
                  </span>
                ) : null}
                <h3 className="text-center text-lg font-bold text-ink">{plan.name}</h3>
                <p className="mt-4 text-center">
                  <span className="text-4xl font-extrabold text-brand">${plan.price}</span>
                  <span className="text-sm text-muted">{plan.duration}</span>
                </p>
                <p className="mt-1 h-4" />
                <ul className="mt-6 flex flex-1 flex-col gap-2.5">
                  {plan.features.filter(Boolean).map((feature) => (
                    <li key={feature} className="flex items-center gap-2 text-sm text-ink/80">
                      <Check className="h-4 w-4 shrink-0 text-brand" aria-hidden="true" />
                      {feature}
                    </li>
                  ))}
                </ul>
                <ButtonLink
                  href={href}
                  variant={plan.popular ? "primary" : "outline"}
                  className="mt-8 w-full min-h-11"
                  aria-label={`${plan.buttonLabel || "Choose Plan"}: ${plan.name}`}
                >
                  {plan.buttonLabel || "Choose Plan"}
                </ButtonLink>
              </article>
            );
          })}
        </div>
      </Container>
    </section>
  );
}

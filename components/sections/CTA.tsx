import { ArrowRight } from "lucide-react";
import { ButtonLink } from "@/components/ui/ButtonLink";
import type { CtaData } from "@/lib/cms/types";
import { createDefaultSectionData } from "@/lib/cms/defaults";

export function CTA({ data }: { data?: CtaData }) {
  const content = data ?? (createDefaultSectionData("cta") as CtaData);

  return (
    <section className="bg-ink py-16">
      <div className="mx-auto max-w-3xl px-5 text-center">
        <h2 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
          {content.heading}
        </h2>
        <p className="mt-3 text-sm text-white/65">{content.description}</p>
        <ButtonLink href={content.buttonHref} className="mt-8">
          {content.buttonLabel}
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </ButtonLink>
      </div>
    </section>
  );
}

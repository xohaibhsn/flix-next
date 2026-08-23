import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { Container } from "@/components/ui/Container";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { getIcon } from "@/lib/cms/icons";
import type { ServicesData } from "@/lib/cms/types";
import { createDefaultSectionData } from "@/lib/cms/defaults";

const TONES = {
  red: "bg-red-50 text-brand",
  purple: "bg-violet-50 text-violet-600",
  green: "bg-emerald-50 text-emerald-600",
};

export function Services({ data }: { data?: ServicesData }) {
  const content = data ?? (createDefaultSectionData("services") as ServicesData);

  return (
    <section className="bg-paper py-20">
      <Container>
        <SectionHeading
          eyebrow={content.eyebrow || undefined}
          title={content.heading}
          description={content.description || undefined}
        />
        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {content.cards.map((card) => {
            const Icon = getIcon(card.icon);
            return (
              <article
                key={card.id}
                className="rounded-xl border border-line bg-white p-7 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
              >
                <span
                  className={`inline-flex h-12 w-12 items-center justify-center rounded-full ${TONES[card.tone] ?? TONES.red}`}
                >
                  <Icon className="h-6 w-6" aria-hidden="true" />
                </span>
                <h3 className="mt-5 text-xl font-bold text-ink">{card.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{card.description}</p>
                {card.linkLabel ? (
                  <Link
                    href={card.linkHref || "/"}
                    className="mt-5 inline-flex items-center gap-1 text-sm font-semibold text-brand hover:underline"
                  >
                    {card.linkLabel} <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </Link>
                ) : null}
              </article>
            );
          })}
        </div>
      </Container>
    </section>
  );
}

import { Container } from "@/components/ui/Container";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { getIcon } from "@/lib/cms/icons";
import type { HowItWorksData } from "@/lib/cms/types";
import { createDefaultSectionData } from "@/lib/cms/defaults";

export function HowItWorks({ data }: { data?: HowItWorksData }) {
  const content = data ?? (createDefaultSectionData("how-it-works") as HowItWorksData);

  return (
    <section className="bg-white py-20">
      <Container>
        <SectionHeading
          eyebrow={content.eyebrow || undefined}
          title={content.heading}
          description={content.description || undefined}
        />
        <div
          className={`mt-14 grid gap-10 md:gap-6 ${
            content.steps.length >= 4 ? "md:grid-cols-2 xl:grid-cols-4" : "md:grid-cols-3"
          }`}
        >
          {content.steps.map((step, i) => {
            const Icon = getIcon(step.icon);
            return (
              <div key={step.id} className="relative text-center">
                {content.steps.length <= 3 && i < content.steps.length - 1 ? (
                  <div className="pointer-events-none absolute top-7 left-[58%] hidden h-px w-[84%] border-t-2 border-dashed border-brand/30 md:block" />
                ) : null}
                <div className="relative mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-brand text-xl font-extrabold text-white shadow-lg shadow-brand/30">
                  {step.number}
                </div>
                <div className="mx-auto mt-5 flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-brand">
                  <Icon className="h-6 w-6" aria-hidden="true" />
                </div>
                <h3 className="mt-4 text-lg font-bold text-ink">{step.title}</h3>
                <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-muted">
                  {step.description}
                </p>
              </div>
            );
          })}
        </div>
      </Container>
    </section>
  );
}

import { Container } from "@/components/ui/Container";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { getIcon } from "@/lib/cms/icons";
import type { WhyChooseData } from "@/lib/cms/types";
import { createDefaultSectionData } from "@/lib/cms/defaults";

export function WhyChooseUs({ data }: { data?: WhyChooseData }) {
  const content = data ?? (createDefaultSectionData("why-choose") as WhyChooseData);

  return (
    <section className="bg-white py-20">
      <Container>
        <SectionHeading
          eyebrow={content.eyebrow || undefined}
          title={content.heading}
          description={content.description || undefined}
        />
        <div className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {content.items.map((item) => {
            const Icon = getIcon(item.icon);
            return (
              <div key={item.id} className="flex gap-4">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-red-50 text-brand">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <div>
                  <h3 className="font-bold text-ink">{item.title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-muted">{item.description}</p>
                </div>
              </div>
            );
          })}
        </div>
      </Container>
    </section>
  );
}

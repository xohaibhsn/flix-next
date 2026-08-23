"use client";

import { useId, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { SectionHeading } from "@/components/ui/SectionHeading";
import type { FaqData } from "@/lib/cms/types";
import { createDefaultSectionData } from "@/lib/cms/defaults";

export function FAQ({ data }: { data?: FaqData }) {
  const content = data ?? (createDefaultSectionData("faq") as FaqData);
  const [open, setOpen] = useState<number | null>(0);
  const baseId = useId();

  return (
    <section id="faq" className="scroll-mt-24 bg-paper py-20">
      <Container>
        <SectionHeading
          eyebrow={content.eyebrow || undefined}
          title={content.heading}
          description={content.description || undefined}
        />
        <div className="mt-12 grid gap-4 md:grid-cols-2">
          {content.items.map((item, i) => {
            const isOpen = open === i;
            const buttonId = `${baseId}-button-${i}`;
            const panelId = `${baseId}-panel-${i}`;
            return (
              <div key={item.id} className="rounded-xl border border-line bg-white">
                <h3>
                  <button
                    type="button"
                    id={buttonId}
                    className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
                    onClick={() => setOpen(isOpen ? null : i)}
                    aria-expanded={isOpen}
                    aria-controls={panelId}
                  >
                    <span className="text-sm font-semibold text-ink">{item.question}</span>
                    <ChevronDown
                      className={`h-4 w-4 shrink-0 text-brand transition ${isOpen ? "rotate-180" : ""}`}
                      aria-hidden="true"
                    />
                  </button>
                </h3>
                <div
                  id={panelId}
                  role="region"
                  aria-labelledby={buttonId}
                  hidden={!isOpen}
                  className="border-t border-line px-5 py-4"
                >
                  <p className="text-sm leading-relaxed text-muted">{item.answer}</p>
                </div>
              </div>
            );
          })}
        </div>
      </Container>
    </section>
  );
}

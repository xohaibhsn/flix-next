import { Container } from "@/components/ui/Container";
import { getIcon } from "@/lib/cms/icons";
import type { DevicesData } from "@/lib/cms/types";
import { createDefaultSectionData } from "@/lib/cms/defaults";

export function Devices({ data }: { data?: DevicesData }) {
  const content = data ?? (createDefaultSectionData("devices") as DevicesData);

  return (
    <section className="border-y border-line bg-paper py-10">
      <Container>
        <p className="text-center text-xs font-bold tracking-[0.2em] text-muted uppercase">
          {content.eyebrow || "Works on all your devices"}
        </p>
        {content.heading ? (
          <h2 className="mt-3 text-center text-2xl font-extrabold text-ink">{content.heading}</h2>
        ) : null}
        <div className="mt-6 flex flex-wrap items-center justify-center gap-x-10 gap-y-5">
          {content.items.map((item) => {
            const Icon = getIcon(item.icon);
            return (
              <div key={item.id} className="flex flex-col items-center gap-2 text-ink/80">
                <Icon className="h-7 w-7 text-brand" strokeWidth={1.6} aria-hidden="true" />
                <span className="text-xs font-semibold">{item.label}</span>
              </div>
            );
          })}
        </div>
      </Container>
    </section>
  );
}

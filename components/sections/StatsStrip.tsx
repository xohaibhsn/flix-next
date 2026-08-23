import { Container } from "@/components/ui/Container";
import { getIcon } from "@/lib/cms/icons";
import type { HighlightsData } from "@/lib/cms/types";
import { createDefaultSectionData } from "@/lib/cms/defaults";

export function StatsStrip({ data }: { data?: HighlightsData }) {
  const content = data ?? (createDefaultSectionData("highlights") as HighlightsData);
  const cols =
    content.items.length >= 6
      ? "xl:grid-cols-6"
      : content.items.length === 4
        ? "lg:grid-cols-4"
        : "lg:grid-cols-3";

  return (
    <section className="border-b border-line bg-white">
      <Container className={`grid gap-6 py-8 sm:grid-cols-2 ${cols}`}>
        {content.items.map((item) => {
          const Icon = getIcon(item.icon);
          return (
            <div key={item.id} className="flex items-center gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 border-brand/80 text-brand">
                <Icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <div>
                <p className="text-sm font-semibold text-ink">{item.label}</p>
                {item.subtitle ? (
                  <p className="text-xs text-muted">{item.subtitle}</p>
                ) : null}
              </div>
            </div>
          );
        })}
      </Container>
    </section>
  );
}

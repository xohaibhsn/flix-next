import { Container } from "@/components/ui/Container";
import { getIcon } from "@/lib/cms/icons";
import type { TrustStatsData } from "@/lib/cms/types";
import { createDefaultSectionData } from "@/lib/cms/defaults";

export function TrustStats({ data }: { data?: TrustStatsData }) {
  const content = data ?? (createDefaultSectionData("trust-stats") as TrustStatsData);

  return (
    <section className="bg-ink py-14">
      <Container className="grid grid-cols-2 gap-8 text-center lg:grid-cols-4">
        {content.items.map((item) => {
          const Icon = getIcon(item.icon);
          return (
            <div key={item.id}>
              <Icon className="mx-auto mb-2 h-5 w-5 text-brand" aria-hidden="true" />
              <p className="text-3xl font-extrabold text-brand sm:text-4xl">{item.value}</p>
              <p className="mt-1 text-sm font-medium text-white/70">{item.label}</p>
            </div>
          );
        })}
      </Container>
    </section>
  );
}

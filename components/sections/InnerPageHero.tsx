import { Container } from "@/components/ui/Container";
import type { PageHeroData } from "@/lib/cms/types";

export function InnerPageHero({ data }: { data: PageHeroData }) {
  return (
    <section className="hero-grid relative overflow-hidden pt-[96px] pb-16">
      <Container className="max-w-3xl">
        {data.eyebrow ? (
          <p className="inline-flex rounded-full border border-brand/40 bg-brand/10 px-3.5 py-1 text-[12px] font-medium text-white/90">
            {data.eyebrow}
          </p>
        ) : null}
        <h1 className="mt-5 text-4xl font-extrabold tracking-tight text-white sm:text-5xl">
          {data.heading}
          {data.highlight ? (
            <>
              {" "}
              <span className="text-brand">{data.highlight}</span>
            </>
          ) : null}
        </h1>
        {data.description ? (
          <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-white/70">{data.description}</p>
        ) : null}
      </Container>
    </section>
  );
}

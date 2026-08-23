import { Container } from "@/components/ui/Container";

export function PageHero({
  eyebrow,
  title,
  accent,
  description,
}: {
  eyebrow: string;
  title: string;
  accent?: string;
  description: string;
}) {
  return (
    <section className="hero-grid relative overflow-hidden pt-[96px] pb-16">
      <Container className="max-w-3xl">
        <p className="inline-flex rounded-full border border-brand/40 bg-brand/10 px-3.5 py-1 text-[12px] font-medium text-white/90">
          {eyebrow}
        </p>
        <h1 className="mt-5 text-4xl font-extrabold tracking-tight text-white sm:text-5xl">
          {title}
          {accent ? (
            <>
              {" "}
              <span className="text-brand">{accent}</span>
            </>
          ) : null}
        </h1>
        <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-white/70">
          {description}
        </p>
      </Container>
    </section>
  );
}

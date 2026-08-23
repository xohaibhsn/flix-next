export function SectionHeading({
  eyebrow,
  title,
  description,
  light = false,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  light?: boolean;
}) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      {eyebrow ? (
        <p className="text-xs font-bold tracking-[0.22em] text-brand uppercase">
          {eyebrow}
        </p>
      ) : null}
      <h2
        className={`text-3xl font-extrabold tracking-tight sm:text-4xl ${eyebrow ? "mt-3" : ""} ${light ? "text-white" : "text-ink"}`}
      >
        {title}
      </h2>
      {description ? (
        <p className={`mt-3 text-sm leading-relaxed ${light ? "text-white/70" : "text-muted"}`}>
          {description}
        </p>
      ) : null}
    </div>
  );
}

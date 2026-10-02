import Link from "next/link";
import {
  seoHealthStatusMessage,
  type SeoHealthFinding,
  type SeoHealthReport as SeoHealthReportData,
  type SeoHealthSeverity,
  type SeoHealthSource,
} from "@/lib/cms/seo-health";

const SOURCE_LABELS: Record<SeoHealthSource, string> = {
  metadata: "Metadata",
  "internal-link": "Internal links",
  image: "Images",
};

const SECTION_COPY: Record<
  Exclude<SeoHealthSeverity, "healthy">,
  { title: string; description: string; empty: string; badge: string }
> = {
  "needs-attention": {
    title: "Needs Attention",
    description: "Start with these items. Each one needs a manual check before any change is made.",
    empty: "Nothing needs urgent attention in this scan.",
    badge: "border-red-200 bg-red-50 text-red-800",
  },
  review: {
    title: "Review",
    description: "These may be intentional, but they are worth checking.",
    empty: "No review items were found.",
    badge: "border-amber-200 bg-amber-50 text-amber-900",
  },
  editorial: {
    title: "Editorial Suggestions",
    description: "Optional wording and presentation improvements, not technical errors.",
    empty: "No editorial suggestions were found.",
    badge: "border-sky-200 bg-sky-50 text-sky-900",
  },
};

function safeInternalHref(value: string | null) {
  return value && /^\/(?!\/)/.test(value) ? value : null;
}

function safePublicHref(value: string) {
  if (/^\/(?!\/)/.test(value)) return value;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? value : null;
  } catch {
    return null;
  }
}

function FindingCard({ finding }: { finding: SeoHealthFinding }) {
  const copy = SECTION_COPY[finding.severity as Exclude<SeoHealthSeverity, "healthy">];
  const reviewHref = safeInternalHref(finding.reviewHref);
  const detailHref = safeInternalHref(finding.detailHref);
  const publicHref = safePublicHref(finding.publicUrl);

  return (
    <article className="rounded-lg border border-line bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-xs font-semibold tracking-wide text-muted uppercase">
            {SOURCE_LABELS[finding.source]} · {finding.entity.type}
          </p>
          <h3 className="mt-1 font-semibold text-ink">{finding.title}</h3>
        </div>
        <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${copy.badge}`}>
          {finding.action === "required"
            ? "Manual action needed"
            : finding.action === "review"
              ? "Review first"
              : "Optional suggestion"}
        </span>
      </div>

      <p className="mt-2 text-sm leading-relaxed text-muted">{finding.explanation}</p>
      <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-[8rem_1fr]">
        <dt className="font-semibold text-ink">Affected item</dt>
        <dd>{finding.entity.label}</dd>
        <dt className="font-semibold text-ink">Public URL</dt>
        <dd className="min-w-0 break-all">
          {publicHref ? (
            <a href={publicHref} target="_blank" rel="noreferrer" className="text-brand hover:underline">
              {finding.publicUrl}
            </a>
          ) : (
            finding.publicUrl || "Not applicable"
          )}
        </dd>
      </dl>

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-sm">
        {reviewHref ? (
          <Link href={reviewHref} className="font-semibold text-brand hover:underline">
            Review affected item →
          </Link>
        ) : null}
        {detailHref ? (
          <Link href={detailHref} className="font-semibold text-brand hover:underline">
            View detailed {SOURCE_LABELS[finding.source].toLowerCase()} report →
          </Link>
        ) : null}
      </div>

      {finding.evidence.length ? (
        <details className="mt-3 rounded-md bg-paper px-3 py-2 text-xs text-muted">
          <summary className="cursor-pointer font-semibold text-ink">Technical details</summary>
          <ul className="mt-2 space-y-1">
            {finding.evidence.map((item, index) => (
              <li key={`${finding.id}:evidence:${index}`} className="break-words">
                {item}
              </li>
            ))}
          </ul>
          <p className="mt-2 font-mono text-[11px]">Diagnostic code: {finding.issueCode}</p>
        </details>
      ) : null}
    </article>
  );
}

function FindingSection({
  severity,
  findings,
}: {
  severity: Exclude<SeoHealthSeverity, "healthy">;
  findings: SeoHealthFinding[];
}) {
  const copy = SECTION_COPY[severity];
  const rows = findings.filter((finding) => finding.severity === severity);

  return (
    <section className="rounded-xl border border-line bg-white p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="font-semibold">{copy.title}</h2>
          <p className="mt-1 text-sm text-muted">{copy.description}</p>
        </div>
        <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${copy.badge}`}>
          {rows.length}
        </span>
      </div>
      {rows.length ? (
        <div className="mt-4 space-y-3">
          {rows.map((finding) => (
            <FindingCard key={finding.id} finding={finding} />
          ))}
        </div>
      ) : (
        <p className="mt-4 rounded-lg bg-paper px-3 py-2 text-sm text-muted">{copy.empty}</p>
      )}
    </section>
  );
}

function ScanButton({ hasReport }: { hasReport: boolean }) {
  return (
    <form action="/sidhu/seo/health/" method="get">
      <button
        type="submit"
        name="run"
        value="1"
        className="rounded-md bg-brand px-5 py-2.5 text-sm font-semibold text-white"
      >
        {hasReport ? "Run SEO Health Check Again" : "Run SEO Health Check"}
      </button>
    </form>
  );
}

export function SeoHealthReport({ report }: { report: SeoHealthReportData | null }) {
  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-line bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl">
            <h2 className="font-semibold">Manual SEO Health Check</h2>
            <p className="mt-1 text-sm leading-relaxed text-muted">
              This read-only check brings together the existing metadata, internal-link, and image diagnostics. It
              does not change pages, links, redirects, images, or search settings.
            </p>
          </div>
          <ScanButton hasReport={Boolean(report)} />
        </div>
        {!report ? (
          <p className="mt-4 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900">
            No scan has run yet. Select “Run SEO Health Check” when you are ready.
          </p>
        ) : null}
        <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-sm">
          <Link href="/sidhu/seo/" className="font-semibold text-brand hover:underline">
            ← SEO overview
          </Link>
          <Link href="/sidhu/seo/metadata-diagnostics/" className="font-semibold text-brand hover:underline">
            Detailed metadata report
          </Link>
          <Link href="/sidhu/seo/internal-links/" className="font-semibold text-brand hover:underline">
            Detailed internal-link report
          </Link>
          <Link href="/sidhu/seo/image-diagnostics/" className="font-semibold text-brand hover:underline">
            Detailed image report
          </Link>
        </div>
      </section>

      {report ? (
        <>
          <section className="rounded-xl border border-line bg-white p-5">
            <h2 className="font-semibold">Scan summary</h2>
            <p
              className={`mt-2 rounded-lg border px-3 py-2 text-sm ${
                report.summary.needsAttention
                  ? "border-red-200 bg-red-50 text-red-800"
                  : "border-emerald-200 bg-emerald-50 text-emerald-800"
              }`}
            >
              {seoHealthStatusMessage(report.summary)}
            </p>
            <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {[
                ["Needs Attention", report.summary.needsAttention],
                ["Review", report.summary.review],
                ["Editorial Suggestions", report.summary.editorial],
                ["Healthy checks", report.summary.healthy],
              ].map(([label, value]) => (
                <div key={label} className="rounded-lg border border-line bg-paper px-3 py-2">
                  <p className="text-[11px] font-semibold tracking-wide text-muted uppercase">{label}</p>
                  <p className="mt-1 text-lg font-semibold text-ink">{value}</p>
                </div>
              ))}
            </div>
          </section>

          <FindingSection severity="needs-attention" findings={report.findings} />
          <FindingSection severity="review" findings={report.findings} />
          <FindingSection severity="editorial" findings={report.findings} />

          <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-5">
            <h2 className="font-semibold text-emerald-900">Healthy / No Action Needed</h2>
            <p className="mt-1 text-sm text-emerald-900/80">
              Kept compact so valid items do not overwhelm the report. These are counts from the existing specialist
              diagnostics, not an SEO score.
            </p>
            <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
              <div className="rounded-lg bg-white/70 px-3 py-2">
                <dt className="text-xs font-semibold text-emerald-900">Metadata entities</dt>
                <dd className="mt-1 text-lg font-semibold">{report.summary.healthyBySource.metadata}</dd>
              </div>
              <div className="rounded-lg bg-white/70 px-3 py-2">
                <dt className="text-xs font-semibold text-emerald-900">Valid internal links</dt>
                <dd className="mt-1 text-lg font-semibold">{report.summary.healthyBySource["internal-link"]}</dd>
              </div>
              <div className="rounded-lg bg-white/70 px-3 py-2">
                <dt className="text-xs font-semibold text-emerald-900">Images reported healthy</dt>
                <dd className="mt-1 text-lg font-semibold">{report.summary.healthyBySource.image}</dd>
              </div>
            </dl>
          </section>
        </>
      ) : null}
    </div>
  );
}

import {
  SeoHealthAiExplain,
  type SeoHealthAiExplainActionInput,
  type SeoHealthAiExplainActionResult,
} from "@/components/sidhu/SeoHealthAiExplain";
import { Button } from "@/components/sidhu/ui/Button";
import { ListActionLink, ListActions } from "@/components/sidhu/ui/ListActions";
import { RelatedWorkspaces } from "@/components/sidhu/ui/RelatedWorkspaces";
import { toSeoExplainFindingInput } from "@/lib/cms/ai-seo/schemas";
import {
  seoHealthStatusMessage,
  type SeoHealthFinding,
  type SeoHealthReport as SeoHealthReportData,
  type SeoHealthSeverity,
  type SeoHealthSource,
} from "@/lib/cms/seo-health";
import type {
  SeoHealthAnnotatedFinding,
  SeoHealthFindingIdentity,
  SeoHealthWorkflowView,
} from "@/lib/cms/seo-health-memory";

type SeoHealthFindingAction = (formData: FormData) => void | Promise<void>;
type SeoHealthAiExplainAction = (
  input: SeoHealthAiExplainActionInput,
) => Promise<SeoHealthAiExplainActionResult>;

const RELATED_SEO_WORKSPACES = [
  {
    href: "/sidhu/seo/",
    title: "SEO Overview",
    description: "Control Center hub for all SEO workspaces.",
  },
  {
    href: "/sidhu/seo/metadata-diagnostics/",
    title: "Metadata Report",
    description: "Titles, descriptions, and canonical diagnostics.",
  },
  {
    href: "/sidhu/seo/internal-links/",
    title: "Internal Links",
    description: "Href and orphan link diagnostics.",
  },
  {
    href: "/sidhu/seo/image-diagnostics/",
    title: "Image Report",
    description: "Alt text and media coverage diagnostics.",
  },
] as const;

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
    empty: "No open review items were found.",
    badge: "border-amber-200 bg-amber-50 text-amber-900",
  },
  editorial: {
    title: "Editorial Suggestions",
    description: "Optional wording and presentation improvements, not technical errors.",
    empty: "No open editorial suggestions were found.",
    badge: "border-sky-200 bg-sky-50 text-sky-900",
  },
};

const STATUS_BADGE: Record<"new" | "existing" | "accepted", string> = {
  new: "border-violet-200 bg-violet-50 text-violet-900",
  existing: "border-slate-200 bg-slate-50 text-slate-800",
  accepted: "border-emerald-200 bg-emerald-50 text-emerald-900",
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

function FindingCard({
  finding,
  fingerprint,
  status,
  acceptAction,
  reopenAction,
  openaiConfigured = false,
  geminiConfigured = false,
  aiExplainAction,
  siteName,
}: {
  finding: SeoHealthFinding;
  fingerprint?: string;
  status?: "new" | "existing" | "accepted";
  acceptAction?: SeoHealthFindingAction;
  reopenAction?: SeoHealthFindingAction;
  openaiConfigured?: boolean;
  geminiConfigured?: boolean;
  aiExplainAction?: SeoHealthAiExplainAction;
  siteName?: string;
}) {
  const copy = SECTION_COPY[finding.severity as Exclude<SeoHealthSeverity, "healthy">];
  const reviewHref = safeInternalHref(finding.reviewHref);
  const detailHref = safeInternalHref(finding.detailHref);
  const publicHref = safePublicHref(finding.publicUrl);
  const itemLabel = `${finding.title} — ${finding.entity.label}`;
  const canAccept =
    Boolean(acceptAction) &&
    Boolean(fingerprint) &&
    status !== "accepted" &&
    (finding.severity === "editorial" || finding.severity === "review");

  return (
    <article className="rounded-lg border border-line bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-xs font-semibold tracking-wide text-muted uppercase">
            {SOURCE_LABELS[finding.source]} · {finding.entity.type}
          </p>
          <h3 className="mt-1 font-semibold text-ink">{finding.title}</h3>
        </div>
        <div className="flex flex-wrap gap-2">
          {status ? (
            <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${STATUS_BADGE[status]}`}>
              {status === "new" ? "New" : status === "existing" ? "Existing" : "Reviewed"}
            </span>
          ) : null}
          <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${copy.badge}`}>
            {finding.action === "required"
              ? "Manual action needed"
              : finding.action === "review"
                ? "Review first"
                : "Optional suggestion"}
          </span>
        </div>
      </div>

      <p className="mt-2 text-sm leading-relaxed text-muted">{finding.explanation}</p>
      <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-[8rem_1fr]">
        <dt className="font-semibold text-ink">Affected item</dt>
        <dd>{finding.entity.label}</dd>
        {finding.imageAltStatus ? (
          <>
            <dt className="font-semibold text-ink">Saved alt status</dt>
            <dd>{finding.imageAltStatus}</dd>
          </>
        ) : null}
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

      {finding.usageContexts?.length ? (
        <div className="mt-3 rounded-md bg-paper px-3 py-2 text-sm">
          <p className="font-semibold text-ink">Used as</p>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-muted">
            {finding.usageContexts.map((context) => (
              <li key={`${finding.id}:usage:${context}`}>{context}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <ListActions>
          {reviewHref ? (
            <ListActionLink href={reviewHref} variant="secondary">
              Review item
            </ListActionLink>
          ) : null}
          {detailHref ? (
            <ListActionLink href={detailHref} variant="quiet">
              View {SOURCE_LABELS[finding.source].toLowerCase()} report
            </ListActionLink>
          ) : null}
        </ListActions>
        {canAccept && fingerprint && acceptAction ? (
          <details className="rounded-md border border-line bg-paper px-3 py-2">
            <summary className="cursor-pointer text-sm font-semibold text-ink">Mark reviewed — no action</summary>
            <p className="mt-2 text-xs text-muted">Acknowledge this item as acceptable / no action required:</p>
            <p className="mt-1 text-sm text-ink">{itemLabel}</p>
            <form action={acceptAction} className="mt-2">
              <input type="hidden" name="fingerprint" value={fingerprint} />
              <Button type="submit" variant="primary" className="min-h-9 px-3 text-sm">
                Confirm reviewed — no action
              </Button>
            </form>
          </details>
        ) : null}
        {fingerprint && status === "accepted" && reopenAction ? (
          <form action={reopenAction}>
            <input type="hidden" name="fingerprint" value={fingerprint} />
            <Button type="submit" variant="secondary" className="min-h-9 px-3 text-sm">
              Reopen
            </Button>
          </form>
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

      {finding.severity !== "healthy" ? (
        <SeoHealthAiExplain
          openaiConfigured={openaiConfigured}
          geminiConfigured={geminiConfigured}
          explainAction={aiExplainAction}
          finding={toSeoExplainFindingInput(finding, { siteName })}
        />
      ) : null}
    </article>
  );
}

function ResolvedCard({ item }: { item: SeoHealthFindingIdentity }) {
  const publicHref = safePublicHref(item.publicUrl);
  return (
    <article className="rounded-lg border border-emerald-200 bg-white p-4">
      <p className="text-xs font-semibold tracking-wide text-muted uppercase">
        {SOURCE_LABELS[item.source]} · {item.entityType}
      </p>
      <h3 className="mt-1 font-semibold text-ink">{item.title}</h3>
      <p className="mt-2 text-sm text-muted">{item.entityLabel}</p>
      <p className="mt-2 min-w-0 break-all text-sm">
        {publicHref ? (
          <a href={publicHref} target="_blank" rel="noreferrer" className="text-brand hover:underline">
            {item.publicUrl}
          </a>
        ) : (
          item.publicUrl || "Not applicable"
        )}
      </p>
      <p className="mt-2 font-mono text-[11px] text-muted">Diagnostic code: {item.issueCode}</p>
    </article>
  );
}

function FindingSection({
  severity,
  items,
  acceptAction,
  reopenAction,
  openaiConfigured = false,
  geminiConfigured = false,
  aiExplainAction,
  siteName,
}: {
  severity: Exclude<SeoHealthSeverity, "healthy">;
  items: SeoHealthAnnotatedFinding[];
  acceptAction?: SeoHealthFindingAction;
  reopenAction?: SeoHealthFindingAction;
  openaiConfigured?: boolean;
  geminiConfigured?: boolean;
  aiExplainAction?: SeoHealthAiExplainAction;
  siteName?: string;
}) {
  const copy = SECTION_COPY[severity];
  const rows = items.filter((item) => item.finding.severity === severity);

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
          {rows.map((item) => (
            <FindingCard
              key={item.finding.id}
              finding={item.finding}
              fingerprint={item.fingerprint}
              status={item.status}
              acceptAction={acceptAction}
              reopenAction={reopenAction}
              openaiConfigured={openaiConfigured}
              geminiConfigured={geminiConfigured}
              aiExplainAction={aiExplainAction}
              siteName={siteName}
            />
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
      <Button type="submit" name="run" value="1" variant="primary" className="min-h-10 px-5">
        {hasReport ? "Run SEO Health Check Again" : "Run SEO Health Check"}
      </Button>
    </form>
  );
}

export function SeoHealthReport({
  report,
  workflow = null,
  stateWarning = null,
  acceptAction,
  reopenAction,
  openaiConfigured = false,
  geminiConfigured = false,
  aiExplainAction,
  siteName,
}: {
  report: SeoHealthReportData | null;
  workflow?: SeoHealthWorkflowView | null;
  stateWarning?: string | null;
  acceptAction?: SeoHealthFindingAction;
  reopenAction?: SeoHealthFindingAction;
  openaiConfigured?: boolean;
  geminiConfigured?: boolean;
  aiExplainAction?: SeoHealthAiExplainAction;
  siteName?: string;
}) {
  const openItems = workflow?.open || (report ? report.findings.map((finding) => ({
    finding,
    fingerprint: "",
    status: "new" as const,
  })) : []);

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
        {stateWarning ? (
          <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            {stateWarning}
          </p>
        ) : null}
        <RelatedWorkspaces title="Related SEO workspaces" items={RELATED_SEO_WORKSPACES} />
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

          {workflow ? (
            <section className="rounded-xl border border-line bg-white p-5">
              <h2 className="font-semibold">Workflow memory</h2>
              <p className="mt-1 text-sm text-muted">
                {workflow.hasBaseline
                  ? "Compared with the previous manual scan. Accepted items stay out of the open list until reopened or the underlying value changes."
                  : "First saved scan. Current findings are marked New so the next scan can show what changed."}
              </p>
              <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  ["New", workflow.counts.new],
                  ["Open", workflow.counts.open],
                  ["Resolved since last scan", workflow.counts.resolved],
                  ["Reviewed / Accepted", workflow.counts.accepted],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-lg border border-line bg-paper px-3 py-2">
                    <p className="text-[11px] font-semibold tracking-wide text-muted uppercase">{label}</p>
                    <p className="mt-1 text-lg font-semibold text-ink">{value}</p>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          <FindingSection
            severity="needs-attention"
            items={openItems}
            acceptAction={acceptAction}
            reopenAction={reopenAction}
            openaiConfigured={openaiConfigured}
            geminiConfigured={geminiConfigured}
            aiExplainAction={aiExplainAction}
            siteName={siteName}
          />
          <FindingSection
            severity="review"
            items={openItems}
            acceptAction={acceptAction}
            reopenAction={reopenAction}
            openaiConfigured={openaiConfigured}
            geminiConfigured={geminiConfigured}
            aiExplainAction={aiExplainAction}
            siteName={siteName}
          />
          <FindingSection
            severity="editorial"
            items={openItems}
            acceptAction={acceptAction}
            reopenAction={reopenAction}
            openaiConfigured={openaiConfigured}
            geminiConfigured={geminiConfigured}
            aiExplainAction={aiExplainAction}
            siteName={siteName}
          />

          {workflow && workflow.resolved.length ? (
            <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-5">
              <h2 className="font-semibold text-emerald-900">Resolved since last scan</h2>
              <p className="mt-1 text-sm text-emerald-900/80">
                These findings were present in the previous scan and are no longer reported.
              </p>
              <div className="mt-4 space-y-3">
                {workflow.resolved.map((item) => (
                  <ResolvedCard key={`resolved:${item.fingerprint}`} item={item} />
                ))}
              </div>
            </section>
          ) : null}

          {workflow && workflow.accepted.length ? (
            <section className="rounded-xl border border-line bg-white p-5">
              <h2 className="font-semibold">Reviewed / Accepted</h2>
              <p className="mt-1 text-sm text-muted">
                Checked and intentionally left as-is. The scanner still reports them; they are only removed from the
                open-work list.
              </p>
              <div className="mt-4 space-y-3">
                {workflow.accepted.map((item) => (
                  <FindingCard
                    key={`accepted:${item.finding.id}`}
                    finding={item.finding}
                    fingerprint={item.fingerprint}
                    status="accepted"
                    acceptAction={acceptAction}
                    reopenAction={reopenAction}
                    openaiConfigured={openaiConfigured}
                    geminiConfigured={geminiConfigured}
                    aiExplainAction={aiExplainAction}
                    siteName={siteName}
                  />
                ))}
              </div>
            </section>
          ) : null}

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

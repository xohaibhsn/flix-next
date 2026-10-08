import Link from "next/link";
import { SectionCard } from "@/components/sidhu/ui/SectionCard";
import { ListActionLink, ListActions } from "@/components/sidhu/ui/ListActions";
import { formatLedgerMysqlUtcLabel } from "@/lib/cms/seo-experiment-ledger/read-cursor";
import type { SeoResearchRunRow } from "@/lib/cms/seo-experiment-ledger/types";

export type SeoLedgerListLoadState =
  | { kind: "ok"; runs: SeoResearchRunRow[]; nextCursor: string | null }
  | { kind: "empty" }
  /** Valid cursor past the last page — not the same as an empty Ledger. */
  | { kind: "exhausted" }
  | { kind: "unavailable" }
  | { kind: "error"; message: string }
  | { kind: "invalid_cursor" };

function researchLabel(run: SeoResearchRunRow) {
  return run.researchOk ? "SUCCESS" : "FAILED";
}

function StatusPill({
  tone,
  children,
}: {
  tone: "neutral" | "ok" | "warn" | "fail";
  children: string;
}) {
  const cls =
    tone === "ok"
      ? "bg-emerald-50 text-emerald-800"
      : tone === "fail"
        ? "bg-red-50 text-red-800"
        : tone === "warn"
          ? "bg-amber-50 text-amber-900"
          : "bg-paper text-muted";
  return (
    <span className={`inline-flex rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${cls}`}>
      {children}
    </span>
  );
}

function researchTone(run: SeoResearchRunRow): "ok" | "fail" {
  return run.researchOk ? "ok" : "fail";
}

function pipelineTone(status: string): "ok" | "warn" | "neutral" {
  if (status === "OK") return "ok";
  if (status === "CONTEXT_ERROR") return "warn";
  return "neutral";
}

export function SeoLedgerRunList({
  state,
  nextHref,
}: {
  state: SeoLedgerListLoadState;
  nextHref?: string | null;
}) {
  return (
    <div className="space-y-5">
      <SectionCard className="space-y-2">
        <h2 className="text-lg font-semibold text-ink">Experiment Ledger</h2>
        <p className="text-sm text-muted">
          Read-only history of Research runs and stored RF / NBA / Priority decisions. Nothing here
          re-runs Research, Proceed, or publishing.
        </p>
      </SectionCard>

      {state.kind === "unavailable" ? (
        <SectionCard padding="sm">
          <p className="text-sm text-muted">Ledger database unavailable.</p>
        </SectionCard>
      ) : null}

      {state.kind === "error" ? (
        <SectionCard padding="sm">
          <p className="text-sm text-muted">{state.message || "Unable to load Ledger history."}</p>
        </SectionCard>
      ) : null}

      {state.kind === "invalid_cursor" ? (
        <SectionCard padding="sm">
          <p className="text-sm text-muted">
            Invalid page cursor.{" "}
            <Link href="/sidhu/seo/ledger/" className="font-semibold text-ink underline">
              Return to the first page
            </Link>
            .
          </p>
        </SectionCard>
      ) : null}

      {state.kind === "empty" ? (
        <SectionCard padding="sm">
          <p className="text-sm text-muted">No Research history yet.</p>
        </SectionCard>
      ) : null}

      {state.kind === "exhausted" ? (
        <SectionCard padding="sm">
          <p className="text-sm text-muted">
            No more Research runs on this page.{" "}
            <Link href="/sidhu/seo/ledger/" className="font-semibold text-ink underline">
              Return to the first page
            </Link>
            .
          </p>
        </SectionCard>
      ) : null}

      {state.kind === "ok" ? (
        <>
          <SectionCard padding="none" className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-line bg-paper text-[11px] uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-3 font-semibold">Created (UTC)</th>
                  <th className="px-4 py-3 font-semibold">Source</th>
                  <th className="px-4 py-3 font-semibold">Research</th>
                  <th className="px-4 py-3 font-semibold">Pipeline</th>
                  <th className="px-4 py-3 font-semibold">Opps</th>
                  <th className="px-4 py-3 font-semibold">GSC</th>
                  <th className="px-4 py-3 font-semibold">Durability</th>
                  <th className="px-4 py-3 font-semibold"> </th>
                </tr>
              </thead>
              <tbody>
                {state.runs.map((run) => (
                  <tr key={run.id} className="border-b border-line last:border-0">
                    <td className="px-4 py-3 align-top text-ink">
                      {formatLedgerMysqlUtcLabel(run.createdAt)}
                    </td>
                    <td className="px-4 py-3 align-top text-muted">{run.source}</td>
                    <td className="px-4 py-3 align-top">
                      <div className="flex flex-col gap-1">
                        <StatusPill tone={researchTone(run)}>{researchLabel(run)}</StatusPill>
                        {!run.researchOk && run.researchErrorCode ? (
                          <span className="font-mono text-[11px] text-muted">
                            {run.researchErrorCode}
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <StatusPill tone={pipelineTone(run.pipelineRunStatus)}>
                        {run.pipelineRunStatus}
                      </StatusPill>
                    </td>
                    <td className="px-4 py-3 align-top text-ink">{run.opportunityCount}</td>
                    <td className="px-4 py-3 align-top text-muted">{run.gscStatus || "—"}</td>
                    <td className="px-4 py-3 align-top text-muted">{run.durabilityStatus}</td>
                    <td className="px-4 py-3 align-top">
                      <ListActions>
                        <ListActionLink href={`/sidhu/seo/ledger/${encodeURIComponent(run.id)}/`}>
                          Open
                        </ListActionLink>
                      </ListActions>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </SectionCard>

          {nextHref ? (
            <div className="flex justify-end">
              <Link
                href={nextHref}
                className="inline-flex min-h-10 items-center rounded-md border border-line bg-admin-surface px-3 text-sm font-semibold text-ink hover:bg-paper"
              >
                Next page
              </Link>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

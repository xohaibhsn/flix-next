"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type {
  InternalLinkFinding,
  InternalLinkIssue,
  InternalLinkSummary,
} from "@/lib/cms/internal-links";
import { filterFindings } from "@/lib/cms/internal-links";

type FilterKey = "all" | "problems" | InternalLinkIssue;

const FILTERS: Array<{ key: FilterKey; label: string }> = [
  { key: "all", label: "All" },
  { key: "problems", label: "Problems" },
  { key: "BROKEN", label: "Broken" },
  { key: "REDIRECTED", label: "Redirected" },
  { key: "HTTP", label: "HTTP" },
  { key: "WWW", label: "WWW" },
  { key: "LEGACY_BLOG", label: "Legacy blog" },
  { key: "LEGACY_SUBSCRIPTION", label: "Legacy subscription" },
  { key: "SELF_LINK", label: "Self-link" },
  { key: "NOINDEX_TARGET", label: "Noindex target" },
  { key: "VALID", label: "Valid" },
];

function issueClass(issue: InternalLinkIssue) {
  if (issue === "VALID") return "bg-emerald-50 text-emerald-900";
  if (issue === "EXTERNAL") return "bg-slate-100 text-slate-700";
  return "bg-amber-100 text-amber-950";
}

export function InternalLinksReport({
  findings,
  summary,
  orphans,
}: {
  findings: InternalLinkFinding[];
  summary: InternalLinkSummary;
  orphans: Array<{ kind: string; label: string; path: string; note: string }>;
}) {
  const [filter, setFilter] = useState<FilterKey>("problems");
  const [query, setQuery] = useState("");

  const rows = useMemo(() => filterFindings(findings, filter, query), [findings, filter, query]);

  const counts: Array<{ label: string; value: number }> = [
    { label: "Internal scanned", value: summary.totalInternal },
    { label: "Valid", value: summary.VALID },
    { label: "Broken", value: summary.BROKEN },
    { label: "Redirected", value: summary.REDIRECTED },
    { label: "HTTP", value: summary.HTTP },
    { label: "WWW", value: summary.WWW },
    { label: "Legacy blog", value: summary.LEGACY_BLOG },
    { label: "Legacy subscription", value: summary.LEGACY_SUBSCRIPTION },
    { label: "Self-link", value: summary.SELF_LINK },
    { label: "Noindex target", value: summary.NOINDEX_TARGET },
  ];

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-line bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold">Internal link diagnostics</h2>
            <p className="mt-1 max-w-3xl text-sm text-muted">
              Read-only scan of CMS content, navigation, and known code-defined links. Links are not rewritten.
              Redirects are reported only — they are not changed.
            </p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <Link href="/sidhu/seo/" className="text-sm font-semibold text-brand hover:underline">
              ← SEO overview
            </Link>
            <Link href="/sidhu/seo/metadata-diagnostics/" className="text-sm font-semibold text-brand hover:underline">
              Metadata diagnostics →
            </Link>
            <Link href="/sidhu/seo/image-diagnostics/" className="text-sm font-semibold text-brand hover:underline">
              Image diagnostics →
            </Link>
          </div>
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          {counts.map((item) => (
            <div key={item.label} className="rounded-lg border border-line bg-paper px-3 py-2">
              <p className="text-[11px] font-semibold tracking-wide text-muted uppercase">{item.label}</p>
              <p className="mt-1 text-lg font-semibold text-ink">{item.value}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-line bg-white p-5">
        <div className="flex flex-wrap items-center gap-2">
          {FILTERS.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setFilter(item.key)}
              className={`rounded-md border px-3 py-1.5 text-xs font-semibold ${
                filter === item.key ? "border-brand bg-brand text-white" : "border-line bg-white text-ink"
              }`}
            >
              {item.label}
            </button>
          ))}
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search title or URL…"
            className="ml-auto min-w-[200px] flex-1 rounded-md border border-line px-3 py-1.5 text-sm"
          />
        </div>

        <div className="mt-4 overflow-x-auto rounded-lg border border-line">
          <table className="w-full min-w-[1080px] text-left text-sm">
            <thead className="bg-paper text-xs tracking-wide text-muted uppercase">
              <tr>
                <th className="px-3 py-3">Source</th>
                <th className="px-3 py-3">Source URL</th>
                <th className="px-3 py-3">Anchor</th>
                <th className="px-3 py-3">Stored href</th>
                <th className="px-3 py-3">Final target</th>
                <th className="px-3 py-3">Issue</th>
                <th className="px-3 py-3">Edit</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-sm text-muted">
                    No links match this filter.
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.id} className="border-t border-line align-top">
                    <td className="px-3 py-3">
                      <p className="font-medium">{row.sourceLabel}</p>
                      <p className="mt-1 text-[11px] text-muted">
                        {row.sourceKind === "code" ? "CODE-DEFINED · " : ""}
                        {row.context}
                      </p>
                    </td>
                    <td className="px-3 py-3 text-xs break-all text-muted">{row.sourceUrl}</td>
                    <td className="px-3 py-3 text-xs">{row.anchorText || "—"}</td>
                    <td className="px-3 py-3 text-xs break-all">{row.storedHref}</td>
                    <td className="px-3 py-3 text-xs break-all text-muted">{row.finalPath || "—"}</td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap gap-1">
                        {row.issues.map((issue) => (
                          <span
                            key={issue}
                            className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${issueClass(issue)}`}
                          >
                            {issue}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      {row.editHref ? (
                        <Link href={row.editHref} className="font-semibold text-brand">
                          Edit source
                        </Link>
                      ) : (
                        <span className="text-xs text-muted">—</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-muted">
          Showing {rows.length} of {findings.length} scanned links. No automatic fix is available in this phase.
        </p>
      </section>

      {orphans.length ? (
        <section className="rounded-xl border border-line bg-white p-5">
          <h2 className="font-semibold">No discovered internal links</h2>
          <p className="mt-1 text-sm text-muted">
            Published/indexable destinations with zero inbound links found in this scan. Utility/legal pages are
            excluded. This is informational only — not an automatic SEO score.
          </p>
          <ul className="mt-3 space-y-2 text-sm">
            {orphans.slice(0, 40).map((item) => (
              <li key={item.path} className="flex flex-wrap gap-2 border-t border-line pt-2 first:border-t-0 first:pt-0">
                <span className="font-medium">{item.label}</span>
                <span className="text-muted">{item.path}</span>
                <span className="text-xs text-muted">({item.kind}) · {item.note}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

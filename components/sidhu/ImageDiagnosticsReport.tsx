"use client";

import { useMemo, useState } from "react";
import { ListActionLink, ListActions } from "@/components/sidhu/ui/ListActions";
import { RelatedWorkspaces } from "@/components/sidhu/ui/RelatedWorkspaces";
import type {
  ImageDiagnosticsSummary,
  ImageFilter,
  ImageFinding,
  ImageIssue,
} from "@/lib/cms/image-diagnostics";
import { filterImageFindings } from "@/lib/cms/image-diagnostics";

const FILTERS: Array<{ key: ImageFilter; label: string }> = [
  { key: "all", label: "All" },
  { key: "missing", label: "Missing Alt" },
  { key: "media-missing", label: "Stored Alt Missing" },
  { key: "fallback", label: "Fallback" },
  { key: "stale", label: "Stale HTML" },
  { key: "filename", label: "Filename Alt" },
  { key: "decorative", label: "Decorative" },
  { key: "valid", label: "Valid" },
];

function issueClass(issue: ImageIssue) {
  if (issue === "VALID" || issue === "DECORATIVE_OK" || issue === "BRAND_OK" || issue === "SOCIAL_ONLY") {
    return "bg-emerald-50 text-emerald-900";
  }
  if (issue === "FALLBACK_ALT" || issue === "DUPLICATE_ALT_HINT" || issue === "MEDIA_ALT_NOT_SET") {
    return "bg-slate-100 text-slate-800";
  }
  return "bg-amber-100 text-amber-950";
}

export function ImageDiagnosticsReport({
  findings,
  summary,
}: {
  findings: ImageFinding[];
  summary: ImageDiagnosticsSummary;
}) {
  const [filter, setFilter] = useState<ImageFilter>("all");
  const [query, setQuery] = useState("");
  const rows = useMemo(() => filterImageFindings(findings, filter, query), [findings, filter, query]);

  const counts: Array<{ label: string; value: number }> = [
    { label: "Public images discovered", value: summary.publicImages },
    { label: "Content images", value: summary.content },
    { label: "Decorative images", value: summary.decorative },
    { label: "Stored media alt missing", value: summary.mediaAltMissing },
    { label: "Rendered alt missing", value: summary.renderedAltMissing },
    { label: "Fallback hero alt", value: summary.fallbackAlt },
    { label: "Stale HTML alt", value: summary.staleHtmlAlt },
    { label: "Filename-like alt", value: summary.filenameAlt },
    { label: "Valid / decorative OK", value: summary.validOrDecorativeOk },
  ];

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-line bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold">Image / alt diagnostics</h2>
            <p className="mt-1 max-w-3xl text-sm text-muted">
              Read-only coverage of Media Library alts, blog heroes, listing thumbnails, and rich HTML images.
              Nothing is rewritten. Media Library alt changes do not update old TipTap HTML automatically.
            </p>
          </div>
        </div>
        <RelatedWorkspaces
          title="Related SEO workspaces"
          items={[
            {
              href: "/sidhu/seo/",
              title: "SEO Overview",
              description: "Control Center hub.",
            },
            {
              href: "/sidhu/seo/internal-links/",
              title: "Internal Links",
              description: "Href and orphan diagnostics.",
            },
            {
              href: "/sidhu/seo/metadata-diagnostics/",
              title: "Metadata Report",
              description: "Titles, descriptions, canonicals.",
            },
          ]}
        />
        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
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
            placeholder="Search title, URL, or alt…"
            className="ml-auto min-w-[200px] flex-1 rounded-md border border-line px-3 py-1.5 text-sm"
          />
        </div>

        <div className="mt-4 overflow-x-auto rounded-lg border border-line">
          <table className="w-full min-w-[1180px] text-left text-sm">
            <thead className="bg-paper text-xs tracking-wide text-muted uppercase">
              <tr>
                <th className="px-3 py-3">Source</th>
                <th className="px-3 py-3">URL</th>
                <th className="px-3 py-3">Image</th>
                <th className="px-3 py-3">Stored media alt</th>
                <th className="px-3 py-3">Rendered / HTML alt</th>
                <th className="px-3 py-3">Class</th>
                <th className="px-3 py-3">Issues</th>
                <th className="px-3 py-3">Edit</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-3 py-8 text-center text-muted">
                    No images match this filter.
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.id} className="border-t border-line align-top">
                    <td className="px-3 py-3">
                      <p className="font-medium">{row.sourceTitle}</p>
                      <p className="mt-1 text-[11px] text-muted uppercase">{row.sourceType}</p>
                      {row.note ? <p className="mt-1 text-xs text-muted">{row.note}</p> : null}
                    </td>
                    <td className="px-3 py-3 text-xs break-all text-muted">{row.sourceUrl}</td>
                    <td className="px-3 py-3">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={row.imageUrl}
                        alt=""
                        className="h-14 w-20 rounded border border-line object-cover bg-paper"
                      />
                    </td>
                    <td className="px-3 py-3 text-xs break-words">
                      {row.storedMediaAlt == null ? "—" : row.storedMediaAlt || "(blank)"}
                    </td>
                    <td className="px-3 py-3 text-xs break-words">
                      {row.altAttributeMissing
                        ? "(attribute missing)"
                        : row.renderedAlt == null
                          ? "—"
                          : row.renderedAlt === ""
                            ? '""'
                            : row.renderedAlt}
                    </td>
                    <td className="px-3 py-3 text-xs font-semibold tracking-wide text-muted uppercase">
                      {row.semantic}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap gap-1">
                        {row.issues.map((issue) => (
                          <span key={issue} className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${issueClass(issue)}`}>
                            {issue}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <ListActions>
                        {row.editHref ? (
                          <ListActionLink href={row.editHref} variant="secondary">
                            Edit source
                          </ListActionLink>
                        ) : null}
                        {row.editMediaHref ? (
                          <ListActionLink href={row.editMediaHref} variant="quiet">
                            Edit media
                          </ListActionLink>
                        ) : null}
                        {!row.editHref && !row.editMediaHref ? (
                          <span className="text-xs text-muted">—</span>
                        ) : null}
                      </ListActions>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-muted">
          Showing {rows.length} of {findings.length} rows. No automatic fix is available in this phase. “No discovered
          public reference” is not an orphan claim.
        </p>
      </section>
    </div>
  );
}

"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type {
  DuplicateGroup,
  MetadataDiagnosticsSummary,
  MetadataFilter,
  MetadataIssue,
  SeoMetadataEntity,
} from "@/lib/cms/metadata-diagnostics";
import { filterMetadataEntities } from "@/lib/cms/metadata-diagnostics";

const FILTERS: Array<{ key: MetadataFilter; label: string }> = [
  { key: "all", label: "All" },
  { key: "duplicates", label: "Duplicates" },
  { key: "canonical", label: "Canonical" },
  { key: "missing", label: "Missing" },
  { key: "warnings", label: "Warnings" },
  { key: "noindex", label: "Noindex" },
];

function issueClass(issue: MetadataIssue) {
  if (issue.startsWith("CANONICAL_") || issue === "DUPLICATE_TITLE" || issue === "DUPLICATE_DESCRIPTION") {
    return "bg-amber-100 text-amber-950";
  }
  return "bg-slate-100 text-slate-800";
}

function DuplicateSection({
  title,
  groups,
  entities,
}: {
  title: string;
  groups: DuplicateGroup[];
  entities: SeoMetadataEntity[];
}) {
  if (!groups.length) {
    return (
      <section className="rounded-xl border border-line bg-white p-5">
        <h2 className="font-semibold">{title}</h2>
        <p className="mt-2 text-sm text-muted">None detected.</p>
      </section>
    );
  }
  const byId = new Map(entities.map((e) => [e.id, e]));
  return (
    <section className="rounded-xl border border-line bg-white p-5">
      <h2 className="font-semibold">{title}</h2>
      <div className="mt-4 space-y-4">
        {groups.map((group) => (
          <div key={group.key} className="rounded-lg border border-line p-3">
            <p className="text-sm font-medium break-words">{group.value}</p>
            <p className="mt-1 text-xs text-muted">{group.note}</p>
            <ul className="mt-2 space-y-1 text-sm">
              {group.entityIds.map((id) => {
                const entity = byId.get(id);
                if (!entity) return null;
                return (
                  <li key={id} className="flex flex-wrap items-center gap-2 border-t border-line pt-1 first:border-t-0 first:pt-0">
                    <span className="text-xs font-semibold tracking-wide text-muted uppercase">{entity.kind}</span>
                    <span>{entity.label}</span>
                    <span className="text-xs break-all text-muted">{entity.publicUrl}</span>
                    {entity.editHref ? (
                      <Link href={entity.editHref} className="text-xs font-semibold text-brand">
                        Edit source
                      </Link>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

export function MetadataDiagnosticsReport({
  entities,
  summary,
  duplicateTitles,
  duplicateDescriptions,
  noindexDuplicateTitles,
  noindexDuplicateDescriptions,
}: {
  entities: SeoMetadataEntity[];
  summary: MetadataDiagnosticsSummary;
  duplicateTitles: DuplicateGroup[];
  duplicateDescriptions: DuplicateGroup[];
  noindexDuplicateTitles: DuplicateGroup[];
  noindexDuplicateDescriptions: DuplicateGroup[];
}) {
  const [filter, setFilter] = useState<MetadataFilter>("all");
  const [query, setQuery] = useState("");
  const rows = useMemo(() => filterMetadataEntities(entities, filter, query), [entities, filter, query]);

  const counts: Array<{ label: string; value: number }> = [
    { label: "Indexable URLs", value: summary.indexable },
    { label: "Noindex URLs", value: summary.noindex },
    { label: "Duplicate-title groups", value: summary.duplicateTitleGroups },
    { label: "Duplicate-description groups", value: summary.duplicateDescriptionGroups },
    { label: "Canonical collisions", value: summary.canonicalCollisions },
    { label: "Canonical → redirect", value: summary.canonicalToRedirect },
    { label: "HTTP canonicals", value: summary.canonicalHttp },
    { label: "WWW canonicals", value: summary.canonicalWww },
    { label: "Missing / H1 gaps", value: summary.missingMetadata },
    { label: "Length warnings", value: summary.lengthWarnings },
  ];

  const canonicalRows = entities.filter((e) =>
    e.issues.some((i) => i.startsWith("CANONICAL_") || i === "INDEXABLE_TO_OTHER_CANONICAL"),
  );

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-line bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold">Metadata diagnostics</h2>
            <p className="mt-1 max-w-3xl text-sm text-muted">
              Read-only analysis of effective SEO titles, descriptions, and canonicals. Nothing is rewritten.
              Duplicate-title and duplicate-description groups count indexable URLs only.
            </p>
          </div>
          <div className="flex flex-col items-end gap-1 text-sm">
            <Link href="/sidhu/seo/" className="font-semibold text-brand hover:underline">
              ← SEO overview
            </Link>
            <Link href="/sidhu/seo/internal-links/" className="font-semibold text-brand hover:underline">
              Internal links →
            </Link>
            <Link href="/sidhu/seo/image-diagnostics/" className="font-semibold text-brand hover:underline">
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

      <DuplicateSection title="A. Duplicate titles (indexable)" groups={duplicateTitles} entities={entities} />
      <DuplicateSection
        title="B. Duplicate descriptions (indexable)"
        groups={duplicateDescriptions}
        entities={entities}
      />

      <section className="rounded-xl border border-line bg-white p-5">
        <h2 className="font-semibold">C. Canonical conflicts</h2>
        {canonicalRows.length === 0 ? (
          <p className="mt-2 text-sm text-muted">None detected.</p>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-lg border border-line">
            <table className="w-full min-w-[960px] text-left text-sm">
              <thead className="bg-paper text-xs tracking-wide text-muted uppercase">
                <tr>
                  <th className="px-3 py-3">Source</th>
                  <th className="px-3 py-3">Public URL</th>
                  <th className="px-3 py-3">Canonical</th>
                  <th className="px-3 py-3">Issues</th>
                  <th className="px-3 py-3">Edit</th>
                </tr>
              </thead>
              <tbody>
                {canonicalRows.map((row) => (
                  <tr key={row.id} className="border-t border-line align-top">
                    <td className="px-3 py-3">
                      <p className="font-medium">{row.label}</p>
                      <p className="text-[11px] text-muted uppercase">{row.kind}</p>
                    </td>
                    <td className="px-3 py-3 text-xs break-all text-muted">{row.publicUrl}</td>
                    <td className="px-3 py-3 text-xs break-all">{row.effectiveCanonical}</td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap gap-1">
                        {row.issues
                          .filter((i) => i.startsWith("CANONICAL_") || i === "INDEXABLE_TO_OTHER_CANONICAL")
                          .map((issue) => (
                            <span key={issue} className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${issueClass(issue)}`}>
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
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <DuplicateSection
        title="Noindex duplicate titles (excluded from primary totals)"
        groups={noindexDuplicateTitles}
        entities={entities}
      />
      <DuplicateSection
        title="Noindex duplicate descriptions (excluded from primary totals)"
        groups={noindexDuplicateDescriptions}
        entities={entities}
      />

      <section className="rounded-xl border border-line bg-white p-5">
        <h2 className="font-semibold">E. All public SEO entities</h2>
        <div className="mt-3 flex flex-wrap items-center gap-2">
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
          <table className="w-full min-w-[1100px] text-left text-sm">
            <thead className="bg-paper text-xs tracking-wide text-muted uppercase">
              <tr>
                <th className="px-3 py-3">Type</th>
                <th className="px-3 py-3">Name</th>
                <th className="px-3 py-3">Public URL</th>
                <th className="px-3 py-3">Effective title</th>
                <th className="px-3 py-3">Desc len</th>
                <th className="px-3 py-3">Canonical</th>
                <th className="px-3 py-3">Index</th>
                <th className="px-3 py-3">Issues</th>
                <th className="px-3 py-3">Edit</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-3 py-8 text-center text-muted">
                    No entities match this filter.
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.id} className="border-t border-line align-top">
                    <td className="px-3 py-3 text-xs font-semibold tracking-wide text-muted uppercase">{row.kind}</td>
                    <td className="px-3 py-3 font-medium">{row.label}</td>
                    <td className="px-3 py-3 text-xs break-all text-muted">{row.publicUrl}</td>
                    <td className="px-3 py-3 text-xs break-words">{row.effectiveTitle}</td>
                    <td className="px-3 py-3 text-xs">
                      {row.descriptionLength}
                      <span className="ml-1 text-muted">({row.descriptionLengthHint})</span>
                    </td>
                    <td className="px-3 py-3 text-xs break-all text-muted">{row.effectiveCanonical}</td>
                    <td className="px-3 py-3 text-xs">{row.robotsIndex ? "Index" : "Noindex"}</td>
                    <td className="px-3 py-3">
                      {row.issues.length ? (
                        <div className="flex flex-wrap gap-1">
                          {row.issues.map((issue) => (
                            <span key={issue} className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${issueClass(issue)}`}>
                              {issue}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs text-muted">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      {row.editHref ? (
                        <Link href={row.editHref} className="font-semibold text-brand">
                          Edit source
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-muted">
          Showing {rows.length} of {entities.length} entities. No automatic fix is available in this phase.
        </p>
      </section>
    </div>
  );
}

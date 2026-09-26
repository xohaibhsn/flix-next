"use client";

import Link from "next/link";
import type { SidhuSeoOverviewRow } from "@/lib/cms/sidhu-seo-preview";

function Flag({ children }: { children: string }) {
  return <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-semibold text-amber-900">{children}</span>;
}

export function SeoOverviewTable({ rows }: { rows: SidhuSeoOverviewRow[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-line">
      <table className="w-full min-w-[920px] text-left text-sm">
        <thead className="bg-paper text-xs tracking-wide text-muted uppercase">
          <tr>
            <th className="px-3 py-3">Type</th>
            <th className="px-3 py-3">Page</th>
            <th className="px-3 py-3">Public URL</th>
            <th className="px-3 py-3">SEO title</th>
            <th className="px-3 py-3">Desc</th>
            <th className="px-3 py-3">Index</th>
            <th className="px-3 py-3">Sitemap</th>
            <th className="px-3 py-3">Canonical</th>
            <th className="px-3 py-3">OG</th>
            <th className="px-3 py-3">Updated</th>
            <th className="px-3 py-3">Edit</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-t border-line align-top">
              <td className="px-3 py-3 text-xs font-semibold tracking-wide text-muted uppercase">{row.kind}</td>
              <td className="px-3 py-3">
                <p className="font-medium">{row.label}</p>
                {row.note ? <p className="mt-1 text-xs text-muted">{row.note}</p> : null}
                {row.flags.length ? (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {row.flags.map((flag) => (
                      <Flag key={flag}>{flag}</Flag>
                    ))}
                  </div>
                ) : null}
              </td>
              <td className="px-3 py-3 text-xs break-all text-muted">{row.publicUrl}</td>
              <td className="px-3 py-3">{row.seoTitle}</td>
              <td className="px-3 py-3 text-xs text-muted">{row.descriptionLength}</td>
              <td className="px-3 py-3">{row.indexLabel}</td>
              <td className="px-3 py-3">{row.sitemapLabel}</td>
              <td className="px-3 py-3">{row.canonicalLabel}</td>
              <td className="px-3 py-3">{row.ogLabel}</td>
              <td className="px-3 py-3 text-xs text-muted">{row.updated}</td>
              <td className="px-3 py-3">
                {row.editHref ? (
                  <Link href={row.editHref} className="font-semibold text-brand">
                    Edit
                  </Link>
                ) : (
                  <span className="text-xs text-muted">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

"use client";

import type { SidhuSeoPreviewModel } from "@/lib/cms/sidhu-seo-preview";
import { SIDHU_SEO_DESCRIPTION_GUIDE, SIDHU_SEO_TITLE_GUIDE } from "@/lib/cms/sidhu-seo-preview";

export function SeoPreview({ model }: { model: SidhuSeoPreviewModel }) {
  return (
    <div className="space-y-4">
      {model.warnings.length ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          <p className="text-xs font-semibold tracking-wide uppercase">Checks</p>
          <p className="mt-1 text-xs text-amber-800">Advisory only. These do not block save and are not a ranking score.</p>
          <ul className="mt-2 list-disc space-y-1 pl-4">
            {model.warnings.map((warning) => (
              <li key={warning.id}>{warning.text}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {model.keywordHints.length ? (
        <div className="rounded-md border border-line bg-paper px-3 py-2 text-sm">
          <p className="text-xs font-semibold tracking-wide text-ink/70 uppercase">Focus keyword</p>
          <p className="mt-1 text-xs text-muted">
            Planning hints for “{model.focusKeyword}”. Google does not read the focus keyword field.
          </p>
          <dl className="mt-2 grid gap-1 sm:grid-cols-2">
            {model.keywordHints.map((hint) => (
              <div key={hint.label} className="flex items-center justify-between gap-3 text-xs">
                <dt>{hint.label}</dt>
                <dd className={hint.found ? "font-semibold text-emerald-700" : "text-muted"}>{hint.found ? "Found" : "Not found"}</dd>
              </div>
            ))}
          </dl>
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-2">
        <div className="rounded-md border border-line bg-white p-4 text-sm">
          <p className="text-xs text-muted">Google-style preview</p>
          <p className="mt-1 text-[11px] text-muted">
            Counts are a guide ({SIDHU_SEO_TITLE_GUIDE} / {SIDHU_SEO_DESCRIPTION_GUIDE}). Google may still shorten this.
          </p>
          <p className="mt-2 text-lg leading-snug text-[#1a0dab]">{model.effectiveTitle || "Title"}</p>
          <p className="break-all text-xs text-emerald-700">{model.displayUrl}</p>
          <p className="mt-2 text-muted">{model.effectiveDescription || "Meta description"}</p>
          <p className="mt-3 text-xs text-muted">
            Title {model.titleLength}/{SIDHU_SEO_TITLE_GUIDE} · Description {model.descriptionLength}/{SIDHU_SEO_DESCRIPTION_GUIDE}
          </p>
        </div>
        <div className="rounded-md border border-line bg-white p-4 text-sm">
          <p className="text-xs text-muted">Social preview</p>
          <div className="mt-2 overflow-hidden rounded-md border border-line bg-paper">
            {model.ogImageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={model.ogImageUrl} alt="" className="h-36 w-full object-cover" />
            ) : (
              <div className="flex h-36 items-center justify-center text-xs text-muted">No OG image</div>
            )}
            <div className="space-y-1 bg-white p-3">
              <p className="text-[11px] tracking-wide text-muted uppercase">{model.siteName || "Flix IPTV"}</p>
              <p className="font-semibold leading-snug">{model.effectiveOgTitle || "OG title"}</p>
              <p className="text-xs text-muted">{model.effectiveOgDescription || "OG description"}</p>
              <p className="break-all text-[11px] text-muted">{model.displayUrl}</p>
              {model.ogImageNote ? <p className="text-[11px] text-muted">{model.ogImageNote}</p> : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

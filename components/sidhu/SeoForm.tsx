"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { saveSeoSettingsAction } from "@/lib/cms/actions";
import type { SiteSettings } from "@/lib/cms/types";
import { Banner, Field, TextArea } from "@/components/sidhu/fields";
import { parseJsonLdInput } from "@/lib/cms/json-ld-input";
import { PAGE_SEO_KEYS, PAGE_SEO_META } from "@/lib/cms/page-seo";

const JSON_LD_HINT =
  "Paste JSON-LD or a <script type=\"application/ld+json\"> wrapper. Invalid JSON is rejected and the last valid value is kept. Leave empty to render nothing.";

export function SeoForm({ settings: initial }: { settings: SiteSettings }) {
  const [settings, setSettings] = useState(initial);
  const [message, setMessage] = useState<{ tone: "ok" | "error" | "info"; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: "ok" | "error" | "info"; text: string } | null>(null);
  const savingLock = useRef(false);

  function validate() {
    const parsed = parseJsonLdInput(settings.siteCustomJsonLd || "");
    if (!parsed.ok) {
      setFeedback({ tone: "error", text: parsed.error });
      return;
    }
    if (!parsed.data) {
      setFeedback({ tone: "info", text: "Empty — nothing will be rendered." });
      return;
    }
    setFeedback({ tone: "ok", text: "Valid JSON-LD." });
  }

  async function save() {
    if (savingLock.current) return;
    savingLock.current = true;
    setSaving(true);
    try {
      const result = await saveSeoSettingsAction(settings);
      if (!result.ok) {
        setMessage({ tone: "error", text: result.error });
        return;
      }
      setSettings(result.settings);
      setMessage({ tone: "ok", text: "Site-wide schema saved." });
    } catch (error) {
      setMessage({
        tone: "error",
        text: error instanceof Error ? error.message : "Could not save SEO settings.",
      });
    } finally {
      savingLock.current = false;
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      {message ? <Banner tone={message.tone}>{message.text}</Banner> : null}

      <section className="rounded-xl border border-line bg-white p-5">
        <h2 className="font-semibold">SEO Overview</h2>
        <p className="mt-1 text-sm text-muted">
          Page metadata is edited in each page editor. Use the links below. Individual blog posts keep their SEO
          fields in the post editor.
        </p>
        <div className="mt-4 divide-y divide-line rounded-lg border border-line">
          {PAGE_SEO_KEYS.map((key) => {
            const seo = settings.pageSeo[key];
            const meta = PAGE_SEO_META[key];
            return (
              <article key={key} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="font-semibold">{meta.label}</p>
                  <p className="truncate text-sm">{seo.title || "No SEO title"}</p>
                  <p className="mt-1 line-clamp-2 text-xs text-muted">{seo.description || "No meta description"}</p>
                </div>
                <Link
                  href={meta.editorHref}
                  className="shrink-0 rounded-md bg-brand px-4 py-2 text-center text-sm font-semibold text-white"
                >
                  Edit SEO in Page
                </Link>
              </article>
            );
          })}
        </div>
      </section>

      <section className="space-y-4 rounded-xl border border-line bg-white p-5">
        <h2 className="font-semibold">Site-wide Custom JSON-LD Schema</h2>
        <p className="text-sm text-muted">
          Organization schema is automatically rendered on Home only. Use this field only for additional schema you
          intentionally want across the site.
        </p>
        <Field label="Site-wide Custom JSON-LD Schema" hint={JSON_LD_HINT}>
          <TextArea
            value={settings.siteCustomJsonLd || ""}
            onChange={(event) => setSettings({ ...settings, siteCustomJsonLd: event.target.value })}
            spellCheck={false}
            className="min-h-40 font-mono text-xs leading-relaxed"
            placeholder='{ "@context": "https://schema.org", "@type": "Service" }'
          />
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button type="button" className="rounded border border-line px-3 py-1 text-xs font-semibold" onClick={validate}>
              Validate
            </button>
            {feedback ? (
              <span className={feedback.tone === "error" ? "text-xs text-red-700" : "text-xs text-muted"}>
                {feedback.text}
              </span>
            ) : null}
          </div>
        </Field>
        <button
          type="button"
          disabled={saving}
          className="rounded-md bg-brand px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
          onClick={() => void save()}
        >
          {saving ? "Saving…" : "Save site-wide schema"}
        </button>
      </section>
    </div>
  );
}

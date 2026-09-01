"use client";

import { useRef, useState } from "react";
import { savePageSeoAction } from "@/lib/cms/actions";
import type { MediaAsset, PageSeo } from "@/lib/cms/types";
import { Banner, Field, TextArea, TextInput } from "@/components/sidhu/fields";
import { ImageField } from "@/components/sidhu/ImageField";
import { parseJsonLdInput } from "@/lib/cms/json-ld-input";
import { PAGE_SEO_META, type PageSeoKey } from "@/lib/cms/page-seo";

const JSON_LD_HINT =
  "Paste JSON-LD or a <script type=\"application/ld+json\"> wrapper. Invalid JSON is rejected and the last valid value is kept. Leave empty to render nothing.";

function JsonLdField({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const [feedback, setFeedback] = useState<{ tone: "ok" | "error" | "info"; text: string } | null>(null);

  function validate() {
    const parsed = parseJsonLdInput(value);
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

  return (
    <Field label={label} hint={hint}>
      <TextArea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        spellCheck={false}
        className="min-h-40 font-mono text-xs leading-relaxed"
        placeholder='{ "@context": "https://schema.org", "@type": "Service" }'
      />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button type="button" className="rounded border border-line px-3 py-1 text-xs font-semibold" onClick={validate}>
          Validate
        </button>
        {feedback ? (
          <span className={feedback.tone === "error" ? "text-xs text-red-700" : "text-xs text-muted"}>{feedback.text}</span>
        ) : null}
      </div>
    </Field>
  );
}

export function PageSeoPanel({
  pageKey,
  seo: initialSeo,
  assets: initialAssets,
  configured,
}: {
  pageKey: PageSeoKey;
  seo: PageSeo;
  assets: MediaAsset[];
  configured: boolean;
}) {
  const [seo, setSeo] = useState(initialSeo);
  const [assets, setAssets] = useState(initialAssets);
  const [message, setMessage] = useState<{ tone: "ok" | "error" | "info"; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const savingLock = useRef(false);
  const meta = PAGE_SEO_META[pageKey];

  function notice(text: string, tone: "ok" | "error" | "info" = "info") {
    setMessage({ tone, text });
  }

  function update(patch: Partial<PageSeo>) {
    setSeo((current) => ({ ...current, ...patch }));
  }

  async function save() {
    if (savingLock.current) return;
    savingLock.current = true;
    setSaving(true);
    try {
      const result = await savePageSeoAction(pageKey, seo);
      if (!result.ok) {
        setMessage({ tone: "error", text: result.error });
        return;
      }
      setSeo(result.settings.pageSeo[pageKey]);
      setMessage({ tone: "ok", text: "SEO settings saved. Public metadata will refresh." });
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
    <section className="space-y-4 rounded-xl border border-line bg-white p-5">
      <div>
        <h2 className="font-semibold">SEO Settings</h2>
        <p className="mt-1 text-sm text-muted">
          These fields are the same values used for the live {meta.label} page title, description, canonical, social
          preview, and custom JSON-LD.
        </p>
      </div>
      {message ? <Banner tone={message.tone}>{message.text}</Banner> : null}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-3">
          <Field label="SEO title">
            <TextInput value={seo.title} onChange={(event) => update({ title: event.target.value })} />
            <p className="mt-1 text-xs text-muted">{seo.title.length}/70</p>
          </Field>
          <Field label="Meta description">
            <TextArea value={seo.description} onChange={(event) => update({ description: event.target.value })} />
            <p className="mt-1 text-xs text-muted">{seo.description.length}/160</p>
          </Field>
          <Field label="Focus keyword">
            <TextInput value={seo.focusKeyword} onChange={(event) => update({ focusKeyword: event.target.value })} />
          </Field>
          <Field label="Canonical URL">
            <TextInput value={seo.canonicalUrl} onChange={(event) => update({ canonicalUrl: event.target.value })} />
          </Field>
          <label className="block text-sm">
            <input type="checkbox" checked={seo.robotsIndex} onChange={(event) => update({ robotsIndex: event.target.checked })} /> Index
          </label>
          <label className="block text-sm">
            <input type="checkbox" checked={seo.robotsFollow} onChange={(event) => update({ robotsFollow: event.target.checked })} /> Follow
          </label>
          <Field label="OG title">
            <TextInput value={seo.ogTitle} onChange={(event) => update({ ogTitle: event.target.value })} />
          </Field>
          <Field label="OG description">
            <TextArea value={seo.ogDescription} onChange={(event) => update({ ogDescription: event.target.value })} />
          </Field>
          <label className="block text-sm">
            <input
              type="checkbox"
              checked={seo.sitemapInclude}
              onChange={(event) => update({ sitemapInclude: event.target.checked })}
            />{" "}
            Include in sitemap
          </label>
        </div>
        <div className="rounded-md border border-line bg-paper p-4 text-sm">
          <p className="text-xs text-muted">SERP preview</p>
          <p className="mt-2 text-lg text-[#1a0dab]">{seo.title || "Title"}</p>
          <p className="text-xs text-emerald-700">{seo.canonicalUrl || "/"}</p>
          <p className="mt-2 text-muted">{seo.description || "Meta description"}</p>
        </div>
      </div>
      <JsonLdField
        label="Custom JSON-LD Schema"
        hint={`${JSON_LD_HINT} This is added to this page only and does not replace built-in schema.`}
        value={seo.customJsonLd || ""}
        onChange={(customJsonLd) => update({ customJsonLd })}
      />
      <ImageField
        title={`${meta.label} OG image`}
        specId="pageOg"
        value={seo.ogImage}
        folder="theflix/og"
        configured={configured}
        assets={assets}
        onChange={(ogImage) => update({ ogImage })}
        onUploaded={(asset) => setAssets((current) => [asset, ...current.filter((item) => item.id !== asset.id)])}
        onNotice={notice}
      />
      <button
        type="button"
        disabled={saving}
        className="rounded-md bg-brand px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
        onClick={() => void save()}
      >
        {saving ? "Saving…" : "Save SEO"}
      </button>
    </section>
  );
}

"use client";

import { useState } from "react";
import { saveSettingsAction } from "@/lib/cms/actions";
import type { MediaAsset, PageSeo, SiteSettings } from "@/lib/cms/types";
import { Banner, Field, TextArea, TextInput } from "@/components/sidhu/fields";
import { ImageField } from "@/components/sidhu/ImageField";

const PAGES: Array<{ key: keyof SiteSettings["pageSeo"]; label: string }> = [
  { key: "home", label: "Welcome / Home" },
  { key: "subscriptions", label: "IPTV Subscription" },
  { key: "contact", label: "Contact" },
  { key: "blog", label: "Blog listing" },
];

export function SeoForm({
  settings: initial,
  assets: initialAssets,
  configured,
}: {
  settings: SiteSettings;
  assets: MediaAsset[];
  configured: boolean;
}) {
  const [settings, setSettings] = useState(initial);
  const [assets, setAssets] = useState(initialAssets);
  const [message, setMessage] = useState<{ tone: "ok" | "error" | "info"; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  function notice(text: string, tone: "ok" | "error" | "info" = "info") {
    setMessage({ tone, text });
  }

  function update(key: keyof SiteSettings["pageSeo"], patch: Partial<PageSeo>) {
    setSettings({
      ...settings,
      pageSeo: { ...settings.pageSeo, [key]: { ...settings.pageSeo[key], ...patch } },
    });
  }

  async function save() {
    setSaving(true);
    const result = await saveSettingsAction(settings);
    setSaving(false);
    if (!result.ok) {
      setMessage({ tone: "error", text: result.error });
      return;
    }
    setSettings(result.settings);
    setMessage({ tone: "ok", text: "SEO settings saved. Metadata and sitemap will refresh." });
  }

  return (
    <div className="space-y-4">
      {message ? <Banner tone={message.tone}>{message.text}</Banner> : null}
      {PAGES.map((page) => {
        const seo = settings.pageSeo[page.key];
        return (
          <section key={page.key} className="space-y-4 rounded-xl border border-line bg-white p-5">
            <h2 className="font-semibold">{page.label}</h2>
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="space-y-3">
                <Field label="SEO title">
                  <TextInput value={seo.title} onChange={(event) => update(page.key, { title: event.target.value })} />
                  <p className="mt-1 text-xs text-muted">{seo.title.length}/70</p>
                </Field>
                <Field label="Meta description">
                  <TextArea value={seo.description} onChange={(event) => update(page.key, { description: event.target.value })} />
                  <p className="mt-1 text-xs text-muted">{seo.description.length}/160</p>
                </Field>
                <Field label="Focus keyword">
                  <TextInput value={seo.focusKeyword} onChange={(event) => update(page.key, { focusKeyword: event.target.value })} />
                </Field>
                <Field label="Canonical URL">
                  <TextInput value={seo.canonicalUrl} onChange={(event) => update(page.key, { canonicalUrl: event.target.value })} />
                </Field>
                <label className="block text-sm">
                  <input type="checkbox" checked={seo.robotsIndex} onChange={(event) => update(page.key, { robotsIndex: event.target.checked })} /> Index
                </label>
                <label className="block text-sm">
                  <input type="checkbox" checked={seo.robotsFollow} onChange={(event) => update(page.key, { robotsFollow: event.target.checked })} /> Follow
                </label>
                <Field label="OG title">
                  <TextInput value={seo.ogTitle} onChange={(event) => update(page.key, { ogTitle: event.target.value })} />
                </Field>
                <Field label="OG description">
                  <TextArea value={seo.ogDescription} onChange={(event) => update(page.key, { ogDescription: event.target.value })} />
                </Field>
                <label className="block text-sm">
                  <input type="checkbox" checked={seo.sitemapInclude} onChange={(event) => update(page.key, { sitemapInclude: event.target.checked })} /> Include in sitemap
                </label>
              </div>
              <div className="rounded-md border border-line bg-paper p-4 text-sm">
                <p className="text-xs text-muted">SERP preview</p>
                <p className="mt-2 text-lg text-[#1a0dab]">{seo.title || "Title"}</p>
                <p className="text-xs text-emerald-700">{seo.canonicalUrl || "/"}</p>
                <p className="mt-2 text-muted">{seo.description || "Meta description"}</p>
              </div>
            </div>
            <ImageField
              title={`${page.label} OG image`}
              specId="pageOg"
              value={seo.ogImage}
              folder="theflix/og"
              configured={configured}
              assets={assets}
              onChange={(ogImage) => update(page.key, { ogImage })}
              onUploaded={(asset) => setAssets((current) => [asset, ...current.filter((item) => item.id !== asset.id)])}
              onNotice={notice}
            />
          </section>
        );
      })}
      <button type="button" disabled={saving} className="rounded-md bg-brand px-5 py-2.5 text-sm font-semibold text-white" onClick={() => void save()}>
        {saving ? "Saving…" : "Save SEO"}
      </button>
    </div>
  );
}

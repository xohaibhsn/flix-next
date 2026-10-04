"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { draftSeoTitleMetaAction } from "@/lib/cms/ai-seo-actions";
import { savePageSeoAction } from "@/lib/cms/actions";
import { isEditorDirty } from "@/lib/cms/editor-dirty";
import type { CmsPage, MediaAsset, PageSeo, SiteSettings } from "@/lib/cms/types";
import { Banner, Field, TextArea, TextInput } from "@/components/sidhu/fields";
import { ImageField } from "@/components/sidhu/ImageField";
import { SeoAiDraftPanel } from "@/components/sidhu/SeoAiDraftPanel";
import { SeoPostSaveAdvisoryPanel } from "@/components/sidhu/SeoPostSaveAdvisoryPanel";
import { SeoPreview } from "@/components/sidhu/SeoPreview";
import { parseJsonLdInput } from "@/lib/cms/json-ld-input";
import { PAGE_SEO_META, type PageSeoKey } from "@/lib/cms/page-seo";
import type { SeoPostSaveAdvisory } from "@/lib/cms/seo-post-save-guard";
import {
  sidhuHeadingFromSections,
  sidhuPreviewFromPageSeo,
} from "@/lib/cms/sidhu-seo-preview";
import { CollapsiblePreview } from "@/components/sidhu/ui/CollapsiblePreview";
import { EditorTabPanel, EditorTabs } from "@/components/sidhu/ui/EditorTabs";
import { StickyEditorBar } from "@/components/sidhu/ui/StickyEditorBar";

const JSON_LD_HINT =
  "Paste JSON-LD or a <script type=\"application/ld+json\"> wrapper. Invalid JSON is rejected and the last valid value is kept. Leave empty to render nothing.";

type PageSeoTab = "seo" | "social" | "advanced";

const TABS: Array<{ id: PageSeoTab; label: string }> = [
  { id: "seo", label: "SEO" },
  { id: "social", label: "Social / OG" },
  { id: "advanced", label: "Advanced" },
];

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

/** Page SEO surface only — page content stays in the existing page builders. */
export function PageSeoPanel({
  pageKey,
  seo: initialSeo,
  assets: initialAssets,
  configured,
  settings,
  page,
  fallbackTitle,
  fallbackDescription = "",
}: {
  pageKey: PageSeoKey;
  seo: PageSeo;
  assets: MediaAsset[];
  configured: boolean;
  settings: SiteSettings;
  page?: CmsPage;
  fallbackTitle: string;
  fallbackDescription?: string;
}) {
  const [seo, setSeo] = useState(initialSeo);
  const [saved, setSaved] = useState(initialSeo);
  const [assets, setAssets] = useState(initialAssets);
  const [message, setMessage] = useState<{ tone: "ok" | "error" | "info"; text: string } | null>(null);
  const [seoAdvisory, setSeoAdvisory] = useState<SeoPostSaveAdvisory | null>(null);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<PageSeoTab>("seo");
  const savingLock = useRef(false);
  const dirty = useMemo(() => isEditorDirty(seo, saved), [seo, saved]);
  const meta = PAGE_SEO_META[pageKey];
  const preview = sidhuPreviewFromPageSeo(seo, {
    key: pageKey,
    fallbackTitle,
    fallbackDescription,
    siteName: settings.siteName,
    siteTagline: settings.tagline,
    defaultOgImage: settings.branding.defaultOgImage,
    contentTitle: sidhuHeadingFromSections(page?.sections) || fallbackTitle,
  });

  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

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
        setSeoAdvisory(null);
        return;
      }
      const next = result.settings.pageSeo[pageKey];
      setSeo(next);
      setSaved(next);
      setMessage({ tone: "ok", text: "SEO settings saved. Public metadata will refresh." });
      setSeoAdvisory(result.seoAdvisory ?? null);
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
    <section className="space-y-4 rounded-xl border border-line bg-admin-surface p-5">
      <div>
        <h2 className="font-semibold">SEO Settings</h2>
        <p className="mt-1 text-sm text-muted">
          Metadata for the live {meta.label} page. Page content is edited in the builder above.
        </p>
      </div>

      {message ? <Banner tone={message.tone}>{message.text}</Banner> : null}
      <SeoPostSaveAdvisoryPanel advisory={seoAdvisory} compact />

      <EditorTabs items={TABS} value={tab} onChange={setTab} ariaLabel="Page SEO sections" />

      <EditorTabPanel id="seo" active={tab === "seo"}>
        <div className="space-y-3">
          <Field label="SEO title" hint="Leave blank only if the fallback title is intentional.">
            <TextInput value={seo.title} onChange={(event) => update({ title: event.target.value })} />
            <p className="mt-1 text-xs text-muted">{seo.title.length}/70</p>
          </Field>
          <Field label="Meta description" hint="Shown under the title in search results.">
            <TextArea value={seo.description} onChange={(event) => update({ description: event.target.value })} />
            <p className="mt-1 text-xs text-muted">{seo.description.length}/160</p>
          </Field>
          <SeoAiDraftPanel
            draftAction={draftSeoTitleMetaAction}
            context={{
              entityKind: "page",
              entityLabel: meta.label,
              publicUrl: meta.publicPaths.find((path) => path.endsWith("/")) || meta.publicPaths[0] || "/",
              currentTitle: seo.title,
              currentDescription: seo.description,
              contentTitle: sidhuHeadingFromSections(page?.sections) || fallbackTitle,
              focusKeyword: seo.focusKeyword || undefined,
              siteName: settings.siteName,
              titleSuffix: ` | ${settings.siteName}`,
            }}
            onUseTitle={(value) => update({ title: value })}
            onUseDescription={(value) => update({ description: value })}
          />
          <Field label="Focus keyword" hint="Planning only — not read by Google.">
            <TextInput value={seo.focusKeyword} onChange={(event) => update({ focusKeyword: event.target.value })} />
          </Field>
          <CollapsiblePreview title="Search preview">
            <SeoPreview model={preview} />
          </CollapsiblePreview>
        </div>
      </EditorTabPanel>

      <EditorTabPanel id="social" active={tab === "social"}>
        <div className="space-y-3">
          <Field label="OG title" hint="Used when shared on social platforms.">
            <TextInput value={seo.ogTitle} onChange={(event) => update({ ogTitle: event.target.value })} />
          </Field>
          <Field label="OG description">
            <TextArea value={seo.ogDescription} onChange={(event) => update({ ogDescription: event.target.value })} />
          </Field>
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
          <p className="text-xs text-muted">Save SEO after choosing an image.</p>
          <CollapsiblePreview title="Social preview" defaultOpen={false}>
            <SeoPreview model={preview} />
          </CollapsiblePreview>
        </div>
      </EditorTabPanel>

      <EditorTabPanel id="advanced" active={tab === "advanced"}>
        <div className="space-y-3">
          <Field label="Canonical URL" hint="Usually leave blank to use the page’s normal URL.">
            <TextInput value={seo.canonicalUrl} onChange={(event) => update({ canonicalUrl: event.target.value })} />
          </Field>
          <label className="block text-sm">
            <input
              type="checkbox"
              checked={seo.robotsIndex}
              onChange={(event) => update({ robotsIndex: event.target.checked })}
            />{" "}
            Index
          </label>
          <label className="block text-sm">
            <input
              type="checkbox"
              checked={seo.robotsFollow}
              onChange={(event) => update({ robotsFollow: event.target.checked })}
            />{" "}
            Follow
          </label>
          <label className="block text-sm">
            <input
              type="checkbox"
              checked={seo.sitemapInclude}
              onChange={(event) => update({ sitemapInclude: event.target.checked })}
            />{" "}
            Include in sitemap
          </label>
          <JsonLdField
            label="Custom JSON-LD Schema"
            hint={`${JSON_LD_HINT} This is added to this page only and does not replace built-in schema.`}
            value={seo.customJsonLd || ""}
            onChange={(customJsonLd) => update({ customJsonLd })}
          />
        </div>
      </EditorTabPanel>

      <StickyEditorBar
        title={`${meta.label} SEO`}
        dirty={dirty}
        saving={saving}
        saveLabel="Save SEO"
        onSave={() => void save()}
      />
    </section>
  );
}

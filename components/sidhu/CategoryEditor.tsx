"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { draftSeoTitleMetaAction } from "@/lib/cms/ai-seo-actions";
import { saveCategoryAction } from "@/lib/cms/actions";
import {
  categoryEffectiveRobotsFollow,
  categoryEffectiveRobotsIndex,
  categoryEffectiveSitemapInclude,
} from "@/lib/cms/category-seo";
import { isEditorDirty } from "@/lib/cms/editor-dirty";
import { sidhuPreviewFromCategory } from "@/lib/cms/sidhu-seo-preview";
import type { BlogCategory, MediaAsset, MediaRef } from "@/lib/cms/types";
import { Banner, Field, TextArea, TextInput } from "@/components/sidhu/fields";
import { ImageField } from "@/components/sidhu/ImageField";
import { SeoAiDraftPanel } from "@/components/sidhu/SeoAiDraftPanel";
import { SeoPostSaveAdvisoryPanel } from "@/components/sidhu/SeoPostSaveAdvisoryPanel";
import { SeoPreview } from "@/components/sidhu/SeoPreview";
import { CollapsiblePreview } from "@/components/sidhu/ui/CollapsiblePreview";
import { EditorTabPanel, EditorTabs } from "@/components/sidhu/ui/EditorTabs";
import { StickyEditorBar } from "@/components/sidhu/ui/StickyEditorBar";
import { sidhuButtonClass } from "@/components/sidhu/ui/Button";
import type { SeoPostSaveAdvisory } from "@/lib/cms/seo-post-save-guard";

type CategoryTab = "content" | "seo" | "social" | "advanced";

const TABS: Array<{ id: CategoryTab; label: string }> = [
  { id: "content", label: "Content" },
  { id: "seo", label: "SEO" },
  { id: "social", label: "Social / OG" },
  { id: "advanced", label: "Advanced" },
];

export function CategoryEditor({
  category: initial,
  assets: initialAssets,
  configured,
  openaiConfigured = false,
  geminiConfigured = false,
  siteName,
  siteTagline,
  defaultOgImage,
}: {
  category: BlogCategory;
  assets: MediaAsset[];
  configured: boolean;
  openaiConfigured?: boolean;
  geminiConfigured?: boolean;
  siteName: string;
  siteTagline?: string;
  defaultOgImage?: MediaRef | null;
}) {
  const [draft, setDraft] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [assets, setAssets] = useState(initialAssets);
  const [message, setMessage] = useState<{ tone: "ok" | "error" | "info"; text: string } | null>(null);
  const [seoAdvisory, setSeoAdvisory] = useState<SeoPostSaveAdvisory | null>(null);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<CategoryTab>("content");
  const savingLock = useRef(false);
  const dirty = useMemo(() => isEditorDirty(draft, saved), [draft, saved]);

  const preview = sidhuPreviewFromCategory(draft, {
    siteName,
    siteTagline,
    defaultOgImage,
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

  function notice(text: string, tone: "ok" | "error" | "info" = "ok") {
    setMessage({ tone, text });
  }

  async function save() {
    if (savingLock.current) return;
    savingLock.current = true;
    setSaving(true);
    try {
      const result = await saveCategoryAction(draft);
      if (!result.ok) {
        notice(result.error, "error");
        setSeoAdvisory(null);
        return;
      }
      setDraft(result.category);
      setSaved(result.category);
      notice("Category saved.");
      setSeoAdvisory(result.seoAdvisory ?? null);
    } finally {
      savingLock.current = false;
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      {message ? <Banner tone={message.tone}>{message.text}</Banner> : null}
      <SeoPostSaveAdvisoryPanel advisory={seoAdvisory} compact />

      <EditorTabs items={TABS} value={tab} onChange={setTab} ariaLabel="Category editor sections" />

      <EditorTabPanel id="content" active={tab === "content"}>
        <section className="space-y-3 rounded-xl border border-line bg-admin-surface p-5">
          <Field label="Name">
            <TextInput value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
          </Field>
          <Field label="Slug" hint="Changing this can break existing links unless you add redirects.">
            <TextInput value={draft.slug} onChange={(event) => setDraft({ ...draft, slug: event.target.value })} />
          </Field>
          <Field label="Description" hint="Shown on the category archive page.">
            <TextArea
              value={draft.description}
              onChange={(event) => setDraft({ ...draft, description: event.target.value })}
            />
          </Field>
          <label className="block text-sm">
            <input
              type="checkbox"
              checked={draft.active}
              onChange={(event) => setDraft({ ...draft, active: event.target.checked })}
            />{" "}
            Active
            <span className="mt-1 block text-xs text-muted">Inactive categories are not public and leave the sitemap.</span>
          </label>
        </section>
      </EditorTabPanel>

      <EditorTabPanel id="seo" active={tab === "seo"}>
        <section className="space-y-3 rounded-xl border border-line bg-admin-surface p-5">
          <Field label="SEO title" hint="Leave blank to use the category name.">
            <TextInput value={draft.seoTitle} onChange={(event) => setDraft({ ...draft, seoTitle: event.target.value })} />
            <p className="mt-1 text-xs text-muted">{draft.seoTitle.length}/70</p>
          </Field>
          <Field label="Meta description" hint="Leave blank to use the category description.">
            <TextArea
              value={draft.seoDescription}
              onChange={(event) => setDraft({ ...draft, seoDescription: event.target.value })}
            />
            <p className="mt-1 text-xs text-muted">{draft.seoDescription.length}/160</p>
          </Field>
          <SeoAiDraftPanel
            draftAction={draftSeoTitleMetaAction}
            openaiConfigured={openaiConfigured}
            geminiConfigured={geminiConfigured}
            context={{
              entityKind: "category",
              entityLabel: draft.name || "Category",
              publicUrl: draft.slug ? `/category/${draft.slug}/` : "/blogs/",
              currentTitle: draft.seoTitle,
              currentDescription: draft.seoDescription,
              contentTitle: draft.name || undefined,
              excerpt: draft.description || undefined,
              focusKeyword: draft.focusKeyword || undefined,
              siteName,
              titleSuffix: ` | ${siteName}`,
              status: draft.active ? "active" : "inactive",
            }}
            onUseTitle={(value) => setDraft((current) => ({ ...current, seoTitle: value }))}
            onUseDescription={(value) => setDraft((current) => ({ ...current, seoDescription: value }))}
          />
          <Field label="Focus keyword" hint="Planning only — not read by Google.">
            <TextInput
              value={draft.focusKeyword}
              onChange={(event) => setDraft({ ...draft, focusKeyword: event.target.value })}
            />
          </Field>
          <CollapsiblePreview title="Search preview">
            <SeoPreview model={preview} />
          </CollapsiblePreview>
        </section>
      </EditorTabPanel>

      <EditorTabPanel id="social" active={tab === "social"}>
        <section className="space-y-3 rounded-xl border border-line bg-admin-surface p-5">
          <Field label="OG title" hint="Used when shared on social platforms.">
            <TextInput value={draft.ogTitle} onChange={(event) => setDraft({ ...draft, ogTitle: event.target.value })} />
          </Field>
          <Field label="OG description">
            <TextArea
              value={draft.ogDescription}
              onChange={(event) => setDraft({ ...draft, ogDescription: event.target.value })}
            />
          </Field>
          <ImageField
            title="Category OG image"
            specId="blogOg"
            value={draft.ogImage}
            folder="theflix/og"
            configured={configured}
            assets={assets}
            onChange={(ogImage) => setDraft({ ...draft, ogImage })}
            onUploaded={(asset) => setAssets((current) => [asset, ...current.filter((item) => item.id !== asset.id)])}
            onNotice={notice}
          />
        </section>
      </EditorTabPanel>

      <EditorTabPanel id="advanced" active={tab === "advanced"}>
        <section className="space-y-3 rounded-xl border border-line bg-admin-surface p-5">
          <Field label="Canonical URL" hint="Usually leave blank to use /category/[slug]/.">
            <TextInput
              value={draft.canonicalUrl}
              onChange={(event) => setDraft({ ...draft, canonicalUrl: event.target.value })}
            />
          </Field>
          <label className="block text-sm">
            <input
              type="checkbox"
              checked={categoryEffectiveRobotsIndex({ ...draft, active: true })}
              onChange={(event) => setDraft({ ...draft, robotsIndex: event.target.checked })}
            />{" "}
            Index
          </label>
          <label className="block text-sm">
            <input
              type="checkbox"
              checked={categoryEffectiveRobotsFollow(draft)}
              onChange={(event) => setDraft({ ...draft, robotsFollow: event.target.checked })}
            />{" "}
            Follow
          </label>
          <label className="block text-sm">
            <input
              type="checkbox"
              checked={categoryEffectiveSitemapInclude({ ...draft, active: true })}
              onChange={(event) => setDraft({ ...draft, sitemapInclude: event.target.checked })}
            />{" "}
            Include in sitemap
          </label>
        </section>
      </EditorTabPanel>

      <StickyEditorBar
        title={draft.name || "Untitled category"}
        dirty={dirty}
        saving={saving}
        saveLabel="Save category"
        onSave={() => void save()}
        secondary={
          <>
            <Link href="/sidhu/blog/" className={sidhuButtonClass("secondary", "min-h-10")}>
              Back to blog
            </Link>
            {draft.active && draft.slug ? (
              <a
                href={`/category/${draft.slug}/`}
                target="_blank"
                rel="noopener noreferrer"
                className={sidhuButtonClass("secondary", "min-h-10")}
              >
                View category
              </a>
            ) : null}
          </>
        }
      />
    </div>
  );
}

"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { saveCategoryAction } from "@/lib/cms/actions";
import {
  categoryEffectiveRobotsFollow,
  categoryEffectiveRobotsIndex,
  categoryEffectiveSitemapInclude,
} from "@/lib/cms/category-seo";
import { sidhuPreviewFromCategory } from "@/lib/cms/sidhu-seo-preview";
import type { BlogCategory, MediaAsset, MediaRef } from "@/lib/cms/types";
import { Banner, Field, TextArea, TextInput } from "@/components/sidhu/fields";
import { ImageField } from "@/components/sidhu/ImageField";
import { SeoPreview } from "@/components/sidhu/SeoPreview";

export function CategoryEditor({
  category: initial,
  assets: initialAssets,
  configured,
  siteName,
  siteTagline,
  defaultOgImage,
}: {
  category: BlogCategory;
  assets: MediaAsset[];
  configured: boolean;
  siteName: string;
  siteTagline?: string;
  defaultOgImage?: MediaRef | null;
}) {
  const [draft, setDraft] = useState(initial);
  const [assets, setAssets] = useState(initialAssets);
  const [message, setMessage] = useState<{ tone: "ok" | "error" | "info"; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const savingLock = useRef(false);

  const preview = sidhuPreviewFromCategory(draft, {
    siteName,
    siteTagline,
    defaultOgImage,
  });

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
        return;
      }
      setDraft(result.category);
      notice("Category saved.");
    } finally {
      savingLock.current = false;
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      {message ? <Banner tone={message.tone}>{message.text}</Banner> : null}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-4">
          <section className="space-y-3 rounded-xl border border-line bg-white p-5">
            <h3 className="font-semibold">Content</h3>
            <Field label="Name">
              <TextInput value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
            </Field>
            <Field label="Slug" hint="Public URL path. Changing this can break existing links — leave it unless you plan redirects.">
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
        </div>
        <aside className="space-y-4">
          <section className="space-y-3 rounded-xl border border-line bg-white p-5">
            <h3 className="font-semibold">SEO</h3>
            <Field label="SEO title" hint="Shown in search results. Leave blank to use the category name.">
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
            <Field label="Focus keyword" hint="For your planning only. Google does not read this field directly.">
              <TextInput
                value={draft.focusKeyword}
                onChange={(event) => setDraft({ ...draft, focusKeyword: event.target.value })}
              />
            </Field>
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
              <span className="mt-1 block text-xs text-muted">Uncheck to ask search engines not to index this archive.</span>
            </label>
            <label className="block text-sm">
              <input
                type="checkbox"
                checked={categoryEffectiveRobotsFollow(draft)}
                onChange={(event) => setDraft({ ...draft, robotsFollow: event.target.checked })}
              />{" "}
              Follow
              <span className="mt-1 block text-xs text-muted">Uncheck to ask search engines not to follow links here.</span>
            </label>
            <Field label="OG title" hint="Used when this page is shared on social platforms.">
              <TextInput value={draft.ogTitle} onChange={(event) => setDraft({ ...draft, ogTitle: event.target.value })} />
            </Field>
            <Field label="OG description">
              <TextArea
                value={draft.ogDescription}
                onChange={(event) => setDraft({ ...draft, ogDescription: event.target.value })}
              />
            </Field>
            <label className="block text-sm">
              <input
                type="checkbox"
                checked={categoryEffectiveSitemapInclude({ ...draft, active: true })}
                onChange={(event) => setDraft({ ...draft, sitemapInclude: event.target.checked })}
              />{" "}
              Include in sitemap
              <span className="mt-1 block text-xs text-muted">
                Disable only when you intentionally do not want this URL in the sitemap.
              </span>
            </label>
          </section>
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
        </aside>
      </div>
      <section className="rounded-xl border border-line bg-white p-5">
        <h3 className="font-semibold">SEO preview</h3>
        <p className="mt-1 text-sm text-muted">Editor aid only. Saving still uses the SEO fields on the right.</p>
        <div className="mt-4">
          <SeoPreview model={preview} />
        </div>
      </section>
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          disabled={saving}
          className="rounded-md bg-brand px-5 py-2.5 text-sm font-semibold text-white"
          onClick={() => void save()}
        >
          {saving ? "Saving…" : "Save category"}
        </button>
        <Link href="/sidhu/blog/" className="rounded-md border border-line px-5 py-2.5 text-sm font-semibold text-ink">
          Back to blog
        </Link>
        {draft.active && draft.slug ? (
          <a
            href={`/category/${draft.slug}/`}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-md border border-line px-5 py-2.5 text-sm font-semibold text-ink"
          >
            View category
          </a>
        ) : null}
      </div>
    </div>
  );
}

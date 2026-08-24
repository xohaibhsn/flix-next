"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { savePostAction } from "@/lib/cms/actions";
import { insertEditorImage } from "@/lib/cms/blog";
import { slugify } from "@/lib/cms/slug";
import type { BlogCategory, BlogPost, MediaAsset } from "@/lib/cms/types";
import { Banner, Field, TextArea, TextInput } from "@/components/sidhu/fields";
import { ClientRichTextEditor } from "@/components/sidhu/ClientRichTextEditor";
import { ImageField, MediaSpecHint } from "@/components/sidhu/ImageField";
import { MediaPickerModal } from "@/components/sidhu/MediaPickerModal";

export function BlogEditor({
  post,
  categories,
  assets: initialAssets,
  configured,
}: {
  post: BlogPost;
  categories: BlogCategory[];
  assets: MediaAsset[];
  configured: boolean;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState(post);
  const [assets, setAssets] = useState(initialAssets);
  const [message, setMessage] = useState<{ tone: "ok" | "error" | "info"; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [picker, setPicker] = useState(false);

  function notice(text: string, tone: "ok" | "error" | "info" = "info") {
    setMessage({ tone, text });
  }

  async function save() {
    setSaving(true);
    const result = await savePostAction(draft);
    setSaving(false);
    if (!result.ok) {
      setMessage({ tone: "error", text: result.error });
      return;
    }
    setDraft(result.post);
    setMessage({ tone: "ok", text: "Post saved." });
    if (post.id !== result.post.id) router.replace(`/sidhu/blog/${result.post.id}/`);
  }

  return (
    <div className="space-y-4">
      {message ? <Banner tone={message.tone}>{message.text}</Banner> : null}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section className="space-y-4 rounded-xl border border-line bg-white p-5">
          <Field label="Title">
            <TextInput
              value={draft.title}
              onChange={(event) => {
                const title = event.target.value;
                setDraft({
                  ...draft,
                  title,
                  slug: draft.slug && draft.slug !== slugify(draft.title) ? draft.slug : slugify(title),
                });
              }}
            />
          </Field>
          <Field label="Slug">
            <TextInput value={draft.slug} onChange={(event) => setDraft({ ...draft, slug: event.target.value })} />
          </Field>
          <Field label="Excerpt">
            <TextArea value={draft.excerpt} onChange={(event) => setDraft({ ...draft, excerpt: event.target.value })} />
          </Field>
          <ClientRichTextEditor
            value={draft.content}
            onChange={(content) => setDraft({ ...draft, content })}
            onRequestImage={() => setPicker(true)}
          />
          <MediaSpecHint specId="blogContent" />
        </section>
        <aside className="space-y-4">
          <section className="space-y-4 rounded-xl border border-line bg-white p-5">
            <Field label="Status">
              <select
                className="w-full rounded-md border border-line px-3 py-2 text-sm"
                value={draft.status}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    status: event.target.value === "published" ? "published" : "draft",
                    publishedAt:
                      event.target.value === "published" ? draft.publishedAt || new Date().toISOString() : draft.publishedAt,
                  })
                }
              >
                <option value="draft">Draft</option>
                <option value="published">Published</option>
              </select>
            </Field>
            <Field label="Category">
              <select
                className="w-full rounded-md border border-line px-3 py-2 text-sm"
                value={draft.categoryId || ""}
                onChange={(event) => setDraft({ ...draft, categoryId: event.target.value || null })}
              >
                <option value="">None</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </Field>
            <label className="block text-sm">
              <input type="checkbox" checked={draft.featured} onChange={(event) => setDraft({ ...draft, featured: event.target.checked })} /> Featured post
            </label>
            <Field label="Publish date">
              <TextInput
                type="datetime-local"
                value={draft.publishedAt ? draft.publishedAt.slice(0, 16) : ""}
                onChange={(event) =>
                  setDraft({ ...draft, publishedAt: event.target.value ? new Date(event.target.value).toISOString() : null })
                }
              />
            </Field>
          </section>
          <ImageField
            title="Featured image"
            specId="blogFeatured"
            value={draft.featuredImage}
            folder="theflix/site"
            configured={configured}
            assets={assets}
            onChange={(featuredImage) => setDraft({ ...draft, featuredImage })}
            onUploaded={(asset) => setAssets((current) => [asset, ...current.filter((item) => item.id !== asset.id)])}
            onNotice={notice}
          />
          <section className="space-y-3 rounded-xl border border-line bg-white p-5">
            <h3 className="font-semibold">SEO</h3>
            <Field label="SEO title">
              <TextInput value={draft.seoTitle} onChange={(event) => setDraft({ ...draft, seoTitle: event.target.value })} />
              <p className="mt-1 text-xs text-muted">{draft.seoTitle.length}/70</p>
            </Field>
            <Field label="Meta description">
              <TextArea value={draft.seoDescription} onChange={(event) => setDraft({ ...draft, seoDescription: event.target.value })} />
              <p className="mt-1 text-xs text-muted">{draft.seoDescription.length}/160</p>
            </Field>
            <Field label="Focus keyword">
              <TextInput value={draft.focusKeyword} onChange={(event) => setDraft({ ...draft, focusKeyword: event.target.value })} />
            </Field>
            <Field label="Canonical URL">
              <TextInput value={draft.canonicalUrl} onChange={(event) => setDraft({ ...draft, canonicalUrl: event.target.value })} />
            </Field>
            <label className="block text-sm">
              <input type="checkbox" checked={draft.robotsIndex} onChange={(event) => setDraft({ ...draft, robotsIndex: event.target.checked })} /> Index
            </label>
            <label className="block text-sm">
              <input type="checkbox" checked={draft.robotsFollow} onChange={(event) => setDraft({ ...draft, robotsFollow: event.target.checked })} /> Follow
            </label>
            <Field label="OG title">
              <TextInput value={draft.ogTitle} onChange={(event) => setDraft({ ...draft, ogTitle: event.target.value })} />
            </Field>
            <Field label="OG description">
              <TextArea value={draft.ogDescription} onChange={(event) => setDraft({ ...draft, ogDescription: event.target.value })} />
            </Field>
            <label className="block text-sm">
              <input type="checkbox" checked={draft.sitemapInclude} onChange={(event) => setDraft({ ...draft, sitemapInclude: event.target.checked })} /> Include in sitemap
            </label>
          </section>
          <ImageField
            title="Blog OG image"
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
      <button type="button" disabled={saving} className="rounded-md bg-brand px-5 py-2.5 text-sm font-semibold text-white" onClick={() => void save()}>
        {saving ? "Saving…" : "Save post"}
      </button>
      {picker ? (
        <MediaPickerModal
          title="Insert in-article image"
          assets={assets}
          onClose={() => setPicker(false)}
          onSelect={(asset) => {
            setDraft({
              ...draft,
              content: insertEditorImage(draft.content, asset.secureUrl, asset.alt || ""),
            });
            setPicker(false);
            notice("Image inserted into the article. Save the post to keep it.", "info");
          }}
        />
      ) : null}
    </div>
  );
}

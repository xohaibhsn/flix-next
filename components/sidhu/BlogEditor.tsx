"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { draftSeoTitleMetaAction } from "@/lib/cms/ai-seo-actions";
import { savePostAction } from "@/lib/cms/actions";
import { insertEditorImage } from "@/lib/cms/blog";
import { blogPostPath } from "@/lib/cms/blog-paths";
import { isEditorDirty } from "@/lib/cms/editor-dirty";
import { slugify } from "@/lib/cms/slug";
import type { BlogCategory, BlogPost, MediaAsset, MediaRef } from "@/lib/cms/types";
import { Banner, Field, TextArea, TextInput } from "@/components/sidhu/fields";
import { ClientRichTextEditor } from "@/components/sidhu/ClientRichTextEditor";
import { ImageField, MediaSpecHint } from "@/components/sidhu/ImageField";
import { MediaPickerModal } from "@/components/sidhu/MediaPickerModal";
import { SeoAiDraftPanel } from "@/components/sidhu/SeoAiDraftPanel";
import { SeoPostSaveAdvisoryPanel } from "@/components/sidhu/SeoPostSaveAdvisoryPanel";
import { SeoPrePublishQaPanel } from "@/components/sidhu/SeoPrePublishQaPanel";
import { SeoPreview } from "@/components/sidhu/SeoPreview";
import { CollapsiblePreview } from "@/components/sidhu/ui/CollapsiblePreview";
import { EditorTabPanel, EditorTabs } from "@/components/sidhu/ui/EditorTabs";
import { StickyEditorBar } from "@/components/sidhu/ui/StickyEditorBar";
import { sidhuButtonClass } from "@/components/sidhu/ui/Button";
import type { SeoPostSaveAdvisory } from "@/lib/cms/seo-post-save-guard";
import type { PrePublishQaResult } from "@/lib/cms/seo-prepublish-qa-types";
import { sidhuPreviewFromPost } from "@/lib/cms/sidhu-seo-preview";

type BlogTab = "content" | "seo" | "social" | "advanced";

const TABS: Array<{ id: BlogTab; label: string }> = [
  { id: "content", label: "Content" },
  { id: "seo", label: "SEO" },
  { id: "social", label: "Social / OG" },
  { id: "advanced", label: "Advanced" },
];

export function BlogEditor({
  post,
  categories,
  assets: initialAssets,
  configured,
  openaiConfigured = false,
  geminiConfigured = false,
  siteName,
  siteTagline = "",
  defaultOgImage = null,
}: {
  post: BlogPost;
  categories: BlogCategory[];
  assets: MediaAsset[];
  configured: boolean;
  openaiConfigured?: boolean;
  geminiConfigured?: boolean;
  siteName: string;
  siteTagline?: string;
  defaultOgImage?: MediaRef | null;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState(post);
  const [saved, setSaved] = useState(post);
  const [assets, setAssets] = useState(initialAssets);
  const [message, setMessage] = useState<{ tone: "ok" | "error" | "info"; text: string } | null>(null);
  const [seoAdvisory, setSeoAdvisory] = useState<SeoPostSaveAdvisory | null>(null);
  const [prePublishSnapshot, setPrePublishSnapshot] = useState<{
    draftKey: string;
    result: PrePublishQaResult;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [picker, setPicker] = useState(false);
  const [tab, setTab] = useState<BlogTab>("content");
  const dirty = useMemo(() => isEditorDirty(draft, saved), [draft, saved]);
  const preview = sidhuPreviewFromPost(draft, { siteName, siteTagline, defaultOgImage });
  const draftKey = useMemo(
    () =>
      JSON.stringify({
        id: draft.id,
        title: draft.title,
        slug: draft.slug,
        excerpt: draft.excerpt,
        content: draft.content,
        categoryId: draft.categoryId,
        featuredImageId: draft.featuredImage?.id || "",
        status: draft.status,
        featured: draft.featured,
        seoTitle: draft.seoTitle,
        seoDescription: draft.seoDescription,
        focusKeyword: draft.focusKeyword,
        canonicalUrl: draft.canonicalUrl,
        robotsIndex: draft.robotsIndex,
        robotsFollow: draft.robotsFollow,
        ogTitle: draft.ogTitle,
        ogDescription: draft.ogDescription,
        ogImageId: draft.ogImage?.id || "",
        sitemapInclude: draft.sitemapInclude,
      }),
    [draft],
  );
  const prePublish =
    prePublishSnapshot && prePublishSnapshot.draftKey === draftKey ? prePublishSnapshot.result : null;
  const pendingConfirmFingerprint =
    prePublish?.confirmationRequired ? prePublish.candidateFingerprint : null;

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

  async function save(options?: { confirmFingerprint?: string | null }) {
    setSaving(true);
    const result = await savePostAction({
      post: draft,
      prePublishConfirmationFingerprint: options?.confirmFingerprint || undefined,
    });
    setSaving(false);
    if (!result.ok) {
      setMessage({ tone: "error", text: result.error });
      setSeoAdvisory(null);
      if (result.prePublish) {
        setPrePublishSnapshot({ draftKey, result: result.prePublish });
      } else {
        setPrePublishSnapshot(null);
      }
      return;
    }
    setDraft(result.post);
    setSaved(result.post);
    setMessage({ tone: "ok", text: "Post saved." });
    setSeoAdvisory(result.seoAdvisory ?? null);
    // Successful save — post-save advisory covers follow-up; clear gate card.
    setPrePublishSnapshot(null);
    if (post.id !== result.post.id) router.replace(`/sidhu/blog/${result.post.id}/`);
  }

  return (
    <div className="space-y-4">
      {message ? <Banner tone={message.tone}>{message.text}</Banner> : null}
      <SeoPrePublishQaPanel
        result={prePublish}
        pending={saving}
        onPublishAnyway={
          pendingConfirmFingerprint
            ? () => void save({ confirmFingerprint: pendingConfirmFingerprint })
            : undefined
        }
      />
      <SeoPostSaveAdvisoryPanel advisory={seoAdvisory} compact />

      <EditorTabs items={TABS} value={tab} onChange={setTab} ariaLabel="Blog editor sections" />

      <EditorTabPanel id="content" active={tab === "content"}>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
          <section className="space-y-4 rounded-xl border border-line bg-admin-surface p-5">
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
            <Field label="Slug" hint="Public URL segment. Changing published slugs can break links.">
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
            <section className="space-y-4 rounded-xl border border-line bg-admin-surface p-5">
              <Field label="Status">
                <select
                  className="w-full rounded-md border border-line px-3 py-2 text-sm"
                  value={draft.status}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      status: event.target.value === "published" ? "published" : "draft",
                      publishedAt:
                        event.target.value === "published"
                          ? draft.publishedAt || new Date().toISOString()
                          : draft.publishedAt,
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
                <input
                  type="checkbox"
                  checked={draft.featured}
                  onChange={(event) => setDraft({ ...draft, featured: event.target.checked })}
                />{" "}
                Featured post
              </label>
              <Field label="Publish date">
                <TextInput
                  type="datetime-local"
                  value={draft.publishedAt ? draft.publishedAt.slice(0, 16) : ""}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      publishedAt: event.target.value ? new Date(event.target.value).toISOString() : null,
                    })
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
          </aside>
        </div>
      </EditorTabPanel>

      <EditorTabPanel id="seo" active={tab === "seo"}>
        <section className="space-y-4 rounded-xl border border-line bg-admin-surface p-5">
          <Field label="SEO title" hint="Shown in search results. Leave blank to use the post title.">
            <TextInput value={draft.seoTitle} onChange={(event) => setDraft({ ...draft, seoTitle: event.target.value })} />
            <p className="mt-1 text-xs text-muted">{draft.seoTitle.length}/70</p>
          </Field>
          <Field label="Meta description" hint="Shown under the title in search results.">
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
              entityKind: "post",
              entityLabel: draft.title || "Blog post",
              publicUrl: draft.slug ? blogPostPath(draft.slug) : "/blogs/",
              currentTitle: draft.seoTitle,
              currentDescription: draft.seoDescription,
              contentTitle: draft.title || undefined,
              excerpt: draft.excerpt || undefined,
              focusKeyword: draft.focusKeyword || undefined,
              categoryName: categories.find((category) => category.id === draft.categoryId)?.name,
              siteName,
              titleSuffix: ` | ${siteName}`,
              status: draft.status,
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
        <section className="space-y-4 rounded-xl border border-line bg-admin-surface p-5">
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
          <p className="text-xs text-muted">Save the post after choosing an image.</p>
          <CollapsiblePreview title="Social preview" defaultOpen={false}>
            <SeoPreview model={preview} />
          </CollapsiblePreview>
        </section>
      </EditorTabPanel>

      <EditorTabPanel id="advanced" active={tab === "advanced"}>
        <section className="space-y-4 rounded-xl border border-line bg-admin-surface p-5">
          <Field label="Canonical URL" hint="Usually leave blank to use the normal public URL.">
            <TextInput
              value={draft.canonicalUrl}
              onChange={(event) => setDraft({ ...draft, canonicalUrl: event.target.value })}
            />
          </Field>
          <label className="block text-sm">
            <input
              type="checkbox"
              checked={draft.robotsIndex}
              onChange={(event) => setDraft({ ...draft, robotsIndex: event.target.checked })}
            />{" "}
            Index
            <span className="mt-1 block text-xs text-muted">Uncheck to ask search engines not to index this page.</span>
          </label>
          <label className="block text-sm">
            <input
              type="checkbox"
              checked={draft.robotsFollow}
              onChange={(event) => setDraft({ ...draft, robotsFollow: event.target.checked })}
            />{" "}
            Follow
            <span className="mt-1 block text-xs text-muted">Uncheck to ask search engines not to follow links.</span>
          </label>
          <label className="block text-sm">
            <input
              type="checkbox"
              checked={draft.sitemapInclude}
              onChange={(event) => setDraft({ ...draft, sitemapInclude: event.target.checked })}
            />{" "}
            Include in sitemap
          </label>
        </section>
      </EditorTabPanel>

      <StickyEditorBar
        title={draft.title || "Untitled post"}
        dirty={dirty}
        saving={saving}
        saveLabel="Save post"
        onSave={() => void save({})}
        secondary={
          draft.status === "published" && draft.slug ? (
            <a
              href={blogPostPath(draft.slug)}
              target="_blank"
              rel="noopener noreferrer"
              className={sidhuButtonClass("secondary", "min-h-10")}
            >
              View post
            </a>
          ) : null
        }
      />

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

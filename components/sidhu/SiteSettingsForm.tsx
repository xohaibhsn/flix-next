"use client";

import { useCallback, useState } from "react";
import { saveSettingsAction } from "@/lib/cms/actions";
import type { MediaAsset, MediaRef, SiteSettings } from "@/lib/cms/types";
import { Banner, Field, TextInput } from "@/components/sidhu/fields";

type LibraryAsset = MediaAsset & { inUse?: boolean };

function toRef(asset: Pick<MediaAsset, "id" | "publicId" | "secureUrl">): MediaRef {
  return { id: asset.id, publicId: asset.publicId, secureUrl: asset.secureUrl };
}

export function SiteSettingsForm({
  settings: initial,
  configured,
  cloudName,
  initialAssets,
}: {
  settings: SiteSettings;
  configured: boolean;
  cloudName: string;
  initialAssets: LibraryAsset[];
}) {
  const [settings, setSettings] = useState(initial);
  const [assets, setAssets] = useState<LibraryAsset[]>(initialAssets);
  const [picker, setPicker] = useState<"logo" | "favicon" | "og" | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error" | "info"; text: string } | null>(null);

  const loadAssets = useCallback(async () => {
    const response = await fetch("/api/sidhu/media", { cache: "no-store" });
    const json = (await response.json()) as { ok: boolean; assets?: LibraryAsset[] };
    if (json.ok) setAssets(json.assets ?? []);
  }, []);

  async function uploadAndAssign(slot: "logo" | "favicon" | "og", file: File) {
    const previous = settings.branding;
    setMessage(null);
    const body = new FormData();
    body.append("file", file);
    body.append("folder", slot === "og" ? "theflix/og" : "theflix/branding");
    const response = await fetch("/api/sidhu/media", { method: "POST", body });
    const json = (await response.json()) as { ok: boolean; asset?: MediaAsset; error?: string };
    if (!response.ok || !json.ok || !json.asset) {
      setSettings({ ...settings, branding: previous });
      setMessage({ tone: "error", text: json.error || "Upload failed. Existing branding was kept." });
      return;
    }
    const ref = toRef(json.asset);
    setSettings((current) => ({
      ...current,
      branding: {
        ...current.branding,
        logo: slot === "logo" ? ref : current.branding.logo,
        favicon: slot === "favicon" ? ref : current.branding.favicon,
        defaultOgImage: slot === "og" ? ref : current.branding.defaultOgImage,
      },
    }));
    setMessage({ tone: "info", text: "Uploaded. Click Save changes to apply it on the website." });
    await loadAssets();
  }

  async function save() {
    setSaving(true);
    const result = await saveSettingsAction(settings);
    setSaving(false);
    if (result.ok) {
      setSettings(result.settings);
      setMessage({ tone: "ok", text: "Site settings saved. Refresh the public site to see branding." });
    } else {
      setMessage({ tone: "error", text: result.error });
    }
  }

  return (
    <div className="space-y-4">
      {!configured ? (
        <Banner tone="info">
          Cloudinary cloud name in use: {cloudName}. Add CLOUDINARY_API_KEY and
          CLOUDINARY_API_SECRET in .env.local before uploads will work. Choosing an existing library
          image still works locally.
        </Banner>
      ) : (
        <Banner tone="info">Cloudinary cloud: {cloudName}</Banner>
      )}
      {message ? <Banner tone={message.tone}>{message.text}</Banner> : null}

      <section className="rounded-xl border border-line bg-white p-5">
        <h2 className="font-semibold">Site identity</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Site name">
            <TextInput
              value={settings.siteName}
              onChange={(event) => setSettings({ ...settings, siteName: event.target.value })}
            />
          </Field>
          <Field label="Tagline">
            <TextInput
              value={settings.tagline}
              onChange={(event) => setSettings({ ...settings, tagline: event.target.value })}
            />
          </Field>
        </div>
      </section>

      <AssetCard
        title="Website logo"
        hint="Used in the header and footer. If empty, the wordmark fallback is shown."
        value={settings.branding.logo}
        alt={settings.branding.logoAlt}
        onAlt={(logoAlt) => setSettings({ ...settings, branding: { ...settings.branding, logoAlt } })}
        configured={configured}
        onUpload={(file) => void uploadAndAssign("logo", file)}
        onChoose={() => setPicker("logo")}
        onRemove={() => setSettings({ ...settings, branding: { ...settings.branding, logo: null } })}
      />
      <AssetCard
        title="Favicon"
        hint="Recommended: 32×32 or 48×48 PNG/WEBP. After save, hard-refresh or open a new tab if the old icon is cached."
        value={settings.branding.favicon}
        configured={configured}
        onUpload={(file) => void uploadAndAssign("favicon", file)}
        onChoose={() => setPicker("favicon")}
        onRemove={() => setSettings({ ...settings, branding: { ...settings.branding, favicon: null } })}
      />
      <AssetCard
        title="Default Open Graph image"
        hint="Recommended 1200 × 630. Used as the site-wide social sharing image until page SEO overrides exist."
        value={settings.branding.defaultOgImage}
        configured={configured}
        onUpload={(file) => void uploadAndAssign("og", file)}
        onChoose={() => setPicker("og")}
        onRemove={() =>
          setSettings({ ...settings, branding: { ...settings.branding, defaultOgImage: null } })
        }
      />

      <button
        type="button"
        className="rounded-md bg-brand px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
        onClick={() => void save()}
        disabled={saving}
      >
        {saving ? "Saving…" : "Save changes"}
      </button>

      {picker ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[80vh] w-full max-w-3xl overflow-auto rounded-xl bg-white p-6">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Choose from media library</h3>
              <button type="button" className="text-sm text-muted" onClick={() => setPicker(null)}>
                Close
              </button>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              {assets.map((asset) => (
                <button
                  key={asset.id}
                  type="button"
                  className="overflow-hidden rounded-lg border border-line text-left hover:border-brand"
                  onClick={() => {
                    const ref = toRef(asset);
                    setSettings((current) => ({
                      ...current,
                      branding: {
                        ...current.branding,
                        logo: picker === "logo" ? ref : current.branding.logo,
                        favicon: picker === "favicon" ? ref : current.branding.favicon,
                        defaultOgImage: picker === "og" ? ref : current.branding.defaultOgImage,
                      },
                    }));
                    setPicker(null);
                    setMessage({ tone: "info", text: "Selected. Click Save changes to apply." });
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={asset.secureUrl} alt="" className="h-24 w-full object-cover" />
                  <span className="block truncate px-2 py-1 text-xs">{asset.originalFilename}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function AssetCard({
  title,
  hint,
  value,
  alt,
  onAlt,
  configured,
  onUpload,
  onChoose,
  onRemove,
}: {
  title: string;
  hint: string;
  value: MediaRef | null;
  alt?: string;
  onAlt?: (value: string) => void;
  configured: boolean;
  onUpload: (file: File) => void;
  onChoose: () => void;
  onRemove: () => void;
}) {
  return (
    <section className="rounded-xl border border-line bg-white p-5">
      <h2 className="font-semibold">{title}</h2>
      <p className="mt-1 text-xs text-muted">{hint}</p>
      <div className="mt-4 flex flex-wrap items-start gap-4">
        <div className="flex h-24 w-40 items-center justify-center overflow-hidden rounded-md border border-line bg-paper">
          {value ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={value.secureUrl} alt="" className="max-h-full max-w-full object-contain" />
          ) : (
            <span className="text-xs text-muted">No image</span>
          )}
        </div>
        <div className="space-y-2">
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            disabled={!configured}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) onUpload(file);
              event.target.value = "";
            }}
          />
          <div className="flex flex-wrap gap-2">
            <button type="button" className="rounded border border-line px-3 py-1.5 text-xs" onClick={onChoose}>
              Choose from library
            </button>
            <button type="button" className="rounded border border-line px-3 py-1.5 text-xs" onClick={onRemove}>
              Remove from website
            </button>
          </div>
          {onAlt ? (
            <Field label="Alt text">
              <TextInput value={alt ?? ""} onChange={(event) => onAlt(event.target.value)} />
            </Field>
          ) : null}
        </div>
      </div>
    </section>
  );
}

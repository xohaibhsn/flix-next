"use client";

import { useCallback, useState } from "react";
import { saveSettingsAction } from "@/lib/cms/actions";
import { createId } from "@/lib/cms/ids";
import { whatsappUrl } from "@/lib/cms/contact";
import type { MediaAsset, MediaRef, NavLink, SiteSettings } from "@/lib/cms/types";
import { Banner, Field, TextArea, TextInput } from "@/components/sidhu/fields";

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
      setMessage({
        tone: "ok",
        text: "Site settings saved. Refresh the public site to see the tab title, description, and footer.",
      });
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
        <p className="mt-1 text-xs text-muted">
          These global fields update the browser tab title, default site description, footer, and
          logo alt text. They do not change the Home Hero heading — edit that under Pages → Home →
          Hero.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Site name" hint="Used in the tab title, Open Graph site name, footer copyright, and logo alt.">
            <TextInput
              value={settings.siteName}
              onChange={(event) => setSettings({ ...settings, siteName: event.target.value })}
            />
          </Field>
          <Field
            label="Tagline"
            hint="Used as the default site description, Open Graph description, and footer intro. Not the Home Hero heading."
          >
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

      <ContactAndChromeSettings settings={settings} setSettings={setSettings} assets={assets} />

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

function ContactAndChromeSettings({
  settings,
  setSettings,
  assets,
}: {
  settings: SiteSettings;
  setSettings: (settings: SiteSettings) => void;
  assets: LibraryAsset[];
}) {
  return (
    <>
      <section className="rounded-xl border border-line bg-white p-5">
        <h2 className="font-semibold">Contact & communication</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Email">
            <TextInput value={settings.email} onChange={(event) => setSettings({ ...settings, email: event.target.value })} />
          </Field>
          <Field label="Phone">
            <TextInput value={settings.phone} onChange={(event) => setSettings({ ...settings, phone: event.target.value })} />
          </Field>
          <Field label="WhatsApp number" hint="Digits only, international format. Used to generate wa.me links.">
            <TextInput value={settings.whatsapp} onChange={(event) => setSettings({ ...settings, whatsapp: event.target.value })} />
          </Field>
          <Field label="WhatsApp display">
            <TextInput value={settings.whatsappDisplay} onChange={(event) => setSettings({ ...settings, whatsappDisplay: event.target.value })} />
          </Field>
          <Field label="Default WhatsApp message">
            <TextInput value={settings.whatsappMessage} onChange={(event) => setSettings({ ...settings, whatsappMessage: event.target.value })} />
          </Field>
          <p className="sm:col-span-2 text-xs text-muted">
            Generated chat URL: {whatsappUrl(settings.whatsapp, settings.whatsappMessage) || "Enter a WhatsApp number to generate wa.me"}
          </p>
          <Field label="Telegram URL">
            <TextInput value={settings.telegramUrl} onChange={(event) => setSettings({ ...settings, telegramUrl: event.target.value })} />
          </Field>
          <Field label="Support hours">
            <TextInput value={settings.hours} onChange={(event) => setSettings({ ...settings, hours: event.target.value })} />
          </Field>
          <Field label="Location / address text">
            <TextInput value={settings.location} onChange={(event) => setSettings({ ...settings, location: event.target.value })} />
          </Field>
        </div>
      </section>
      <section className="rounded-xl border border-line bg-white p-5">
        <h2 className="font-semibold">Social links</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {(["facebook", "instagram", "twitter", "youtube", "telegram"] as const).map((key) => (
            <Field key={key} label={key}>
              <TextInput
                value={settings.socials[key]}
                onChange={(event) =>
                  setSettings({ ...settings, socials: { ...settings.socials, [key]: event.target.value } })
                }
              />
            </Field>
          ))}
        </div>
      </section>
      <section className="rounded-xl border border-line bg-white p-5">
        <h2 className="font-semibold">Header</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="CTA label">
            <TextInput value={settings.headerCtaLabel} onChange={(event) => setSettings({ ...settings, headerCtaLabel: event.target.value })} />
          </Field>
          <Field label="CTA URL">
            <TextInput value={settings.headerCtaHref} onChange={(event) => setSettings({ ...settings, headerCtaHref: event.target.value })} />
          </Field>
        </div>
        <NavEditor items={settings.headerNav} onChange={(headerNav) => setSettings({ ...settings, headerNav })} />
      </section>
      <section className="rounded-xl border border-line bg-white p-5">
        <h2 className="font-semibold">Footer</h2>
        <div className="mt-4 space-y-4">
          <Field label="Intro / about text">
            <TextArea value={settings.footerIntro} onChange={(event) => setSettings({ ...settings, footerIntro: event.target.value })} />
          </Field>
          <Field label="Copyright line">
            <TextInput value={settings.footerCopyright} onChange={(event) => setSettings({ ...settings, footerCopyright: event.target.value })} />
          </Field>
        </div>
        <h3 className="mt-6 text-sm font-semibold">Quick links</h3>
        <NavEditor items={settings.footerQuickLinks} onChange={(footerQuickLinks) => setSettings({ ...settings, footerQuickLinks })} />
        <h3 className="mt-6 text-sm font-semibold">Support links</h3>
        <NavEditor items={settings.footerSupportLinks} onChange={(footerSupportLinks) => setSettings({ ...settings, footerSupportLinks })} />
        <h3 className="mt-6 text-sm font-semibold">Payment icons</h3>
        <p className="mt-1 text-xs text-muted">Optional images shown in the footer bar. Choose from the media library after upload.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {settings.footerPaymentImages.map((image) => (
            <button
              key={image.id}
              type="button"
              className="overflow-hidden rounded border border-line"
              onClick={() =>
                setSettings({
                  ...settings,
                  footerPaymentImages: settings.footerPaymentImages.filter((item) => item.id !== image.id),
                })
              }
              title="Remove"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={image.secureUrl} alt="" className="h-10 w-16 object-contain" />
            </button>
          ))}
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-4">
          {assets.slice(0, 8).map((asset) => (
            <button
              key={asset.id}
              type="button"
              className="overflow-hidden rounded border border-line"
              onClick={() => {
                const ref = toRef(asset);
                if (settings.footerPaymentImages.some((item) => item.id === ref.id)) return;
                setSettings({ ...settings, footerPaymentImages: [...settings.footerPaymentImages, ref] });
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={asset.secureUrl} alt="" className="h-12 w-full object-cover" />
            </button>
          ))}
        </div>
      </section>
    </>
  );
}

function NavEditor({ items, onChange }: { items: NavLink[]; onChange: (items: NavLink[]) => void }) {
  return (
    <div className="mt-4 space-y-3">
      {items.map((item, index) => (
        <div key={item.id} className="grid gap-2 rounded-md border border-line p-3 sm:grid-cols-[1fr_1fr_auto]">
          <TextInput
            value={item.label}
            onChange={(event) => onChange(items.map((row) => (row.id === item.id ? { ...row, label: event.target.value } : row)))}
          />
          <TextInput
            value={item.href}
            onChange={(event) => onChange(items.map((row) => (row.id === item.id ? { ...row, href: event.target.value } : row)))}
          />
          <div className="flex items-center gap-2">
            <label className="text-xs">
              <input
                type="checkbox"
                checked={item.visible}
                onChange={(event) => onChange(items.map((row) => (row.id === item.id ? { ...row, visible: event.target.checked } : row)))}
              />{" "}
              Show
            </label>
            <button type="button" className="text-xs" onClick={() => {
              if (index === 0) return;
              const next = [...items];
              [next[index - 1], next[index]] = [next[index], next[index - 1]];
              onChange(next);
            }}>Up</button>
            <button type="button" className="text-xs" onClick={() => {
              if (index === items.length - 1) return;
              const next = [...items];
              [next[index + 1], next[index]] = [next[index], next[index + 1]];
              onChange(next);
            }}>Down</button>
            <button type="button" className="text-xs" onClick={() => onChange(items.filter((_, i) => i !== index))}>
              Remove
            </button>
          </div>
        </div>
      ))}
      <button
        type="button"
        className="text-xs font-semibold text-brand"
        onClick={() => onChange([...items, { id: createId("nav"), label: "New link", href: "/", visible: true }])}
      >
        + Add link
      </button>
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

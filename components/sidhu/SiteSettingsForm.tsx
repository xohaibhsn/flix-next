"use client";

import { useState } from "react";
import { saveSettingsAction } from "@/lib/cms/actions";
import { createId } from "@/lib/cms/ids";
import { whatsappUrl } from "@/lib/cms/contact";
import { uploadSidhuImage } from "@/lib/cms/media-client";
import type { MediaAsset, NavLink, SiteSettings, SocialPlatform } from "@/lib/cms/types";
import { Banner, Field, TextArea, TextInput } from "@/components/sidhu/fields";
import { ImageField, MediaSpecHint } from "@/components/sidhu/ImageField";
import { MediaPickerModal, toMediaRef } from "@/components/sidhu/MediaPickerModal";
import { MEDIA_UPLOAD } from "@/lib/media-specs";

type LibraryAsset = MediaAsset & { inUse?: boolean };

function ShowToggle({
  checked,
  onChange,
  label = "Show on website",
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label?: string;
}) {
  return (
    <label className="inline-flex items-center gap-2 text-sm">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      {label}
    </label>
  );
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
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error" | "info"; text: string } | null>(null);

  function notice(text: string, tone: "ok" | "error" | "info" = "info") {
    setMessage({ tone, text });
  }

  function setSocial(key: keyof SiteSettings["socials"], patch: Partial<SocialPlatform>) {
    setSettings({
      ...settings,
      socials: { ...settings.socials, [key]: { ...settings.socials[key], ...patch } },
    });
  }

  async function save() {
    setSaving(true);
    const result = await saveSettingsAction(settings);
    setSaving(false);
    if (result.ok) {
      setSettings(result.settings);
      notice("Site settings saved. Refresh the public site to see header, footer, and contact changes.", "ok");
    } else {
      notice(result.error, "error");
    }
  }

  return (
    <div className="space-y-4">
      {!configured ? (
        <Banner tone="info">
          Cloudinary cloud name in use: {cloudName}. Add the Cloudinary API key and secret in the server
          environment before uploads will work. Choosing an existing library image still works.
        </Banner>
      ) : (
        <Banner tone="info">Cloudinary cloud: {cloudName}</Banner>
      )}
      {message ? <Banner tone={message.tone}>{message.text}</Banner> : null}

      <section className="rounded-xl border border-line bg-white p-5">
        <h2 className="font-semibold">Site identity</h2>
        <p className="mt-1 text-xs text-muted">
          These global fields update the browser tab title, default site description, footer, and logo alt
          text. They do not change the Home Hero heading — edit that under Pages → Home → Hero.
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

      <ImageField
        title="Website logo"
        specId="logo"
        value={settings.branding.logo}
        alt={settings.branding.logoAlt}
        onAlt={(logoAlt) => setSettings({ ...settings, branding: { ...settings.branding, logoAlt } })}
        folder="theflix/branding"
        configured={configured}
        assets={assets}
        onChange={(logo) => setSettings({ ...settings, branding: { ...settings.branding, logo } })}
        onUploaded={(asset) => setAssets((current) => [asset, ...current.filter((item) => item.id !== asset.id)])}
        onNotice={notice}
      />
      <ImageField
        title="Favicon"
        specId="favicon"
        value={settings.branding.favicon}
        folder="theflix/branding"
        configured={configured}
        assets={assets}
        onChange={(favicon) => setSettings({ ...settings, branding: { ...settings.branding, favicon } })}
        onUploaded={(asset) => setAssets((current) => [asset, ...current.filter((item) => item.id !== asset.id)])}
        onNotice={notice}
      />
      <ImageField
        title="Default Open Graph image"
        specId="defaultOg"
        value={settings.branding.defaultOgImage}
        folder="theflix/og"
        configured={configured}
        assets={assets}
        onChange={(defaultOgImage) =>
          setSettings({ ...settings, branding: { ...settings.branding, defaultOgImage } })
        }
        onUploaded={(asset) => setAssets((current) => [asset, ...current.filter((item) => item.id !== asset.id)])}
        onNotice={notice}
      />

      <ContactAndChromeSettings
        settings={settings}
        setSettings={setSettings}
        assets={assets}
        configured={configured}
        onAssets={setAssets}
        onNotice={notice}
        setSocial={setSocial}
      />

      <button
        type="button"
        className="rounded-md bg-brand px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
        onClick={() => void save()}
        disabled={saving}
      >
        {saving ? "Saving…" : "Save changes"}
      </button>
    </div>
  );
}

function ContactAndChromeSettings({
  settings,
  setSettings,
  assets,
  configured,
  onAssets,
  onNotice,
  setSocial,
}: {
  settings: SiteSettings;
  setSettings: (settings: SiteSettings) => void;
  assets: LibraryAsset[];
  configured: boolean;
  onAssets: (assets: LibraryAsset[]) => void;
  onNotice: (text: string, tone?: "ok" | "error" | "info") => void;
  setSocial: (key: keyof SiteSettings["socials"], patch: Partial<SocialPlatform>) => void;
}) {
  const generatedWa = whatsappUrl(settings.whatsapp, settings.whatsappMessage);
  const optionalSocials = [
    { key: "facebook" as const, label: "Facebook" },
    { key: "instagram" as const, label: "Instagram" },
    { key: "twitter" as const, label: "X / Twitter" },
    { key: "youtube" as const, label: "YouTube" },
  ];

  return (
    <>
      <section className="rounded-xl border border-line bg-white p-5">
        <h2 className="font-semibold">Contact & communication</h2>
        <p className="mt-1 text-xs text-muted">
          These values feed the Contact page, footer, messaging CTAs, and the floating WhatsApp button.
          Empty or hidden channels are omitted from the public site.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Email">
            <TextInput value={settings.email} onChange={(event) => setSettings({ ...settings, email: event.target.value })} />
          </Field>
          <Field label="Phone">
            <TextInput value={settings.phone} onChange={(event) => setSettings({ ...settings, phone: event.target.value })} />
          </Field>
          <Field label="WhatsApp number" hint="Digits only, international format.">
            <TextInput value={settings.whatsapp} onChange={(event) => setSettings({ ...settings, whatsapp: event.target.value })} />
          </Field>
          <Field label="WhatsApp display">
            <TextInput
              value={settings.whatsappDisplay}
              onChange={(event) => setSettings({ ...settings, whatsappDisplay: event.target.value })}
            />
          </Field>
          <Field label="Default WhatsApp message">
            <TextInput
              value={settings.whatsappMessage}
              onChange={(event) => setSettings({ ...settings, whatsappMessage: event.target.value })}
            />
          </Field>
          <div className="sm:col-span-2 space-y-2">
            <ShowToggle
              checked={settings.whatsappEnabled}
              onChange={(whatsappEnabled) => setSettings({ ...settings, whatsappEnabled })}
              label="Show WhatsApp on website"
            />
            <p className="text-xs text-muted">
              Generated chat URL: {generatedWa || "Enter a WhatsApp number to generate wa.me"}
            </p>
          </div>
          <Field label="Telegram URL">
            <TextInput
              value={settings.telegramUrl}
              onChange={(event) =>
                setSettings({
                  ...settings,
                  telegramUrl: event.target.value,
                  socials: {
                    ...settings.socials,
                    telegram: { ...settings.socials.telegram, url: event.target.value },
                  },
                })
              }
            />
          </Field>
          <div className="flex items-end">
            <ShowToggle
              checked={settings.telegramEnabled}
              onChange={(telegramEnabled) =>
                setSettings({
                  ...settings,
                  telegramEnabled,
                  socials: { ...settings.socials, telegram: { ...settings.socials.telegram, visible: telegramEnabled } },
                })
              }
              label="Show Telegram on website"
            />
          </div>
          <Field label="Support hours">
            <TextInput value={settings.hours} onChange={(event) => setSettings({ ...settings, hours: event.target.value })} />
          </Field>
          <Field label="Location / address text">
            <TextInput value={settings.location} onChange={(event) => setSettings({ ...settings, location: event.target.value })} />
          </Field>
        </div>
      </section>
      <section className="rounded-xl border border-line bg-white p-5">
        <h2 className="font-semibold">Optional social links</h2>
        <p className="mt-1 text-xs text-muted">
          Icons only appear when a URL is set and Show on website is enabled. Empty or hidden fields leave
          no blank icon in the footer.
        </p>
        <div className="mt-4 grid gap-4">
          {optionalSocials.map((item) => (
            <div key={item.key} className="grid gap-2 rounded-md border border-line p-3 sm:grid-cols-[1fr_auto] sm:items-end">
              <Field label={`${item.label} URL`}>
                <TextInput
                  value={settings.socials[item.key].url}
                  onChange={(event) => setSocial(item.key, { url: event.target.value })}
                />
              </Field>
              <div className="pb-2">
                <ShowToggle
                  checked={settings.socials[item.key].visible}
                  onChange={(visible) => setSocial(item.key, { visible })}
                />
              </div>
            </div>
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
        <PaymentImagesEditor
          settings={settings}
          setSettings={setSettings}
          assets={assets}
          configured={configured}
          onAssets={onAssets}
          onNotice={onNotice}
        />
      </section>
    </>
  );
}

function PaymentImagesEditor({
  settings,
  setSettings,
  assets,
  configured,
  onAssets,
  onNotice,
}: {
  settings: SiteSettings;
  setSettings: (settings: SiteSettings) => void;
  assets: LibraryAsset[];
  configured: boolean;
  onAssets: (assets: LibraryAsset[]) => void;
  onNotice: (text: string, tone?: "ok" | "error" | "info") => void;
}) {
  const [picker, setPicker] = useState(false);
  const [uploading, setUploading] = useState(false);

  async function upload(file: File) {
    setUploading(true);
    try {
      const asset = await uploadSidhuImage(file, "theflix/site");
      onAssets([asset, ...assets.filter((item) => item.id !== asset.id)]);
      if (!settings.footerPaymentImages.some((item) => item.id === asset.id)) {
        setSettings({ ...settings, footerPaymentImages: [...settings.footerPaymentImages, toMediaRef(asset)] });
      }
      onNotice("Uploaded to Cloudinary immediately. Click Save to apply it on the website.", "info");
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "Upload failed.", "error");
    } finally {
      setUploading(false);
    }
  }

  return (
    <>
      <h3 className="mt-6 text-sm font-semibold">Payment icons</h3>
      <MediaSpecHint specId="footerPayment" />
      <p className="mt-2 text-xs text-muted">
        Upload New Image sends the file to Cloudinary immediately. Choose from Media Library assigns an
        existing file. Click Save to apply.
      </p>
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
      <div className="mt-3 flex flex-wrap gap-2">
        <label className="inline-flex cursor-pointer items-center rounded-md bg-brand px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">
          {uploading ? "Uploading…" : "Upload New Image"}
          <input
            type="file"
            className="sr-only"
            accept={MEDIA_UPLOAD.accept}
            disabled={!configured || uploading}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void upload(file);
              event.target.value = "";
            }}
          />
        </label>
        <button type="button" className="rounded border border-line px-3 py-1.5 text-xs" onClick={() => setPicker(true)}>
          Choose from Media Library
        </button>
      </div>
      {picker ? (
        <MediaPickerModal
          assets={assets}
          onClose={() => setPicker(false)}
          onSelect={(asset) => {
            const ref = toMediaRef(asset);
            if (!settings.footerPaymentImages.some((item) => item.id === ref.id)) {
              setSettings({ ...settings, footerPaymentImages: [...settings.footerPaymentImages, ref] });
            }
            setPicker(false);
            onNotice("Selected from library — Save to apply.", "info");
          }}
        />
      ) : null}
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
            <button
              type="button"
              className="text-xs"
              onClick={() => {
                if (index === 0) return;
                const next = [...items];
                [next[index - 1], next[index]] = [next[index], next[index - 1]];
                onChange(next);
              }}
            >
              Up
            </button>
            <button
              type="button"
              className="text-xs"
              onClick={() => {
                if (index === items.length - 1) return;
                const next = [...items];
                [next[index + 1], next[index]] = [next[index], next[index + 1]];
                onChange(next);
              }}
            >
              Down
            </button>
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

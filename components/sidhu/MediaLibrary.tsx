"use client";

import { useCallback, useMemo, useState } from "react";
import {
  deleteSidhuImage,
  fetchSidhuMedia,
  updateSidhuImageAlt,
  uploadSidhuImage,
  type LibraryMediaAsset,
} from "@/lib/cms/media-client";
import { MEDIA_ALT_MAX } from "@/lib/cms/media-alt";
import { MEDIA_UPLOAD, formatFileSize } from "@/lib/media-specs";
import { Banner } from "@/components/sidhu/fields";

type LibraryAsset = LibraryMediaAsset;

export function MediaLibrary({
  initialAssets,
  configured: initialConfigured,
}: {
  initialAssets: LibraryAsset[];
  configured: boolean;
}) {
  const [assets, setAssets] = useState<LibraryAsset[]>(initialAssets);
  const [configured, setConfigured] = useState(initialConfigured);
  const [busy, setBusy] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [alt, setAlt] = useState("");
  const [folder, setFolder] = useState("theflix/site");
  const [message, setMessage] = useState<{ tone: "ok" | "error" | "info"; text: string } | null>(null);
  const [altDrafts, setAltDrafts] = useState<Record<string, string>>({});

  const reload = useCallback(async () => {
    const result = await fetchSidhuMedia();
    setConfigured(result.configured);
    setAssets(result.assets);
  }, []);

  const localPreview = useMemo(() => preview, [preview]);

  function chooseFile(next: File | null) {
    if (preview) URL.revokeObjectURL(preview);
    setFile(next);
    setPreview(next ? URL.createObjectURL(next) : "");
  }

  async function upload() {
    if (!file) {
      setMessage({ tone: "error", text: "Choose an image first, then click Upload Image." });
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      await uploadSidhuImage(file, folder, alt);
      chooseFile(null);
      setAlt("");
      setMessage({ tone: "ok", text: "Image uploaded to Cloudinary and saved in the library." });
      await reload();
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "Upload failed." });
    } finally {
      setBusy(false);
    }
  }

  async function saveAlt(asset: LibraryAsset) {
    setBusy(true);
    setMessage(null);
    try {
      const next = await updateSidhuImageAlt(asset.id, altDrafts[asset.id] ?? asset.alt);
      setAssets((current) =>
        current.map((item) =>
          item.id === next.id
            ? { ...item, ...next, inUse: item.inUse, usageCount: item.usageCount, usageReferences: item.usageReferences }
            : item,
        ),
      );
      setAltDrafts((current) => {
        const nextDrafts = { ...current };
        delete nextDrafts[asset.id];
        return nextDrafts;
      });
      setMessage({ tone: "ok", text: "Alt text saved. The Cloudinary file was not changed." });
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "Could not save alt text." });
    } finally {
      setBusy(false);
    }
  }

  async function remove(asset: LibraryAsset) {
    const count = asset.usageCount ?? (asset.inUse ? 1 : 0);
    if (asset.inUse || count > 0) {
      const places = (asset.usageReferences || [])
        .slice(0, 3)
        .map((ref) => ref.entity)
        .filter(Boolean)
        .join("; ");
      setMessage({
        tone: "error",
        text: places
          ? `Used in ${count} place${count === 1 ? "" : "s"} (${places}). Unassign it before deleting.`
          : `Used in ${count} place${count === 1 ? "" : "s"}. Unassign it before deleting.`,
      });
      return;
    }
    if (!confirm(`Delete “${asset.originalFilename}” from Cloudinary and the library?`)) return;
    setBusy(true);
    try {
      await deleteSidhuImage(asset.id);
      setMessage({ tone: "ok", text: "Image deleted from Cloudinary and the library." });
      await reload();
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "Delete failed." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {!configured ? (
        <Banner tone="info">
          Cloudinary is not configured. Uploads and deletes stay disabled until the Cloudinary API key
          and secret are set in server environment variables. Existing alt text can still be edited.
        </Banner>
      ) : null}
      {message ? <Banner tone={message.tone}>{message.text}</Banner> : null}
      <div className="rounded-xl border border-line bg-white p-4">
        <h2 className="text-sm font-semibold">Upload Image</h2>
        <p className="mt-1 text-xs text-muted">
          JPG, JPEG, PNG, or WEBP · max {MEDIA_UPLOAD.maxLabel}. Choose a file to preview it, then click
          Upload Image. Nothing is sent until you click Upload Image.
        </p>
        <div className="mt-3 grid gap-4 lg:grid-cols-[160px_minmax(0,1fr)]">
          <div className="flex h-36 items-center justify-center overflow-hidden rounded-md border border-dashed border-line bg-paper">
            {localPreview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={localPreview} alt="" className="max-h-full max-w-full object-contain" />
            ) : (
              <span className="px-2 text-center text-xs text-muted">Preview appears here</span>
            )}
          </div>
          <div className="space-y-3">
            <input
              type="file"
              accept={MEDIA_UPLOAD.accept}
              disabled={!configured || busy}
              onChange={(event) => chooseFile(event.target.files?.[0] ?? null)}
            />
            <label className="block text-xs font-semibold tracking-wide text-ink/70 uppercase">
              Optional alt / label
              <input
                value={alt}
                onChange={(event) => setAlt(event.target.value)}
                maxLength={MEDIA_ALT_MAX}
                className="mt-1 w-full rounded-md border border-line px-3 py-2 text-sm font-normal"
                placeholder="Describe the image"
              />
            </label>
            <p className="text-xs text-muted">
              Describe the image briefly when it adds meaningful content. Leave blank for decorative images. Do not
              keyword-stuff or repeat the same SEO phrase on every image.
            </p>
            <label className="block text-xs font-semibold tracking-wide text-ink/70 uppercase">
              Cloudinary folder
              <select
                className="mt-1 w-full rounded-md border border-line px-3 py-2 text-sm font-normal"
                value={folder}
                onChange={(event) => setFolder(event.target.value)}
              >
                <option value="theflix/branding">theflix/branding</option>
                <option value="theflix/og">theflix/og</option>
                <option value="theflix/site">theflix/site</option>
              </select>
            </label>
            <button
              type="button"
              className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              disabled={!configured || busy || !file}
              onClick={() => void upload()}
            >
              {busy ? "Uploading…" : "Upload Image"}
            </button>
          </div>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {assets.length === 0 ? (
          <p className="text-sm text-muted">No media yet.</p>
        ) : (
          assets.map((asset) => {
            const usageCount = asset.usageCount ?? (asset.inUse ? 1 : 0);
            const used = Boolean(asset.inUse || usageCount > 0);
            const locations = (asset.usageReferences || [])
              .slice(0, 3)
              .map((ref) => `${ref.entity} (${ref.field})`)
              .join(" · ");
            return (
              <article key={asset.id} className="overflow-hidden rounded-xl border border-line bg-white">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={asset.secureUrl} alt={asset.alt} className="h-40 w-full object-cover" />
                <div className="space-y-2 p-3">
                  <p className="truncate text-sm font-semibold">{asset.originalFilename}</p>
                  <p className="text-xs text-muted">
                    {asset.width ?? "?"}×{asset.height ?? "?"} · {asset.format || "unknown"} ·{" "}
                    {formatFileSize(asset.bytes)} · {asset.folder || "—"} · {asset.createdAt.slice(0, 10)}
                  </p>
                  <p className="text-xs text-muted">
                    {used
                      ? `Used in ${usageCount} place${usageCount === 1 ? "" : "s"}`
                      : "Not in use"}
                  </p>
                  {locations ? <p className="text-xs text-muted">{locations}</p> : null}
                  <p className="text-xs text-muted">
                    Alt: {asset.alt.trim() ? asset.alt : "Not set"}
                  </p>
                  <label className="block text-xs font-semibold tracking-wide text-ink/70 uppercase">
                    Alt text
                    <textarea
                      value={altDrafts[asset.id] ?? asset.alt}
                      onChange={(event) => setAltDrafts((current) => ({ ...current, [asset.id]: event.target.value }))}
                      maxLength={MEDIA_ALT_MAX}
                      rows={2}
                      className="mt-1 w-full rounded-md border border-line px-3 py-2 text-sm font-normal"
                      placeholder="Leave blank for decorative images"
                    />
                  </label>
                  <p className="text-xs text-muted">
                    Describe the image briefly when it adds meaningful content. Leave blank for decorative images.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="rounded border border-line px-2 py-1 text-xs"
                      onClick={() => void saveAlt(asset)}
                      disabled={busy}
                    >
                      Save alt
                    </button>
                    <button
                      type="button"
                      className="rounded border border-line px-2 py-1 text-xs"
                      onClick={async () => {
                        await navigator.clipboard.writeText(asset.secureUrl);
                        setMessage({ tone: "ok", text: "Selected — URL copied. Assign it from an image field or paste the URL." });
                      }}
                    >
                      Select/Use
                    </button>
                    <button
                      type="button"
                      className="rounded border border-line px-2 py-1 text-xs"
                      onClick={async () => {
                        await navigator.clipboard.writeText(asset.secureUrl);
                        setMessage({ tone: "ok", text: "URL copied." });
                      }}
                    >
                      Copy URL
                    </button>
                    <button
                      type="button"
                      className="rounded border border-red-200 px-2 py-1 text-xs text-red-700 disabled:opacity-50"
                      onClick={() => void remove(asset)}
                      disabled={busy || used || !configured}
                      title={used ? "Unassign this image before deleting." : undefined}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </article>
            );
          })
        )}
      </div>
    </div>
  );
}

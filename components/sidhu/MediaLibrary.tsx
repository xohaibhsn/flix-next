"use client";

import { useCallback, useMemo, useState } from "react";
import type { MediaAsset } from "@/lib/cms/types";
import { deleteSidhuImage, fetchSidhuMedia, uploadSidhuImage } from "@/lib/cms/media-client";
import { MEDIA_UPLOAD, formatFileSize } from "@/lib/media-specs";
import { Banner } from "@/components/sidhu/fields";

type LibraryAsset = MediaAsset & { inUse?: boolean };

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

  async function remove(asset: LibraryAsset) {
    if (asset.inUse) {
      setMessage({
        tone: "error",
        text: "This image is used on the site. Unassign it from Site Settings, SEO, or a blog post first.",
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
          and secret are set in server environment variables.
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
                className="mt-1 w-full rounded-md border border-line px-3 py-2 text-sm font-normal"
                placeholder="Describe the image"
              />
            </label>
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
          assets.map((asset) => (
            <article key={asset.id} className="overflow-hidden rounded-xl border border-line bg-white">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={asset.secureUrl} alt={asset.alt || asset.originalFilename} className="h-40 w-full object-cover" />
              <div className="space-y-2 p-3">
                <p className="truncate text-sm font-semibold">{asset.originalFilename}</p>
                <p className="text-xs text-muted">
                  {asset.width ?? "?"}×{asset.height ?? "?"} · {asset.format || "unknown"} ·{" "}
                  {formatFileSize(asset.bytes)} · {asset.folder || "—"} · {asset.createdAt.slice(0, 10)}
                  {asset.inUse ? " · in use" : ""}
                </p>
                <div className="flex flex-wrap gap-2">
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
                    disabled={busy}
                  >
                    Delete
                  </button>
                </div>
              </div>
            </article>
          ))
        )}
      </div>
    </div>
  );
}

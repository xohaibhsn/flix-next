"use client";

import { useCallback, useState } from "react";
import type { MediaAsset } from "@/lib/cms/types";
import { Banner } from "@/components/sidhu/fields";

type LibraryAsset = MediaAsset & { inUse?: boolean };

async function fetchLibrary() {
  const response = await fetch("/api/sidhu/media", { cache: "no-store", credentials: "same-origin" });
  const json = (await response.json()) as {
    ok: boolean;
    configured?: boolean;
    assets?: LibraryAsset[];
    error?: string;
  };
  if (!response.ok || !json.ok) {
    throw new Error(json.error || "Could not load the media library.");
  }
  return { configured: Boolean(json.configured), assets: json.assets ?? [] };
}

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
  const [message, setMessage] = useState<{ tone: "ok" | "error" | "info"; text: string } | null>(null);

  const reload = useCallback(async () => {
    const result = await fetchLibrary();
    setConfigured(result.configured);
    setAssets(result.assets);
  }, []);

  async function upload(file: File, folder: string) {
    setBusy(true);
    setMessage(null);
    const body = new FormData();
    body.append("file", file);
    body.append("folder", folder);
    const response = await fetch("/api/sidhu/media", { method: "POST", body, credentials: "same-origin" });
    const json = (await response.json()) as { ok: boolean; error?: string };
    setBusy(false);
    if (!response.ok || !json.ok) {
      setMessage({ tone: "error", text: json.error || "Upload failed." });
      return;
    }
    setMessage({ tone: "ok", text: "Image uploaded to Cloudinary and saved in the library." });
    await reload();
  }

  async function remove(asset: LibraryAsset) {
    if (asset.inUse) {
      setMessage({
        tone: "error",
        text: "This image is used in Site Settings. Remove it from Logo, Favicon, or OG Image first.",
      });
      return;
    }
    if (!confirm(`Delete “${asset.originalFilename}” from Cloudinary and the local library?`)) return;
    setBusy(true);
    const response = await fetch("/api/sidhu/media", {
      method: "DELETE",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: asset.id }),
    });
    const json = (await response.json()) as { ok: boolean; error?: string };
    setBusy(false);
    if (!response.ok || !json.ok) {
      setMessage({ tone: "error", text: json.error || "Delete failed." });
      return;
    }
    setMessage({ tone: "ok", text: "Image deleted from Cloudinary and the library." });
    await reload();
  }

  return (
    <div className="space-y-4">
      {!configured ? (
        <Banner tone="info">
          Cloudinary is not configured. Uploads and deletes stay disabled until CLOUDINARY_API_KEY
          and CLOUDINARY_API_SECRET are set in environment variables. The API secret must stay
          server-only.
        </Banner>
      ) : null}
      {message ? <Banner tone={message.tone}>{message.text}</Banner> : null}
      <div className="rounded-xl border border-line bg-white p-4">
        <p className="text-sm font-semibold">Upload image</p>
        <p className="mt-1 text-xs text-muted">JPG, PNG, or WEBP · max 5MB · SVG is excluded for now.</p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <select id="folder" className="rounded-md border border-line px-3 py-2 text-sm" defaultValue="theflix/site">
            <option value="theflix/branding">theflix/branding</option>
            <option value="theflix/og">theflix/og</option>
            <option value="theflix/site">theflix/site</option>
          </select>
          <label className="inline-flex cursor-pointer items-center rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
            {busy ? "Uploading…" : "Upload"}
            <input
              type="file"
              className="sr-only"
              accept="image/jpeg,image/png,image/webp"
              disabled={!configured || busy}
              onChange={(event) => {
                const file = event.target.files?.[0];
                const folder = (document.getElementById("folder") as HTMLSelectElement | null)?.value || "theflix/site";
                if (file) void upload(file, folder);
                event.target.value = "";
              }}
            />
          </label>
          {busy ? <span className="text-xs text-muted">Please wait…</span> : null}
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
                  {asset.width ?? "?"}×{asset.height ?? "?"} · {asset.format} · {asset.createdAt.slice(0, 10)}
                  {asset.inUse ? " · used in settings" : ""}
                </p>
                <div className="flex flex-wrap gap-2">
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

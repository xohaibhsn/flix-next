import type { MediaAsset } from "@/lib/cms/types";

export async function uploadSidhuImage(file: File, folder: string, alt = "") {
  const body = new FormData();
  body.append("file", file);
  body.append("folder", folder);
  if (alt) body.append("alt", alt);
  const response = await fetch("/api/sidhu/media", {
    method: "POST",
    body,
    credentials: "same-origin",
  });
  const json = (await response.json()) as { ok: boolean; asset?: MediaAsset; error?: string };
  if (!response.ok || !json.ok || !json.asset) {
    throw new Error(json.error || "Upload failed.");
  }
  return json.asset;
}

export async function deleteSidhuImage(id: string) {
  const response = await fetch("/api/sidhu/media", {
    method: "DELETE",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id }),
  });
  const json = (await response.json()) as { ok: boolean; error?: string };
  if (!response.ok || !json.ok) {
    throw new Error(json.error || "Delete failed.");
  }
}

export async function fetchSidhuMedia() {
  const response = await fetch("/api/sidhu/media", { cache: "no-store", credentials: "same-origin" });
  const json = (await response.json()) as {
    ok: boolean;
    configured?: boolean;
    assets?: Array<MediaAsset & { inUse?: boolean }>;
    error?: string;
  };
  if (!response.ok || !json.ok) {
    throw new Error(json.error || "Could not load the media library.");
  }
  return { configured: Boolean(json.configured), assets: json.assets ?? [] };
}

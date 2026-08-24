"use client";

import type { MediaAsset, MediaRef } from "@/lib/cms/types";

export function MediaPickerModal({
  title = "Choose from Media Library",
  assets,
  onSelect,
  onClose,
}: {
  title?: string;
  assets: MediaAsset[];
  onSelect: (asset: MediaAsset) => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[80vh] w-full max-w-3xl overflow-auto rounded-xl bg-white p-6">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">{title}</h3>
          <button type="button" className="text-sm text-muted" onClick={onClose}>
            Close
          </button>
        </div>
        {assets.length === 0 ? (
          <p className="mt-4 text-sm text-muted">No images in the library yet. Upload one first.</p>
        ) : (
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {assets.map((asset) => (
              <button
                key={asset.id}
                type="button"
                className="overflow-hidden rounded-lg border border-line text-left hover:border-brand"
                onClick={() => onSelect(asset)}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={asset.secureUrl} alt="" className="h-24 w-full object-cover" />
                <span className="block truncate px-2 py-1 text-xs">{asset.originalFilename}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function toMediaRef(asset: Pick<MediaAsset, "id" | "publicId" | "secureUrl">): MediaRef {
  return { id: asset.id, publicId: asset.publicId, secureUrl: asset.secureUrl };
}

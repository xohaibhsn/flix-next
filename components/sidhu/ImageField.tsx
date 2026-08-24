"use client";

import { useRef, useState } from "react";
import type { MediaAsset, MediaRef } from "@/lib/cms/types";
import { uploadSidhuImage } from "@/lib/cms/media-client";
import { MEDIA_SPECS, MEDIA_UPLOAD, formatMediaSpec, type MediaSpecId } from "@/lib/media-specs";
import { Field, TextInput } from "@/components/sidhu/fields";
import { MediaPickerModal, toMediaRef } from "@/components/sidhu/MediaPickerModal";

export function MediaSpecHint({ specId }: { specId: MediaSpecId }) {
  const spec = formatMediaSpec(MEDIA_SPECS[specId]);
  return (
    <dl className="mt-3 grid gap-1 rounded-md border border-line bg-paper px-3 py-2 text-xs text-muted sm:grid-cols-2">
      <div>
        <dt className="font-semibold text-ink/70">Recommended size</dt>
        <dd>{spec.size}</dd>
      </div>
      <div>
        <dt className="font-semibold text-ink/70">Aspect ratio</dt>
        <dd>{spec.aspect}</dd>
      </div>
      <div>
        <dt className="font-semibold text-ink/70">Format</dt>
        <dd>{spec.formats}</dd>
      </div>
      <div>
        <dt className="font-semibold text-ink/70">Max upload size</dt>
        <dd>{spec.maxSize}</dd>
      </div>
      <div className="sm:col-span-2">
        <dt className="font-semibold text-ink/70">Transparent background</dt>
        <dd>{spec.transparent}</dd>
      </div>
      <div className="sm:col-span-2">
        <dt className="font-semibold text-ink/70">Usage</dt>
        <dd>
          {spec.usage} {spec.displayNote}
        </dd>
      </div>
    </dl>
  );
}

export function ImageField({
  title,
  specId,
  value,
  alt,
  onAlt,
  folder,
  configured,
  assets,
  onChange,
  onUploaded,
  onNotice,
}: {
  title: string;
  specId: MediaSpecId;
  value: MediaRef | null;
  alt?: string;
  onAlt?: (value: string) => void;
  folder: string;
  configured: boolean;
  assets: MediaAsset[];
  onChange: (value: MediaRef | null) => void;
  onUploaded?: (asset: MediaAsset) => void;
  onNotice?: (text: string, tone?: "ok" | "error" | "info") => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [picker, setPicker] = useState(false);
  const [uploading, setUploading] = useState(false);

  async function upload(file: File) {
    setUploading(true);
    try {
      const asset = await uploadSidhuImage(file, folder, alt);
      onChange(toMediaRef(asset));
      onUploaded?.(asset);
      onNotice?.(
        "Uploaded to Cloudinary immediately. Click Save to apply this image on the website.",
        "info",
      );
    } catch (error) {
      onNotice?.(error instanceof Error ? error.message : "Upload failed.", "error");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <section className="rounded-xl border border-line bg-white p-5">
      <h2 className="font-semibold">{title}</h2>
      <MediaSpecHint specId={specId} />
      <p className="mt-2 text-xs text-muted">
        <strong>Upload New Image</strong> sends the selected file to Cloudinary immediately. Choosing from
        the library only assigns it. In both cases, click Save to apply it on the website.
      </p>
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
            ref={inputRef}
            type="file"
            className="sr-only"
            accept={MEDIA_UPLOAD.accept}
            disabled={!configured || uploading}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void upload(file);
            }}
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-md bg-brand px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
              disabled={!configured || uploading}
              onClick={() => inputRef.current?.click()}
            >
              {uploading ? "Uploading…" : "Upload New Image"}
            </button>
            <button type="button" className="rounded border border-line px-3 py-1.5 text-xs" onClick={() => setPicker(true)}>
              Choose from Media Library
            </button>
            <button type="button" className="rounded border border-line px-3 py-1.5 text-xs" onClick={() => onChange(null)}>
              Remove
            </button>
          </div>
          {onAlt ? (
            <Field label="Alt text">
              <TextInput value={alt ?? ""} onChange={(event) => onAlt(event.target.value)} />
            </Field>
          ) : null}
        </div>
      </div>
      {picker ? (
        <MediaPickerModal
          assets={assets}
          onClose={() => setPicker(false)}
          onSelect={(asset) => {
            onChange(toMediaRef(asset));
            setPicker(false);
            onNotice?.("Selected from library — Save to apply.", "info");
          }}
        />
      ) : null}
    </section>
  );
}

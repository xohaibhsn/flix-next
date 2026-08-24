export const MEDIA_UPLOAD = {
  maxBytes: 5 * 1024 * 1024,
  maxLabel: "5 MB",
  formats: ["JPG", "JPEG", "PNG", "WEBP"] as const,
  accept: "image/jpeg,image/png,image/webp",
  mimeTypes: ["image/jpeg", "image/png", "image/webp"] as const,
  extensions: [".jpg", ".jpeg", ".png", ".webp"] as const,
};

export type MediaSpecId =
  | "logo"
  | "favicon"
  | "defaultOg"
  | "pageOg"
  | "blogFeatured"
  | "blogOg"
  | "blogContent"
  | "footerPayment";

export type MediaSpec = {
  id: MediaSpecId;
  title: string;
  width: number;
  height: number;
  aspectRatio: string;
  formats: string;
  maxSize: string;
  transparent: boolean;
  usage: string;
  displayNote: string;
};

/**
 * Recommendations are derived from live frontend CSS, not invented “nice” numbers.
 * Header/footer logo: h-10 (40px) × max-w-[180px] → 4.5:1 box. 720×160 is 4× that box.
 * Blog cards: h-44 (176px) full card width, object-cover. Article image is max-w-3xl, full width.
 * Footer payment icons: h-6 (24px) × auto.
 */
export const MEDIA_SPECS: Record<MediaSpecId, MediaSpec> = {
  logo: {
    id: "logo",
    title: "Website logo",
    width: 720,
    height: 160,
    aspectRatio: "9:2 (4.5:1)",
    formats: "PNG or WEBP",
    maxSize: MEDIA_UPLOAD.maxLabel,
    transparent: true,
    usage: "Header and footer wordmark. Keep important artwork inside the 180×40 CSS box.",
    displayNote: "Rendered at 40px tall, max 180px wide. 720×160 is a 4× retina master of that box.",
  },
  favicon: {
    id: "favicon",
    title: "Favicon",
    width: 512,
    height: 512,
    aspectRatio: "1:1",
    formats: "PNG or WEBP",
    maxSize: MEDIA_UPLOAD.maxLabel,
    transparent: true,
    usage: "Browser tab icon and shortcuts. Upload a 512×512 master; the browser scales it down.",
    displayNote: "Do not design only at 32×32. A square 512×512 source is the preferred master.",
  },
  defaultOg: {
    id: "defaultOg",
    title: "Default Open Graph image",
    width: 1200,
    height: 630,
    aspectRatio: "1.91:1",
    formats: "JPG, PNG, or WEBP",
    maxSize: MEDIA_UPLOAD.maxLabel,
    transparent: false,
    usage: "Fallback social sharing image when a page or post does not set its own OG image.",
    displayNote: "Used by Facebook, LinkedIn, WhatsApp, and similar link previews.",
  },
  pageOg: {
    id: "pageOg",
    title: "Page Open Graph image",
    width: 1200,
    height: 630,
    aspectRatio: "1.91:1",
    formats: "JPG, PNG, or WEBP",
    maxSize: MEDIA_UPLOAD.maxLabel,
    transparent: false,
    usage: "Per-page social sharing image for Home, IPTV, Contact, and Blog listing SEO.",
    displayNote: "If empty, the default OG image is used.",
  },
  blogFeatured: {
    id: "blogFeatured",
    title: "Blog featured image",
    width: 1280,
    height: 720,
    aspectRatio: "16:9",
    formats: "JPG, PNG, or WEBP",
    maxSize: MEDIA_UPLOAD.maxLabel,
    transparent: false,
    usage: "Blog listing cards (176px tall, object-cover) and the article header image (full width of a 768px column).",
    displayNote: "16:9 is the reusable ratio that matches both the card crop and the article hero.",
  },
  blogOg: {
    id: "blogOg",
    title: "Blog Open Graph image",
    width: 1200,
    height: 630,
    aspectRatio: "1.91:1",
    formats: "JPG, PNG, or WEBP",
    maxSize: MEDIA_UPLOAD.maxLabel,
    transparent: false,
    usage: "Social sharing image for this post. If empty, the featured image is used.",
    displayNote: "Standard 1200×630 sharing size.",
  },
  blogContent: {
    id: "blogContent",
    title: "In-article image",
    width: 1200,
    height: 675,
    aspectRatio: "16:9",
    formats: "JPG, PNG, or WEBP",
    maxSize: MEDIA_UPLOAD.maxLabel,
    transparent: false,
    usage: "Images inserted into blog body content. Displayed at the article column width.",
    displayNote: "A 16:9 landscape image is the safest default for body content.",
  },
  footerPayment: {
    id: "footerPayment",
    title: "Footer payment icon",
    width: 160,
    height: 48,
    aspectRatio: "10:3",
    formats: "PNG or WEBP",
    maxSize: MEDIA_UPLOAD.maxLabel,
    transparent: true,
    usage: "Compact payment-method marks in the footer bar.",
    displayNote: "Rendered at 24px tall. Keep the artwork simple and leave padding around the logo.",
  },
};

export function formatFileSize(bytes: number | null | undefined) {
  if (bytes == null || !Number.isFinite(bytes) || bytes < 0) return "Unknown size";
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatMediaSpec(spec: MediaSpec) {
  return {
    size: `${spec.width} × ${spec.height} px`,
    aspect: spec.aspectRatio,
    formats: spec.formats,
    maxSize: spec.maxSize,
    transparent: spec.transparent ? "Yes — transparent background recommended" : "Not required",
    usage: spec.usage,
    displayNote: spec.displayNote,
  };
}

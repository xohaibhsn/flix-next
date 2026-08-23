import Link from "next/link";
import { Play } from "lucide-react";
import { siteConfig } from "@/lib/site-config";

export type LogoBranding = {
  imageUrl?: string | null;
  alt?: string;
};

export function Logo({
  dark = false,
  imageUrl,
  alt,
}: {
  dark?: boolean;
} & LogoBranding) {
  if (imageUrl) {
    return (
      <Link href="/" className="flex shrink-0 items-center">
        {/* Cloudinary URLs vary in size; native img avoids layout shift issues. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageUrl}
          alt={alt || siteConfig.shortName}
          className="h-10 w-auto max-w-[180px] object-contain"
        />
      </Link>
    );
  }

  return (
    <Link href="/" className="flex shrink-0 items-center gap-2.5">
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand shadow-[0_0_0_3px_rgba(229,9,20,0.25)]">
        <Play className="ml-0.5 h-4 w-4 fill-white text-white" aria-hidden="true" />
      </span>
      <span
        className={`text-[15px] leading-tight font-extrabold tracking-tight ${dark ? "text-ink" : "text-white"}`}
      >
        {siteConfig.shortName}
        <span className="block text-[11px] font-semibold tracking-[0.18em] text-brand">
          IPTV
        </span>
      </span>
    </Link>
  );
}

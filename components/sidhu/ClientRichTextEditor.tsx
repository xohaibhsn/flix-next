"use client";

import dynamic from "next/dynamic";

export const ClientRichTextEditor = dynamic(
  () => import("@/components/sidhu/RichTextEditor").then((mod) => mod.RichTextEditor),
  {
    ssr: false,
    loading: () => <p className="text-sm text-muted">Loading editor…</p>,
  },
);

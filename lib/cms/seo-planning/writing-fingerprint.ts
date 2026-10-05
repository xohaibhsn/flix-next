/**
 * Server-side writing-brief source fingerprint for future D2/D3 prompt caches.
 * Not for client UI. Uses Node crypto only.
 */

import "server-only";
import { createHash } from "node:crypto";
import { buildWritingPromptInput, type WritingBrief } from "@/lib/cms/seo-planning/writing-brief";

export function fingerprintWritingBrief(brief: WritingBrief) {
  return createHash("sha256").update(buildWritingPromptInput(brief), "utf8").digest("hex");
}

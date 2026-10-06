/**
 * Server-side image-brief fingerprint for future E2/E3 image-prompt caches.
 * Not for client UI. Uses Node crypto only.
 */

import "server-only";
import { createHash } from "node:crypto";
import { buildImagePromptInput, type ImageBrief } from "@/lib/cms/seo-planning/image-brief";

export function fingerprintImageBrief(brief: ImageBrief) {
  return createHash("sha256").update(buildImagePromptInput(brief), "utf8").digest("hex");
}

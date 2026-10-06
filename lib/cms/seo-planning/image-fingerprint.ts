/**
 * Server-side image-brief fingerprint for future E2/E3 image-prompt caches.
 * Not for client UI. Uses Node crypto only.
 *
 * Hashes the complete normalized image semantic state (buildImageFingerprintInput),
 * not the bounded provider string (buildImagePromptInput).
 */

import "server-only";
import { createHash } from "node:crypto";
import {
  buildImageFingerprintInput,
  type ImageBrief,
} from "@/lib/cms/seo-planning/image-brief";

export function fingerprintImageBrief(brief: ImageBrief) {
  return createHash("sha256").update(buildImageFingerprintInput(brief), "utf8").digest("hex");
}

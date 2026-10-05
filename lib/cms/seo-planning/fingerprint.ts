import { normalizePublicPath } from "@/lib/cms/ai-seo/research-schemas";
import { withSlash } from "@/lib/cms/redirects";
import { slugify } from "@/lib/cms/slug";
import type { SeoPlanningActionableRecommendation } from "@/lib/cms/seo-planning/constants";
import { SEO_PLANNING_FIELD_CAPS } from "@/lib/cms/seo-planning/constants";

function clip(value: string, max: number) {
  return value.slice(0, max);
}

export function normalizePlanningRestorePath(raw: string) {
  const fromPublic = normalizePublicPath(raw);
  if (fromPublic) return withSlash(fromPublic);
  const trimmed = String(raw || "").trim();
  if (!trimmed) return "";
  if (!trimmed.startsWith("/")) return "";
  return withSlash(trimmed.split("?")[0]?.split("#")[0] || "");
}

export function normalizePlanningTopicKey(topic: string) {
  return slugify(topic) || "topic";
}

export function buildSeoPlanningFingerprint(args: {
  recommendation: SeoPlanningActionableRecommendation;
  proposedSlug?: string;
  targetPostId?: string | null;
  restorePath?: string;
  matchedPublicUrl?: string;
  topic?: string;
}): string {
  switch (args.recommendation) {
    case "NEW_BLOG": {
      const slug = slugify(args.proposedSlug || "");
      return clip(`NEW_BLOG:${slug}`, SEO_PLANNING_FIELD_CAPS.fingerprint);
    }
    case "REFRESH_EXISTING": {
      const id = String(args.targetPostId || "").trim();
      return clip(`REFRESH_EXISTING:${id}`, SEO_PLANNING_FIELD_CAPS.fingerprint);
    }
    case "RESTORE_HISTORICAL": {
      const path = normalizePlanningRestorePath(args.restorePath || "");
      return clip(`RESTORE_HISTORICAL:${path}`, SEO_PLANNING_FIELD_CAPS.fingerprint);
    }
    case "INTERNAL_LINK_ONLY": {
      const target = normalizePublicPath(args.matchedPublicUrl || "") || "";
      const topicKey = normalizePlanningTopicKey(args.topic || "");
      return clip(
        `INTERNAL_LINK_ONLY:${target}:${topicKey}`,
        SEO_PLANNING_FIELD_CAPS.fingerprint,
      );
    }
    default: {
      const _exhaustive: never = args.recommendation;
      return _exhaustive;
    }
  }
}

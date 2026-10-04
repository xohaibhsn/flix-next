/** UK Content Opportunity Research — structured output contract (V1). */

export const SEO_RESEARCH_RECOMMENDATIONS = [
  "NEW_BLOG",
  "REFRESH_EXISTING",
  "INTERNAL_LINK_ONLY",
  "SKIP",
] as const;
export type SeoResearchRecommendation = (typeof SEO_RESEARCH_RECOMMENDATIONS)[number];

export const SEO_RESEARCH_INTENTS = [
  "INFORMATIONAL",
  "COMMERCIAL",
  "SETUP",
  "TROUBLESHOOTING",
  "COMPARISON",
  "NAVIGATIONAL",
] as const;
export type SeoResearchIntent = (typeof SEO_RESEARCH_INTENTS)[number];

export const SEO_RESEARCH_CONFIDENCE = ["HIGH", "MEDIUM", "LOW"] as const;
export type SeoResearchConfidence = (typeof SEO_RESEARCH_CONFIDENCE)[number];

export const SEO_RESEARCH_COVERAGE = [
  "NONE",
  "PARTIAL",
  "STRONG",
] as const;
export type SeoResearchCoverage = (typeof SEO_RESEARCH_COVERAGE)[number];

export const SEO_RESEARCH_FIELD_CAPS = {
  topic: 120,
  workingTitle: 140,
  whyNow: 280,
  webEvidence: 360,
  existingCoverageNote: 280,
  matchedTitle: 160,
  matchedPublicUrl: 300,
  suggestedAngle: 280,
  nextStep: 220,
  opportunityCount: 5,
  sourceTitle: 160,
  sourceUrl: 400,
  sourceCount: 24,
} as const;

export type SeoResearchOpportunity = {
  topic: string;
  workingTitle: string;
  searchIntent: SeoResearchIntent;
  whyNow: string;
  webEvidence: string;
  existingCoverage: SeoResearchCoverage;
  matchedTitle: string | null;
  matchedPublicUrl: string | null;
  recommendation: SeoResearchRecommendation;
  suggestedAngle: string;
  nextStep: string;
  confidence: SeoResearchConfidence;
};

export type SeoResearchSource = {
  title: string;
  url: string;
  domain: string;
};

export type SeoResearchResult = {
  opportunities: SeoResearchOpportunity[];
  sources: SeoResearchSource[];
};

export const SEO_RESEARCH_SYSTEM_INSTRUCTION = [
  "You are Sidhu AI SEO Assistant researching current UK content opportunities for The Flix IPTV.",
  "Use live web research and the supplied current-site content inventory.",
  "Find useful topics relevant to legitimate IPTV/streaming setup, compatible devices/apps, playback quality, troubleshooting, product education and related UK user needs.",
  "Do not manufacture search volume, ranking data, Google Trends values, GSC data, traffic or competitor analytics.",
  "Do not recommend a new article when existing Flix content substantially covers the same search intent; prefer refresh or internal-link recommendations.",
  "Distinguish current web evidence from inference.",
  "Avoid keyword stuffing, sensational clickbait and unsupported claims.",
  "Return a small number of actionable opportunities for human editorial review.",
  "Nothing you return is permission to publish automatically.",
  "matchedPublicUrl must be empty string unless it exactly matches a publicUrl from the supplied inventory.",
].join(" ");

export const SEO_RESEARCH_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["opportunities"],
  properties: {
    opportunities: {
      type: "array",
      maxItems: SEO_RESEARCH_FIELD_CAPS.opportunityCount,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "topic",
          "workingTitle",
          "searchIntent",
          "whyNow",
          "webEvidence",
          "existingCoverage",
          "matchedTitle",
          "matchedPublicUrl",
          "recommendation",
          "suggestedAngle",
          "nextStep",
          "confidence",
        ],
        properties: {
          topic: { type: "string", maxLength: SEO_RESEARCH_FIELD_CAPS.topic },
          workingTitle: { type: "string", maxLength: SEO_RESEARCH_FIELD_CAPS.workingTitle },
          searchIntent: { type: "string", enum: [...SEO_RESEARCH_INTENTS] },
          whyNow: { type: "string", maxLength: SEO_RESEARCH_FIELD_CAPS.whyNow },
          webEvidence: { type: "string", maxLength: SEO_RESEARCH_FIELD_CAPS.webEvidence },
          existingCoverage: { type: "string", enum: [...SEO_RESEARCH_COVERAGE] },
          matchedTitle: { type: "string", maxLength: SEO_RESEARCH_FIELD_CAPS.matchedTitle },
          matchedPublicUrl: { type: "string", maxLength: SEO_RESEARCH_FIELD_CAPS.matchedPublicUrl },
          recommendation: { type: "string", enum: [...SEO_RESEARCH_RECOMMENDATIONS] },
          suggestedAngle: { type: "string", maxLength: SEO_RESEARCH_FIELD_CAPS.suggestedAngle },
          nextStep: { type: "string", maxLength: SEO_RESEARCH_FIELD_CAPS.nextStep },
          confidence: { type: "string", enum: [...SEO_RESEARCH_CONFIDENCE] },
        },
      },
    },
  },
} as const;

function trimTo(value: unknown, max: number) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function isEnum<T extends string>(value: unknown, allowed: readonly T[]): value is T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value);
}

export function isSafeHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

export function domainFromUrl(value: string) {
  try {
    return new URL(value).hostname.replace(/^www\./i, "");
  } catch {
    return "";
  }
}

export function normalizePublicPath(value: string) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    if (/^https?:\/\//i.test(raw)) {
      const url = new URL(raw);
      let path = url.pathname || "/";
      if (!path.endsWith("/")) path = `${path}/`;
      return path;
    }
  } catch {
    return "";
  }
  let path = raw.split("?")[0]?.split("#")[0] || "";
  if (!path.startsWith("/")) return "";
  if (!path.endsWith("/")) path = `${path}/`;
  return path;
}

export function normalizeSeoResearchSources(raw: unknown): SeoResearchSource[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: SeoResearchSource[] = [];
  for (const item of raw) {
    if (out.length >= SEO_RESEARCH_FIELD_CAPS.sourceCount) break;
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const url = trimTo(row.url ?? row.href, SEO_RESEARCH_FIELD_CAPS.sourceUrl);
    if (!url || !isSafeHttpUrl(url)) continue;
    const key = url.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const domain = domainFromUrl(url);
    const title = trimTo(row.title, SEO_RESEARCH_FIELD_CAPS.sourceTitle) || domain || url;
    out.push({ title, url, domain });
  }
  return out;
}

/**
 * Normalize model JSON against the allowlisted Flix public URLs.
 * Returns null when the payload is malformed.
 */
export function normalizeSeoResearchResult(
  raw: unknown,
  allowlistedPublicUrls: ReadonlySet<string>,
): SeoResearchResult | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const data = raw as Record<string, unknown>;
  if (!Array.isArray(data.opportunities)) return null;
  if (Object.keys(data).some((key) => key !== "opportunities")) return null;

  const opportunities: SeoResearchOpportunity[] = [];
  for (const item of data.opportunities.slice(0, SEO_RESEARCH_FIELD_CAPS.opportunityCount)) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return null;
    const row = item as Record<string, unknown>;
    const unexpected = Object.keys(row).filter(
      (key) =>
        ![
          "topic",
          "workingTitle",
          "searchIntent",
          "whyNow",
          "webEvidence",
          "existingCoverage",
          "matchedTitle",
          "matchedPublicUrl",
          "recommendation",
          "suggestedAngle",
          "nextStep",
          "confidence",
        ].includes(key),
    );
    if (unexpected.length) return null;

    const topic = trimTo(row.topic, SEO_RESEARCH_FIELD_CAPS.topic);
    const workingTitle = trimTo(row.workingTitle, SEO_RESEARCH_FIELD_CAPS.workingTitle);
    const whyNow = trimTo(row.whyNow, SEO_RESEARCH_FIELD_CAPS.whyNow);
    const webEvidence = trimTo(row.webEvidence, SEO_RESEARCH_FIELD_CAPS.webEvidence);
    const suggestedAngle = trimTo(row.suggestedAngle, SEO_RESEARCH_FIELD_CAPS.suggestedAngle);
    const nextStep = trimTo(row.nextStep, SEO_RESEARCH_FIELD_CAPS.nextStep);
    if (!topic || !workingTitle || !whyNow || !webEvidence || !suggestedAngle || !nextStep) return null;
    if (!isEnum(row.searchIntent, SEO_RESEARCH_INTENTS)) return null;
    if (!isEnum(row.existingCoverage, SEO_RESEARCH_COVERAGE)) return null;
    if (!isEnum(row.recommendation, SEO_RESEARCH_RECOMMENDATIONS)) return null;
    if (!isEnum(row.confidence, SEO_RESEARCH_CONFIDENCE)) return null;

    const matchedTitleRaw = trimTo(row.matchedTitle, SEO_RESEARCH_FIELD_CAPS.matchedTitle);
    const matchedUrlRaw = normalizePublicPath(
      trimTo(row.matchedPublicUrl, SEO_RESEARCH_FIELD_CAPS.matchedPublicUrl),
    );

    let matchedTitle: string | null = matchedTitleRaw || null;
    let matchedPublicUrl: string | null = null;

    if (
      row.recommendation === "REFRESH_EXISTING" ||
      row.recommendation === "INTERNAL_LINK_ONLY"
    ) {
      if (!matchedUrlRaw || !allowlistedPublicUrls.has(matchedUrlRaw)) {
        // Unsupported internal mapping — reject the whole payload rather than invent coverage.
        return null;
      }
      matchedPublicUrl = matchedUrlRaw;
      if (!matchedTitle) matchedTitle = matchedUrlRaw;
    } else if (matchedUrlRaw) {
      if (!allowlistedPublicUrls.has(matchedUrlRaw)) {
        matchedTitle = null;
        matchedPublicUrl = null;
      } else {
        matchedPublicUrl = matchedUrlRaw;
      }
    }

    opportunities.push({
      topic,
      workingTitle,
      searchIntent: row.searchIntent,
      whyNow,
      webEvidence,
      existingCoverage: row.existingCoverage,
      matchedTitle,
      matchedPublicUrl,
      recommendation: row.recommendation,
      suggestedAngle,
      nextStep,
      confidence: row.confidence,
    });
  }

  return { opportunities, sources: [] };
}

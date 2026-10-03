export const SEO_HEALTH_SEVERITIES = ["needs-attention", "review", "editorial", "healthy"] as const;
export type SeoExplainSeverity = (typeof SEO_HEALTH_SEVERITIES)[number];

export type SeoExplainFindingInput = {
  issueCode: string;
  severity: SeoExplainSeverity;
  title: string;
  explanation: string;
  entityType: string;
  entityLabel: string;
  publicUrl: string;
  evidence: string[];
  field?: string;
  siteName?: string;
};

export type SeoExplainResult = {
  summary: string;
  whyItMatters: string;
  recommendedNextStep: string;
  whatNotToDo: string;
};

export const SEO_EXPLAIN_FIELD_CAPS = {
  issueCode: 80,
  title: 200,
  explanation: 600,
  entityType: 80,
  entityLabel: 160,
  publicUrl: 300,
  evidenceItem: 220,
  evidenceCount: 8,
  field: 80,
  siteName: 80,
  summary: 250,
  whyItMatters: 400,
  recommendedNextStep: 400,
  whatNotToDo: 300,
} as const;

export const SEO_EXPLAIN_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "whyItMatters", "recommendedNextStep", "whatNotToDo"],
  properties: {
    summary: { type: "string", maxLength: SEO_EXPLAIN_FIELD_CAPS.summary },
    whyItMatters: { type: "string", maxLength: SEO_EXPLAIN_FIELD_CAPS.whyItMatters },
    recommendedNextStep: { type: "string", maxLength: SEO_EXPLAIN_FIELD_CAPS.recommendedNextStep },
    whatNotToDo: { type: "string", maxLength: SEO_EXPLAIN_FIELD_CAPS.whatNotToDo },
  },
} as const;

function trimTo(value: unknown, max: number) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function isSeverity(value: unknown): value is SeoExplainSeverity {
  return typeof value === "string" && (SEO_HEALTH_SEVERITIES as readonly string[]).includes(value);
}

function looksLikeSafeUrlOrPath(value: string) {
  if (!value) return true;
  if (/^\/(?!\/)/.test(value)) return value.length <= SEO_EXPLAIN_FIELD_CAPS.publicUrl;
  try {
    const url = new URL(value);
    return (url.protocol === "https:" || url.protocol === "http:") && value.length <= SEO_EXPLAIN_FIELD_CAPS.publicUrl;
  } catch {
    return false;
  }
}

export type ParseExplainInputResult =
  | { ok: true; value: SeoExplainFindingInput }
  | { ok: false; error: string };

/** Treat all client-submitted finding context as untrusted. */
export function parseSeoExplainFindingInput(raw: unknown): ParseExplainInputResult {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, error: "Invalid finding context." };
  }
  const data = raw as Record<string, unknown>;
  const unexpected = Object.keys(data).filter(
    (key) =>
      ![
        "issueCode",
        "severity",
        "title",
        "explanation",
        "entityType",
        "entityLabel",
        "publicUrl",
        "evidence",
        "field",
        "siteName",
      ].includes(key),
  );
  if (unexpected.length) {
    return { ok: false, error: "Unexpected finding fields were rejected." };
  }

  const issueCode = trimTo(data.issueCode, SEO_EXPLAIN_FIELD_CAPS.issueCode);
  if (!/^[A-Z][A-Z0-9_]{1,78}$/.test(issueCode)) {
    return { ok: false, error: "Invalid diagnostic code." };
  }
  if (!isSeverity(data.severity)) {
    return { ok: false, error: "Invalid severity." };
  }

  const title = trimTo(data.title, SEO_EXPLAIN_FIELD_CAPS.title);
  const explanation = trimTo(data.explanation, SEO_EXPLAIN_FIELD_CAPS.explanation);
  const entityType = trimTo(data.entityType, SEO_EXPLAIN_FIELD_CAPS.entityType);
  const entityLabel = trimTo(data.entityLabel, SEO_EXPLAIN_FIELD_CAPS.entityLabel);
  const publicUrl = trimTo(data.publicUrl, SEO_EXPLAIN_FIELD_CAPS.publicUrl);
  if (!title || !explanation || !entityType || !entityLabel) {
    return { ok: false, error: "Finding context is incomplete." };
  }
  if (!looksLikeSafeUrlOrPath(publicUrl)) {
    return { ok: false, error: "Invalid public URL." };
  }

  const evidenceRaw = Array.isArray(data.evidence) ? data.evidence : [];
  if (evidenceRaw.length > SEO_EXPLAIN_FIELD_CAPS.evidenceCount) {
    return { ok: false, error: "Too much evidence was supplied." };
  }
  const evidence = evidenceRaw
    .map((item) => trimTo(item, SEO_EXPLAIN_FIELD_CAPS.evidenceItem))
    .filter(Boolean)
    .slice(0, SEO_EXPLAIN_FIELD_CAPS.evidenceCount);

  const field = data.field == null || data.field === "" ? undefined : trimTo(data.field, SEO_EXPLAIN_FIELD_CAPS.field);
  const siteName =
    data.siteName == null || data.siteName === "" ? undefined : trimTo(data.siteName, SEO_EXPLAIN_FIELD_CAPS.siteName);

  return {
    ok: true,
    value: {
      issueCode,
      severity: data.severity,
      title,
      explanation,
      entityType,
      entityLabel,
      publicUrl,
      evidence,
      field,
      siteName,
    },
  };
}

export function normalizeSeoExplainResult(raw: unknown): SeoExplainResult | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const data = raw as Record<string, unknown>;
  const keys = Object.keys(data);
  if (keys.some((key) => !["summary", "whyItMatters", "recommendedNextStep", "whatNotToDo"].includes(key))) {
    return null;
  }
  const summary = trimTo(data.summary, SEO_EXPLAIN_FIELD_CAPS.summary);
  const whyItMatters = trimTo(data.whyItMatters, SEO_EXPLAIN_FIELD_CAPS.whyItMatters);
  const recommendedNextStep = trimTo(data.recommendedNextStep, SEO_EXPLAIN_FIELD_CAPS.recommendedNextStep);
  const whatNotToDo = trimTo(data.whatNotToDo, SEO_EXPLAIN_FIELD_CAPS.whatNotToDo);
  if (!summary || !whyItMatters || !recommendedNextStep || !whatNotToDo) return null;
  return { summary, whyItMatters, recommendedNextStep, whatNotToDo };
}

/** Map a scanner finding into the bounded explain payload (client may still re-submit; server re-validates). */
export function toSeoExplainFindingInput(
  finding: {
    issueCode: string;
    severity: SeoExplainSeverity;
    title: string;
    explanation: string;
    entity: { type: string; label: string };
    publicUrl: string;
    evidence: string[];
  },
  extras?: { field?: string; siteName?: string },
): SeoExplainFindingInput {
  return {
    issueCode: finding.issueCode,
    severity: finding.severity,
    title: finding.title,
    explanation: finding.explanation,
    entityType: finding.entity.type,
    entityLabel: finding.entity.label,
    publicUrl: finding.publicUrl,
    evidence: finding.evidence.slice(0, SEO_EXPLAIN_FIELD_CAPS.evidenceCount),
    field: extras?.field,
    siteName: extras?.siteName,
  };
}

export const SEO_EXPLAIN_SYSTEM_INSTRUCTION = `You are Sidhu AI SEO Assistant.

Explain a deterministic SEO diagnostic to a non-SEO website administrator.

The supplied scanner finding is authoritative.
Do not override its severity or claim the scanner is wrong.

Explain in simple language.

Distinguish technical problems from optional editorial guidance.

Do not recommend changing good content merely to satisfy a character-count heuristic.

Do not recommend keyword stuffing.

Do not promise rankings.

Do not fabricate business claims, traffic, search performance, backlinks, or Google behavior.

Use only the supplied context.

If evidence is insufficient, say what cannot be determined.

Keep the explanation short and actionable.

Return JSON only matching the required schema.`;

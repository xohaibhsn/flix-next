/** Server-only Gemini REST provider for Sidhu AI SEO explain + title/meta draft. */

import {
  getGeminiSeoConfig,
  type GeminiSeoConfig,
} from "@/lib/cms/ai-seo/config";
import {
  buildSeoDraftUserPayload,
  buildSeoExplainUserPayload,
} from "@/lib/cms/ai-seo/provider";
import {
  normalizeSeoDraftResult,
  normalizeSeoExplainResult,
  SEO_DRAFT_JSON_SCHEMA,
  SEO_DRAFT_SYSTEM_INSTRUCTION,
  SEO_EXPLAIN_JSON_SCHEMA,
  SEO_EXPLAIN_SYSTEM_INSTRUCTION,
  type SeoDraftInput,
  type SeoDraftResult,
  type SeoExplainFindingInput,
  type SeoExplainResult,
} from "@/lib/cms/ai-seo/schemas";

/**
 * Safe failure codes returned to callers. Never include provider raw text.
 * 401 maps to existing app convention `unauthorized`.
 */
export type GeminiProviderErrorCode =
  | "not_configured"
  | "invalid_request"
  | "failed_precondition"
  | "unauthorized"
  | "payment_required"
  | "permission_denied"
  | "not_found"
  | "timeout"
  | "rate_limited"
  | "unavailable"
  | "invalid_response";

/**
 * Strict allowlist of Google `error.status` values.
 * Unknown strings become UNKNOWN — never pass arbitrary provider strings to callers.
 */
export const GEMINI_UPSTREAM_STATUSES = [
  "INVALID_ARGUMENT",
  "FAILED_PRECONDITION",
  "UNAUTHENTICATED",
  "PERMISSION_DENIED",
  "NOT_FOUND",
  "RESOURCE_EXHAUSTED",
  "INTERNAL",
  "UNAVAILABLE",
  "DEADLINE_EXCEEDED",
  "UNKNOWN",
] as const;

export type GeminiUpstreamStatus = (typeof GEMINI_UPSTREAM_STATUSES)[number];

/** Bounded internal diagnostic — never persist, never include raw provider content. */
export type GeminiSafeDiagnostic =
  | "NOT_CONFIGURED"
  | "BAD_REQUEST"
  | "INVALID_ARGUMENT"
  | "FAILED_PRECONDITION"
  | "AUTHENTICATION"
  | "PAYMENT_REQUIRED"
  | "PERMISSION_DENIED"
  | "NOT_FOUND"
  | "RATE_LIMITED"
  | "UPSTREAM_UNAVAILABLE"
  | "TIMEOUT"
  | "INVALID_RESPONSE";

export type GeminiProviderFailure = {
  ok: false;
  code: GeminiProviderErrorCode;
  message: string;
  /** Optional HTTP status for server-side/test classification only. */
  httpStatus?: number;
  diagnostic?: GeminiSafeDiagnostic;
  /** Allowlisted Google error.status only — never raw message/details. */
  upstreamStatus?: GeminiUpstreamStatus;
};

export type GeminiExplainProviderResult =
  | { ok: true; explanation: SeoExplainResult; model: string }
  | GeminiProviderFailure;

export type GeminiDraftProviderResult =
  | { ok: true; draft: SeoDraftResult; model: string }
  | GeminiProviderFailure;

export type GeminiFetch = typeof fetch;

/** JSON Schema keywords documented for Gemini structured JSON Schema subset. */
const GEMINI_STRUCTURED_SCHEMA_KEYS = new Set([
  "$id",
  "$defs",
  "$ref",
  "$anchor",
  "type",
  "format",
  "title",
  "description",
  "enum",
  "items",
  "prefixItems",
  "minItems",
  "maxItems",
  "minimum",
  "maximum",
  "anyOf",
  "oneOf",
  "properties",
  "additionalProperties",
  "required",
  "propertyOrdering",
]);

/**
 * Adapt domain JSON Schema for Gemini generateContent structured output.
 * Strips unsupported keywords (e.g. maxLength) without changing the domain contract used elsewhere.
 */
export function toGeminiStructuredJsonSchema(schema: unknown): object {
  if (Array.isArray(schema)) {
    return schema.map((item) => toGeminiStructuredJsonSchema(item));
  }
  if (!schema || typeof schema !== "object") {
    return schema as object;
  }
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(schema as Record<string, unknown>)) {
    if (!GEMINI_STRUCTURED_SCHEMA_KEYS.has(key)) continue;
    if (key === "properties" && value && typeof value === "object" && !Array.isArray(value)) {
      const props: Record<string, unknown> = {};
      for (const [propKey, propValue] of Object.entries(value as Record<string, unknown>)) {
        props[propKey] = toGeminiStructuredJsonSchema(propValue);
      }
      out[key] = props;
      continue;
    }
    if (key === "items" || key === "additionalProperties") {
      out[key] = toGeminiStructuredJsonSchema(value);
      continue;
    }
    if ((key === "anyOf" || key === "oneOf" || key === "prefixItems") && Array.isArray(value)) {
      out[key] = value.map((item) => toGeminiStructuredJsonSchema(item));
      continue;
    }
    if (key === "$defs" && value && typeof value === "object" && !Array.isArray(value)) {
      const defs: Record<string, unknown> = {};
      for (const [defKey, defValue] of Object.entries(value as Record<string, unknown>)) {
        defs[defKey] = toGeminiStructuredJsonSchema(defValue);
      }
      out[key] = defs;
      continue;
    }
    out[key] = value;
  }
  return out;
}

/**
 * Extract ONLY allowlisted `error.status` from a Gemini error JSON body.
 * Never returns message, details, or any other provider field.
 */
export function extractGeminiUpstreamStatus(payload: unknown): GeminiUpstreamStatus {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return "UNKNOWN";
  const error = (payload as Record<string, unknown>).error;
  if (!error || typeof error !== "object" || Array.isArray(error)) return "UNKNOWN";
  const status = (error as Record<string, unknown>).status;
  if (typeof status !== "string") return "UNKNOWN";
  return (GEMINI_UPSTREAM_STATUSES as readonly string[]).includes(status)
    ? (status as GeminiUpstreamStatus)
    : "UNKNOWN";
}

export function classifyGeminiHttpFailure(
  status: number,
  upstreamStatus: GeminiUpstreamStatus = "UNKNOWN",
): {
  code: GeminiProviderErrorCode;
  message: string;
  diagnostic: GeminiSafeDiagnostic;
  upstreamStatus: GeminiUpstreamStatus;
} {
  if (status === 400) {
    if (upstreamStatus === "INVALID_ARGUMENT") {
      return {
        code: "invalid_request",
        message: "Gemini rejected the request parameters.",
        diagnostic: "INVALID_ARGUMENT",
        upstreamStatus,
      };
    }
    if (upstreamStatus === "FAILED_PRECONDITION") {
      return {
        code: "failed_precondition",
        message:
          "Gemini project prerequisites are not satisfied. Check the AI Studio project status and billing/eligibility settings.",
        diagnostic: "FAILED_PRECONDITION",
        upstreamStatus,
      };
    }
    return {
      code: "invalid_request",
      message: "Gemini request was rejected by the API configuration.",
      diagnostic: "BAD_REQUEST",
      upstreamStatus,
    };
  }
  if (status === 401 || upstreamStatus === "UNAUTHENTICATED") {
    return {
      code: "unauthorized",
      message: "Gemini authentication failed. Check the configured API key.",
      diagnostic: "AUTHENTICATION",
      upstreamStatus: upstreamStatus === "UNKNOWN" && status === 401 ? "UNAUTHENTICATED" : upstreamStatus,
    };
  }
  if (status === 402) {
    return {
      code: "payment_required",
      message: "Gemini API billing or credit is required for this request.",
      diagnostic: "PAYMENT_REQUIRED",
      upstreamStatus,
    };
  }
  if (status === 403 || upstreamStatus === "PERMISSION_DENIED") {
    return {
      code: "permission_denied",
      message: "Gemini API access is not permitted for the configured key/project.",
      diagnostic: "PERMISSION_DENIED",
      upstreamStatus: upstreamStatus === "UNKNOWN" && status === 403 ? "PERMISSION_DENIED" : upstreamStatus,
    };
  }
  if (status === 404 || upstreamStatus === "NOT_FOUND") {
    return {
      code: "not_found",
      message: "Gemini model or endpoint is not available for this configuration.",
      diagnostic: "NOT_FOUND",
      upstreamStatus: upstreamStatus === "UNKNOWN" && status === 404 ? "NOT_FOUND" : upstreamStatus,
    };
  }
  if (status === 429 || upstreamStatus === "RESOURCE_EXHAUSTED") {
    return {
      code: "rate_limited",
      message: "Gemini request limit reached. Please try again later.",
      diagnostic: "RATE_LIMITED",
      upstreamStatus: upstreamStatus === "UNKNOWN" && status === 429 ? "RESOURCE_EXHAUSTED" : upstreamStatus,
    };
  }
  return {
    code: "unavailable",
    message: "Gemini is temporarily unavailable.",
    diagnostic: "UPSTREAM_UNAVAILABLE",
    upstreamStatus,
  };
}

/**
 * Extract text from a Gemini generateContent response without returning raw payloads to callers.
 * Never logs or rethrows provider bodies.
 */
export function extractGeminiGenerateContentText(payload: unknown): string {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return "";
  const root = payload as Record<string, unknown>;
  const candidates = Array.isArray(root.candidates) ? root.candidates : [];
  const chunks: string[] = [];
  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== "object") continue;
    const content = (candidate as Record<string, unknown>).content;
    if (!content || typeof content !== "object") continue;
    const parts = Array.isArray((content as Record<string, unknown>).parts)
      ? ((content as Record<string, unknown>).parts as unknown[])
      : [];
    for (const part of parts) {
      if (!part || typeof part !== "object") continue;
      const text = (part as Record<string, unknown>).text;
      if (typeof text === "string" && text.trim()) chunks.push(text.trim());
    }
  }
  return chunks.join("\n").trim();
}

/**
 * Current Gemini REST structured-output shape (non-deprecated):
 * generationConfig.responseFormat.text.{ mimeType, schema }
 * Auth via x-goog-api-key header (never query string).
 */
export function buildGeminiStructuredRequestBody(args: {
  systemInstruction: string;
  userPayload: unknown;
  jsonSchema: object;
  maxOutputTokens: number;
}) {
  return {
    systemInstruction: {
      parts: [{ text: args.systemInstruction }],
    },
    contents: [
      {
        role: "user",
        parts: [{ text: JSON.stringify(args.userPayload) }],
      },
    ],
    generationConfig: {
      maxOutputTokens: args.maxOutputTokens,
      responseFormat: {
        text: {
          // TextResponseFormat.MimeType enum — IANA "application/json" is rejected by Google.
          mimeType: "APPLICATION_JSON",
          schema: toGeminiStructuredJsonSchema(args.jsonSchema),
        },
      },
    },
  };
}

export function buildGeminiExplainRequestBody(finding: SeoExplainFindingInput, config: GeminiSeoConfig) {
  return buildGeminiStructuredRequestBody({
    systemInstruction: SEO_EXPLAIN_SYSTEM_INSTRUCTION,
    userPayload: buildSeoExplainUserPayload(finding),
    jsonSchema: SEO_EXPLAIN_JSON_SCHEMA,
    maxOutputTokens: config.maxOutputTokens,
  });
}

export function buildGeminiDraftRequestBody(input: SeoDraftInput, config: GeminiSeoConfig) {
  return buildGeminiStructuredRequestBody({
    systemInstruction: SEO_DRAFT_SYSTEM_INSTRUCTION,
    userPayload: buildSeoDraftUserPayload(input),
    jsonSchema: SEO_DRAFT_JSON_SCHEMA,
    maxOutputTokens: config.draftMaxOutputTokens,
  });
}

function fail(
  code: GeminiProviderErrorCode,
  message: string,
  extras?: {
    httpStatus?: number;
    diagnostic?: GeminiSafeDiagnostic;
    upstreamStatus?: GeminiUpstreamStatus;
  },
): GeminiProviderFailure {
  return {
    ok: false,
    code,
    message,
    ...(extras?.httpStatus != null ? { httpStatus: extras.httpStatus } : {}),
    ...(extras?.diagnostic ? { diagnostic: extras.diagnostic } : {}),
    ...(extras?.upstreamStatus ? { upstreamStatus: extras.upstreamStatus } : {}),
  };
}

async function requestGeminiStructuredJson(args: {
  body: object;
  config: GeminiSeoConfig;
  fetchImpl?: GeminiFetch;
  timeoutMessage: string;
}): Promise<{ ok: true; json: unknown; model: string } | GeminiProviderFailure> {
  if (!args.config.configured || !args.config.apiKey || !args.config.model || !args.config.endpoint) {
    return fail("not_configured", "Sidhu AI SEO Assistant is not configured yet.", {
      diagnostic: "NOT_CONFIGURED",
    });
  }

  const fetchImpl = args.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), args.config.timeoutMs);

  try {
    const response = await fetchImpl(args.config.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": args.config.apiKey,
      },
      body: JSON.stringify(args.body),
      signal: controller.signal,
    });

    if (!response.ok) {
      // Parse body only to read allowlisted error.status; never return message/details/raw body.
      let upstreamStatus: GeminiUpstreamStatus = "UNKNOWN";
      try {
        const errorPayload: unknown = await response.json();
        upstreamStatus = extractGeminiUpstreamStatus(errorPayload);
      } catch {
        try {
          await response.arrayBuffer();
        } catch {
          /* ignore */
        }
      }
      const classified = classifyGeminiHttpFailure(response.status, upstreamStatus);
      return fail(classified.code, classified.message, {
        httpStatus: response.status,
        diagnostic: classified.diagnostic,
        upstreamStatus: classified.upstreamStatus,
      });
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      return fail("invalid_response", "AI returned an unusable response. Please try again.", {
        httpStatus: response.status,
        diagnostic: "INVALID_RESPONSE",
      });
    }

    const text = extractGeminiGenerateContentText(payload);
    if (!text) {
      return fail("invalid_response", "AI returned an unusable response. Please try again.", {
        httpStatus: response.status,
        diagnostic: "INVALID_RESPONSE",
      });
    }

    try {
      return { ok: true, json: JSON.parse(text), model: args.config.model };
    } catch {
      return fail("invalid_response", "AI returned an unusable response. Please try again.", {
        httpStatus: response.status,
        diagnostic: "INVALID_RESPONSE",
      });
    }
  } catch (error) {
    if (error instanceof Error && (error.name === "AbortError" || /aborted/i.test(error.message))) {
      return fail("timeout", args.timeoutMessage, { diagnostic: "TIMEOUT" });
    }
    return fail("unavailable", "Gemini is temporarily unavailable.", {
      diagnostic: "UPSTREAM_UNAVAILABLE",
    });
  } finally {
    clearTimeout(timer);
  }
}

export async function requestGeminiSeoExplanation(
  finding: SeoExplainFindingInput,
  options?: {
    fetchImpl?: GeminiFetch;
    config?: GeminiSeoConfig;
  },
): Promise<GeminiExplainProviderResult> {
  const config = options?.config ?? getGeminiSeoConfig();
  const result = await requestGeminiStructuredJson({
    body: buildGeminiExplainRequestBody(finding, config),
    config,
    fetchImpl: options?.fetchImpl,
    timeoutMessage: "AI explanation took too long. Please try again.",
  });
  if (!result.ok) return result;

  const explanation = normalizeSeoExplainResult(result.json);
  if (!explanation) {
    return fail("invalid_response", "AI returned an unusable response. Please try again.", {
      diagnostic: "INVALID_RESPONSE",
    });
  }
  return { ok: true, explanation, model: result.model };
}

export async function requestGeminiSeoDraft(
  input: SeoDraftInput,
  options?: {
    fetchImpl?: GeminiFetch;
    config?: GeminiSeoConfig;
  },
): Promise<GeminiDraftProviderResult> {
  const config = options?.config ?? getGeminiSeoConfig();
  const result = await requestGeminiStructuredJson({
    body: buildGeminiDraftRequestBody(input, config),
    config,
    fetchImpl: options?.fetchImpl,
    timeoutMessage: "AI drafting took too long. Please try again.",
  });
  if (!result.ok) return result;

  const draft = normalizeSeoDraftResult(result.json);
  if (!draft) {
    return fail("invalid_response", "AI returned an unusable response. Please try again.", {
      diagnostic: "INVALID_RESPONSE",
    });
  }
  return { ok: true, draft, model: result.model };
}

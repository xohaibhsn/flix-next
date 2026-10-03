import {
  getOpenAiSeoConfig,
  type OpenAiSeoConfig,
} from "@/lib/cms/ai-seo/config";
import {
  normalizeSeoExplainResult,
  SEO_EXPLAIN_JSON_SCHEMA,
  SEO_EXPLAIN_SYSTEM_INSTRUCTION,
  type SeoExplainFindingInput,
  type SeoExplainResult,
} from "@/lib/cms/ai-seo/schemas";

export type OpenAiProviderErrorCode =
  | "not_configured"
  | "timeout"
  | "rate_limited"
  | "unavailable"
  | "invalid_response";

export type OpenAiProviderResult =
  | { ok: true; explanation: SeoExplainResult; model: string }
  | { ok: false; code: OpenAiProviderErrorCode; message: string };

export type OpenAiFetch = typeof fetch;

function buildUserPayload(finding: SeoExplainFindingInput) {
  return {
    task: "explain_seo_finding",
    finding: {
      issueCode: finding.issueCode,
      severity: finding.severity,
      title: finding.title,
      explanation: finding.explanation,
      entityType: finding.entityType,
      entityLabel: finding.entityLabel,
      publicUrl: finding.publicUrl,
      evidence: finding.evidence,
      field: finding.field || null,
      siteName: finding.siteName || null,
    },
  };
}

/** Walk Responses API output items and collect text payloads. */
export function extractResponsesOutputText(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const root = payload as Record<string, unknown>;

  if (typeof root.output_text === "string" && root.output_text.trim()) {
    return root.output_text.trim();
  }

  const chunks: string[] = [];
  const output = Array.isArray(root.output) ? root.output : [];
  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const content = Array.isArray(row.content) ? row.content : [];
    for (const part of content) {
      if (!part || typeof part !== "object") continue;
      const block = part as Record<string, unknown>;
      if (typeof block.text === "string" && block.text.trim()) {
        chunks.push(block.text.trim());
        continue;
      }
      if (block.type === "output_text" && typeof block.text === "string" && block.text.trim()) {
        chunks.push(block.text.trim());
      }
    }
  }
  return chunks.join("\n").trim();
}

export function buildOpenAiExplainRequestBody(finding: SeoExplainFindingInput, config: OpenAiSeoConfig) {
  return {
    model: config.model,
    store: false,
    reasoning: { effort: "none" },
    max_output_tokens: config.maxOutputTokens,
    text: {
      format: {
        type: "json_schema",
        name: "sidhu_seo_explain",
        strict: true,
        schema: SEO_EXPLAIN_JSON_SCHEMA,
      },
    },
    input: [
      {
        role: "developer",
        content: [{ type: "input_text", text: SEO_EXPLAIN_SYSTEM_INSTRUCTION }],
      },
      {
        role: "user",
        content: [{ type: "input_text", text: JSON.stringify(buildUserPayload(finding)) }],
      },
    ],
  };
}

export async function requestOpenAiSeoExplanation(
  finding: SeoExplainFindingInput,
  options?: {
    fetchImpl?: OpenAiFetch;
    config?: OpenAiSeoConfig;
  },
): Promise<OpenAiProviderResult> {
  const config = options?.config ?? getOpenAiSeoConfig();
  if (!config.configured || !config.apiKey) {
    return {
      ok: false,
      code: "not_configured",
      message: "Sidhu AI SEO Assistant is not configured yet.",
    };
  }

  const fetchImpl = options?.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);

  try {
    const response = await fetchImpl(config.endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(buildOpenAiExplainRequestBody(finding, config)),
      signal: controller.signal,
    });

    if (response.status === 429) {
      return {
        ok: false,
        code: "rate_limited",
        message: "AI request limit reached. Please try again later.",
      };
    }

    if (!response.ok) {
      return {
        ok: false,
        code: "unavailable",
        message: "AI explanation is temporarily unavailable.",
      };
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      return {
        ok: false,
        code: "invalid_response",
        message: "AI returned an unusable response. Please try again.",
      };
    }

    const text = extractResponsesOutputText(payload);
    if (!text) {
      return {
        ok: false,
        code: "invalid_response",
        message: "AI returned an unusable response. Please try again.",
      };
    }

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(text);
    } catch {
      return {
        ok: false,
        code: "invalid_response",
        message: "AI returned an unusable response. Please try again.",
      };
    }

    const explanation = normalizeSeoExplainResult(parsedJson);
    if (!explanation) {
      return {
        ok: false,
        code: "invalid_response",
        message: "AI returned an unusable response. Please try again.",
      };
    }

    return { ok: true, explanation, model: config.model };
  } catch (error) {
    if (error instanceof Error && (error.name === "AbortError" || /aborted/i.test(error.message))) {
      return {
        ok: false,
        code: "timeout",
        message: "AI explanation took too long. Please try again.",
      };
    }
    return {
      ok: false,
      code: "unavailable",
      message: "AI explanation is temporarily unavailable.",
    };
  } finally {
    clearTimeout(timer);
  }
}

import {
  getOpenAiSeoConfig,
  getOpenAiSeoResearchConfig,
  OPENAI_SEO_DRAFT_MAX_OUTPUT_TOKENS,
  type OpenAiSeoConfig,
} from "@/lib/cms/ai-seo/config";
import type { SeoResearchInventory } from "@/lib/cms/ai-seo/research-inventory";
import {
  normalizeSeoResearchResult,
  normalizeSeoResearchSources,
  SEO_RESEARCH_JSON_SCHEMA,
  SEO_RESEARCH_SYSTEM_INSTRUCTION,
  type SeoResearchResult,
} from "@/lib/cms/ai-seo/research-schemas";
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

export type OpenAiProviderErrorCode =
  | "not_configured"
  | "timeout"
  | "rate_limited"
  | "unavailable"
  | "invalid_response";

export type OpenAiProviderResult =
  | { ok: true; explanation: SeoExplainResult; model: string }
  | { ok: false; code: OpenAiProviderErrorCode; message: string };

export type OpenAiDraftProviderResult =
  | { ok: true; draft: SeoDraftResult; model: string }
  | { ok: false; code: OpenAiProviderErrorCode; message: string };

export type OpenAiResearchProviderResult =
  | { ok: true; research: SeoResearchResult; model: string }
  | { ok: false; code: OpenAiProviderErrorCode; message: string };

export type OpenAiFetch = typeof fetch;

function buildExplainUserPayload(finding: SeoExplainFindingInput) {
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

function buildDraftUserPayload(input: SeoDraftInput) {
  return {
    task: "draft_seo_title_meta",
    entity: {
      kind: input.entityKind,
      label: input.entityLabel,
      publicUrl: input.publicUrl,
      currentSeoTitle: input.currentTitle,
      currentMetaDescription: input.currentDescription,
      contentTitle: input.contentTitle || null,
      excerpt: input.excerpt || null,
      focusKeyword: input.focusKeyword || null,
      categoryName: input.categoryName || null,
      siteName: input.siteName || null,
      automaticTitleSuffix: input.titleSuffix || null,
      status: input.status || null,
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
  return buildStructuredRequestBody({
    config,
    schemaName: "sidhu_seo_explain",
    jsonSchema: SEO_EXPLAIN_JSON_SCHEMA,
    systemInstruction: SEO_EXPLAIN_SYSTEM_INSTRUCTION,
    userPayload: buildExplainUserPayload(finding),
    maxOutputTokens: config.maxOutputTokens,
  });
}

export function buildOpenAiDraftRequestBody(input: SeoDraftInput, config: OpenAiSeoConfig) {
  return buildStructuredRequestBody({
    config,
    schemaName: "sidhu_seo_draft",
    jsonSchema: SEO_DRAFT_JSON_SCHEMA,
    systemInstruction: SEO_DRAFT_SYSTEM_INSTRUCTION,
    userPayload: buildDraftUserPayload(input),
    maxOutputTokens: OPENAI_SEO_DRAFT_MAX_OUTPUT_TOKENS,
  });
}

function buildStructuredRequestBody(args: {
  config: OpenAiSeoConfig;
  schemaName: string;
  jsonSchema: object;
  systemInstruction: string;
  userPayload: unknown;
  maxOutputTokens: number;
}) {
  return {
    model: args.config.model,
    store: false,
    reasoning: { effort: "none" },
    max_output_tokens: args.maxOutputTokens,
    text: {
      format: {
        type: "json_schema",
        name: args.schemaName,
        strict: true,
        schema: args.jsonSchema,
      },
    },
    input: [
      {
        role: "developer",
        content: [{ type: "input_text", text: args.systemInstruction }],
      },
      {
        role: "user",
        content: [{ type: "input_text", text: JSON.stringify(args.userPayload) }],
      },
    ],
  };
}

async function requestOpenAiStructuredJson(args: {
  body: object;
  config: OpenAiSeoConfig;
  fetchImpl?: OpenAiFetch;
}): Promise<{ ok: true; json: unknown; model: string } | { ok: false; code: OpenAiProviderErrorCode; message: string }> {
  if (!args.config.configured || !args.config.apiKey) {
    return {
      ok: false,
      code: "not_configured",
      message: "Sidhu AI SEO Assistant is not configured yet.",
    };
  }

  const fetchImpl = args.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), args.config.timeoutMs);

  try {
    const response = await fetchImpl(args.config.endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${args.config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(args.body),
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

    try {
      return { ok: true, json: JSON.parse(text), model: args.config.model };
    } catch {
      return {
        ok: false,
        code: "invalid_response",
        message: "AI returned an unusable response. Please try again.",
      };
    }
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

export async function requestOpenAiSeoExplanation(
  finding: SeoExplainFindingInput,
  options?: {
    fetchImpl?: OpenAiFetch;
    config?: OpenAiSeoConfig;
  },
): Promise<OpenAiProviderResult> {
  const config = options?.config ?? getOpenAiSeoConfig();
  const result = await requestOpenAiStructuredJson({
    body: buildOpenAiExplainRequestBody(finding, config),
    config,
    fetchImpl: options?.fetchImpl,
  });
  if (!result.ok) return result;

  const explanation = normalizeSeoExplainResult(result.json);
  if (!explanation) {
    return {
      ok: false,
      code: "invalid_response",
      message: "AI returned an unusable response. Please try again.",
    };
  }
  return { ok: true, explanation, model: result.model };
}

export async function requestOpenAiSeoDraft(
  input: SeoDraftInput,
  options?: {
    fetchImpl?: OpenAiFetch;
    config?: OpenAiSeoConfig;
  },
): Promise<OpenAiDraftProviderResult> {
  const config = options?.config ?? getOpenAiSeoConfig();
  const result = await requestOpenAiStructuredJson({
    body: buildOpenAiDraftRequestBody(input, config),
    config,
    fetchImpl: options?.fetchImpl,
  });
  if (!result.ok) {
    // Draft-specific calm copy for non-explain tasks
    if (result.code === "unavailable") {
      return { ok: false, code: "unavailable", message: "AI drafting is temporarily unavailable." };
    }
    if (result.code === "timeout") {
      return { ok: false, code: "timeout", message: "AI drafting took too long. Please try again." };
    }
    return result;
  }

  const draft = normalizeSeoDraftResult(result.json);
  if (!draft) {
    return {
      ok: false,
      code: "invalid_response",
      message: "AI returned an unusable response. Please try again.",
    };
  }
  return { ok: true, draft, model: result.model };
}

function buildResearchUserPayload(inventory: SeoResearchInventory) {
  return {
    task: "uk_content_opportunity_research",
    market: "GB",
    siteName: inventory.siteName,
    guidance: [
      "Use live UK-relevant web research.",
      "Compare opportunities against the inventory before recommending NEW_BLOG.",
      "Prefer REFRESH_EXISTING or INTERNAL_LINK_ONLY when coverage already exists.",
      "Do not invent search volume, rankings, Google Trends, or GSC metrics.",
    ],
    inventory: inventory.items.map((item) => ({
      kind: item.kind,
      label: item.label,
      publicUrl: item.publicUrl,
      seoTitle: item.seoTitle || null,
      description: item.description || null,
      status: item.status || null,
      categoryName: item.categoryName || null,
    })),
  };
}

/** Build Responses body with required live web_search + structured opportunity output. */
export function buildOpenAiUkOpportunityResearchRequestBody(
  inventory: SeoResearchInventory,
  config: OpenAiSeoConfig,
) {
  return {
    model: config.model,
    store: false,
    max_output_tokens: config.maxOutputTokens,
    tools: [
      {
        type: "web_search",
        search_context_size: "medium",
        external_web_access: true,
        user_location: {
          type: "approximate",
          country: "GB",
        },
      },
    ],
    tool_choice: "required",
    include: ["web_search_call.action.sources"],
    text: {
      format: {
        type: "json_schema",
        name: "sidhu_seo_uk_opportunities",
        strict: true,
        schema: SEO_RESEARCH_JSON_SCHEMA,
      },
    },
    input: [
      {
        role: "developer",
        content: [{ type: "input_text", text: SEO_RESEARCH_SYSTEM_INSTRUCTION }],
      },
      {
        role: "user",
        content: [{ type: "input_text", text: JSON.stringify(buildResearchUserPayload(inventory)) }],
      },
    ],
  };
}

/** Collect consulted source URLs from web_search_call output items (and safe citation annotations). */
export function extractWebSearchSources(payload: unknown) {
  if (!payload || typeof payload !== "object") return normalizeSeoResearchSources([]);
  const root = payload as Record<string, unknown>;
  const collected: Array<{ title?: string; url?: string }> = [];
  const output = Array.isArray(root.output) ? root.output : [];

  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;

    if (row.type === "web_search_call") {
      const action = row.action && typeof row.action === "object" ? (row.action as Record<string, unknown>) : null;
      const sources = action && Array.isArray(action.sources) ? action.sources : [];
      for (const source of sources) {
        if (!source || typeof source !== "object") continue;
        const entry = source as Record<string, unknown>;
        collected.push({
          title: typeof entry.title === "string" ? entry.title : undefined,
          url: typeof entry.url === "string" ? entry.url : undefined,
        });
      }
    }

    const content = Array.isArray(row.content) ? row.content : [];
    for (const part of content) {
      if (!part || typeof part !== "object") continue;
      const block = part as Record<string, unknown>;
      const annotations = Array.isArray(block.annotations) ? block.annotations : [];
      for (const annotation of annotations) {
        if (!annotation || typeof annotation !== "object") continue;
        const note = annotation as Record<string, unknown>;
        if (note.type !== "url_citation") continue;
        collected.push({
          title: typeof note.title === "string" ? note.title : undefined,
          url: typeof note.url === "string" ? note.url : undefined,
        });
      }
    }
  }

  return normalizeSeoResearchSources(collected);
}

async function requestOpenAiStructuredJsonWithPayload(args: {
  body: object;
  config: OpenAiSeoConfig;
  fetchImpl?: OpenAiFetch;
  timeoutMessage: string;
  unavailableMessage: string;
}): Promise<
  | { ok: true; json: unknown; payload: unknown; model: string }
  | { ok: false; code: OpenAiProviderErrorCode; message: string }
> {
  if (!args.config.configured || !args.config.apiKey) {
    return {
      ok: false,
      code: "not_configured",
      message: "Sidhu AI SEO Assistant is not configured yet.",
    };
  }

  const fetchImpl = args.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), args.config.timeoutMs);

  try {
    const response = await fetchImpl(args.config.endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${args.config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(args.body),
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
        message: args.unavailableMessage,
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

    try {
      return { ok: true, json: JSON.parse(text), payload, model: args.config.model };
    } catch {
      return {
        ok: false,
        code: "invalid_response",
        message: "AI returned an unusable response. Please try again.",
      };
    }
  } catch (error) {
    if (error instanceof Error && (error.name === "AbortError" || /aborted/i.test(error.message))) {
      return {
        ok: false,
        code: "timeout",
        message: args.timeoutMessage,
      };
    }
    return {
      ok: false,
      code: "unavailable",
      message: args.unavailableMessage,
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function requestOpenAiUkOpportunityResearch(
  inventory: SeoResearchInventory,
  options?: {
    fetchImpl?: OpenAiFetch;
    config?: OpenAiSeoConfig;
  },
): Promise<OpenAiResearchProviderResult> {
  const config = options?.config ?? getOpenAiSeoResearchConfig();
  const result = await requestOpenAiStructuredJsonWithPayload({
    body: buildOpenAiUkOpportunityResearchRequestBody(inventory, config),
    config,
    fetchImpl: options?.fetchImpl,
    timeoutMessage: "UK opportunity research took too long. Please try again later.",
    unavailableMessage: "UK opportunity research is temporarily unavailable.",
  });
  if (!result.ok) return result;

  const allowlisted = new Set(inventory.allowlistedPublicUrls);
  const research = normalizeSeoResearchResult(result.json, allowlisted);
  if (!research) {
    return {
      ok: false,
      code: "invalid_response",
      message: "AI returned an unusable response. Please try again.",
    };
  }

  research.sources = extractWebSearchSources(result.payload);
  return { ok: true, research, model: result.model };
}

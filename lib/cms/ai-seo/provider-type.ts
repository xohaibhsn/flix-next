/** Shared Sidhu AI SEO provider identity. Safe for client + server imports (no secrets). */

export const SEO_AI_PROVIDERS = ["gemini", "openai"] as const;
export type SeoAiProvider = (typeof SEO_AI_PROVIDERS)[number];

export type SeoAiProviderAvailability = {
  openaiConfigured: boolean;
  geminiConfigured: boolean;
};

export function isSeoAiProvider(value: unknown): value is SeoAiProvider {
  return value === "gemini" || value === "openai";
}

export function seoAiProviderLabel(provider: SeoAiProvider): string {
  return provider === "gemini" ? "Gemini" : "OpenAI";
}

/** Keys the browser must never send (or that the server must reject). */
const FORBIDDEN_PROVIDER_REQUEST_KEYS = [
  "apiKey",
  "model",
  "endpoint",
  "configuration",
  "config",
  "authorization",
  "headers",
  "schema",
  "jsonSchema",
  "systemInstruction",
  "providerResponse",
  "rawResponse",
] as const;

export type ParseSeoAiProviderRequestResult =
  | { ok: true; provider: SeoAiProvider; payload: unknown }
  | { ok: false; error: string };

/**
 * Extract and validate an explicit provider from a browser action payload.
 * Provider config always comes from server env — never from the client.
 */
export function parseSeoAiProviderRequest(raw: unknown): ParseSeoAiProviderRequestResult {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, error: "Invalid AI request." };
  }
  const data = raw as Record<string, unknown>;
  for (const key of FORBIDDEN_PROVIDER_REQUEST_KEYS) {
    if (Object.prototype.hasOwnProperty.call(data, key)) {
      return { ok: false, error: "Unexpected AI request fields were rejected." };
    }
  }
  if (!isSeoAiProvider(data.provider)) {
    return { ok: false, error: "Choose Gemini or OpenAI." };
  }
  const payload = { ...data };
  delete payload.provider;
  return { ok: true, provider: data.provider, payload };
}

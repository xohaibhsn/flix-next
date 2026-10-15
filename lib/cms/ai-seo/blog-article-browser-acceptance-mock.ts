/**
 * Local A1.2-B browser-acceptance OpenAI transport mock.
 * Active only when SEO_AI_ARTICLE_BROWSER_ACCEPTANCE_MOCK=1 with a synthetic sk-test-* key.
 * Never calls the network. Disabled in production NODE_ENV.
 * A1.3-S: mismatched mock/live credentials fail closed before any HTTP.
 */

import { OPENAI_RESPONSES_ENDPOINT } from "@/lib/cms/ai-seo/config";
import type { OpenAiFetch, OpenAiProviderErrorCode } from "@/lib/cms/ai-seo/provider";

export const SEO_AI_ARTICLE_BROWSER_ACCEPTANCE_MOCK_ENV = "SEO_AI_ARTICLE_BROWSER_ACCEPTANCE_MOCK";
export const SEO_AI_ARTICLE_BROWSER_ACCEPTANCE_FIXTURE_ENV = "SEO_AI_ARTICLE_BROWSER_ACCEPTANCE_FIXTURE";
export const BROWSER_ACCEPTANCE_SYNTHETIC_KEY_PREFIX = "sk-test-";

/** Sanitized configuration errors — never include credential values. */
export const BLOG_ARTICLE_MOCK_ISOLATION_MESSAGES = {
  productionMock: "Article acceptance mock cannot run in production.",
  mockRequiresSynthetic: "Article acceptance mock requires a synthetic test credential.",
  syntheticWithoutMock: "Synthetic test credentials cannot call the live article provider.",
} as const;

export const BROWSER_ACCEPTANCE_SAFE_ARTICLE = {
  title: "Fix UK IPTV buffering without guesswork",
  excerpt: "A practical UK checklist to isolate home-network buffering causes.",
  html: "<h2>Start with the local network</h2><p>Check whether other devices on the same Wi-Fi also struggle during peak evening hours before changing service settings.</p><h3>Useful next checks</h3><ul><li>Restart the router after noting current symptoms.</li><li>Try a wired connection if available.</li></ul>",
} as const;

export const BROWSER_ACCEPTANCE_UNSAFE_ARTICLE = {
  title: "Unsafe fixture must not persist",
  excerpt: "This fixture intentionally includes a script attempt that validation must reject.",
  html: '<h2>Unsafe</h2><p>Body long enough for meaningful html checks during rejection testing of script tags.</p><script>window.__a12b_xss=1</script><img src=x onerror="alert(1)">',
} as const;

const EXTERNAL_AI_HOST_PATTERN =
  /(?:^|\.)openai\.com|(?:^|\.)anthropic\.com|(?:^|\.)googleapis\.com|(?:^|\.)generativelanguage\.|api\.openai/i;

type MockState = {
  requestCount: number;
  externalBlockedCount: number;
  lastUrl: string | null;
};

const state: MockState = {
  requestCount: 0,
  externalBlockedCount: 0,
  lastUrl: null,
};

export function resetBrowserAcceptanceMockState() {
  state.requestCount = 0;
  state.externalBlockedCount = 0;
  state.lastUrl = null;
}

export function getBrowserAcceptanceMockState(): Readonly<MockState> {
  return { ...state };
}

export function isSyntheticBrowserAcceptanceKey(apiKey: string): boolean {
  return String(apiKey || "").trim().startsWith(BROWSER_ACCEPTANCE_SYNTHETIC_KEY_PREFIX);
}

export function isBrowserAcceptanceMockEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.NODE_ENV === "production") return false;
  if (String(env[SEO_AI_ARTICLE_BROWSER_ACCEPTANCE_MOCK_ENV] || "").trim() !== "1") return false;
  const key = String(env.OPENAI_API_KEY || "").trim();
  if (!isSyntheticBrowserAcceptanceKey(key)) return false;
  return true;
}

export type BlogArticleMockIsolationResult =
  | { ok: true; fetchImpl: OpenAiFetch | undefined }
  | { ok: false; code: Extract<OpenAiProviderErrorCode, "not_configured">; message: string };

/**
 * Fail-closed mock/live isolation for article generation.
 * Rejects inconsistent mock+credential combinations before any network call.
 * Explicit test `fetchImpl` may use a synthetic key only when mock mode is OFF
 * (injected fake HTTP — never the global fetch / live OpenAI endpoint).
 */
export function evaluateBlogArticleMockIsolation(args: {
  apiKey: string;
  explicitFetch?: OpenAiFetch;
  env?: NodeJS.ProcessEnv;
}): BlogArticleMockIsolationResult {
  const env = args.env ?? process.env;
  const mockFlag = String(env[SEO_AI_ARTICLE_BROWSER_ACCEPTANCE_MOCK_ENV] || "").trim() === "1";
  const isProduction = env.NODE_ENV === "production";
  const isSynthetic = isSyntheticBrowserAcceptanceKey(args.apiKey);
  const hasExplicit = typeof args.explicitFetch === "function";

  if (mockFlag) {
    if (isProduction) {
      return {
        ok: false,
        code: "not_configured",
        message: BLOG_ARTICLE_MOCK_ISOLATION_MESSAGES.productionMock,
      };
    }
    if (!isSynthetic) {
      return {
        ok: false,
        code: "not_configured",
        message: BLOG_ARTICLE_MOCK_ISOLATION_MESSAGES.mockRequiresSynthetic,
      };
    }
    return { ok: true, fetchImpl: args.explicitFetch ?? browserAcceptanceMockFetch };
  }

  if (isSynthetic && !hasExplicit) {
    return {
      ok: false,
      code: "not_configured",
      message: BLOG_ARTICLE_MOCK_ISOLATION_MESSAGES.syntheticWithoutMock,
    };
  }

  return { ok: true, fetchImpl: args.explicitFetch };
}

function fixtureMode(env: NodeJS.ProcessEnv = process.env): "safe" | "unsafe" | "fail" {
  const raw = String(env[SEO_AI_ARTICLE_BROWSER_ACCEPTANCE_FIXTURE_ENV] || "safe")
    .trim()
    .toLowerCase();
  if (raw === "unsafe" || raw === "fail") return raw;
  return "safe";
}

function openaiSuccessPayload(json: unknown) {
  return {
    output: [
      {
        type: "message",
        content: [{ type: "output_text", text: JSON.stringify(json) }],
      },
    ],
  };
}

function resolveUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return String((input as Request).url || "");
}

/**
 * Deterministic fetch replacement for local browser acceptance only.
 * Throws if the caller attempts any real external AI host.
 */
export const browserAcceptanceMockFetch: OpenAiFetch = async (input, init) => {
  const url = resolveUrl(input);
  state.lastUrl = url;
  state.requestCount += 1;

  let parsedHost = "";
  try {
    parsedHost = new URL(url).host;
  } catch {
    parsedHost = "";
  }

  const isApprovedEndpoint = url === OPENAI_RESPONSES_ENDPOINT;
  const looksExternalAi = EXTERNAL_AI_HOST_PATTERN.test(url) || EXTERNAL_AI_HOST_PATTERN.test(parsedHost);

  if (!isApprovedEndpoint) {
    if (looksExternalAi) {
      state.externalBlockedCount += 1;
      throw new Error(
        `A1.2-B mock blocked external AI request (#${state.externalBlockedCount}): ${url}`,
      );
    }
    throw new Error(`A1.2-B mock rejected unexpected URL: ${url}`);
  }

  // Approved endpoint is answered locally — never forward to the network.
  const mode = fixtureMode();
  if (mode === "fail") {
    return new Response(JSON.stringify({ error: { message: "synthetic provider failure" } }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  }

  const article = mode === "unsafe" ? BROWSER_ACCEPTANCE_UNSAFE_ARTICLE : BROWSER_ACCEPTANCE_SAFE_ARTICLE;
  void init;
  return new Response(JSON.stringify(openaiSuccessPayload(article)), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};

/**
 * Soft resolver for unit tests / diagnostics.
 * Prefer `evaluateBlogArticleMockIsolation` on the article request path —
 * mismatched mock/live configs must fail closed there, not silently fall through to live fetch.
 */
export function resolveBlogArticleFetchImpl(
  explicit?: OpenAiFetch,
  env: NodeJS.ProcessEnv = process.env,
): OpenAiFetch | undefined {
  if (explicit) return explicit;
  if (isBrowserAcceptanceMockEnabled(env)) return browserAcceptanceMockFetch;
  return undefined;
}

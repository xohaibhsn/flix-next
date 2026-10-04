/**
 * Server-only Google service-account token acquisition for Search Console.
 * Uses google-auth-library for JWT/token mechanics. Never import from client components.
 */

import "server-only";

import { JWT } from "google-auth-library";
import { getGscConfig, type GscConfig } from "@/lib/cms/gsc/config";
import {
  GSC_READONLY_SCOPE,
  type GscFailure,
  type GscResult,
} from "@/lib/cms/gsc/types";

export type GscJwtFactory = (args: {
  clientEmail: string;
  privateKey: string;
  scopes: string[];
}) => {
  getAccessToken: () => Promise<{ token?: string | null } | string | null | undefined>;
};

const defaultJwtFactory: GscJwtFactory = (args) =>
  new JWT({
    email: args.clientEmail,
    key: args.privateKey,
    scopes: args.scopes,
  });

function authFailure(message = "Google Search Console authentication failed."): GscFailure {
  return { ok: false, code: "AUTH_FAILED", message };
}

/**
 * Obtain a short-lived access token for webmasters.readonly.
 * Tokens stay in process memory via the auth library — never persisted or returned to clients.
 */
export async function getGscAccessToken(options?: {
  config?: GscConfig;
  createJwt?: GscJwtFactory;
  timeoutMs?: number;
}): Promise<GscResult<string>> {
  const config = options?.config ?? getGscConfig();
  if (!config.configured) {
    return {
      ok: false,
      code: "NOT_CONFIGURED",
      message: "Google Search Console is not configured yet.",
    };
  }

  const createJwt = options?.createJwt ?? defaultJwtFactory;
  const timeoutMs = options?.timeoutMs ?? config.timeoutMs;

  try {
    // Optional GSC_PROJECT_ID is config metadata only; JWT uses email + key + readonly scope.
    const client = createJwt({
      clientEmail: config.clientEmail,
      privateKey: config.privateKey,
      scopes: [GSC_READONLY_SCOPE],
    });

    const tokenPromise = Promise.resolve(client.getAccessToken()).then((result) => {
      if (typeof result === "string") return result;
      if (result && typeof result === "object" && "token" in result) {
        return result.token || "";
      }
      return "";
    });

    const token = await Promise.race([
      tokenPromise,
      new Promise<string>((_, reject) => {
        setTimeout(() => reject(Object.assign(new Error("timeout"), { name: "AbortError" })), timeoutMs);
      }),
    ]);

    if (!token || typeof token !== "string") {
      return authFailure();
    }

    return { ok: true, value: token };
  } catch (error) {
    if (error instanceof Error && (error.name === "AbortError" || /timeout/i.test(error.message))) {
      return {
        ok: false,
        code: "TIMEOUT",
        message: "Google Search Console authentication timed out.",
      };
    }
    return authFailure();
  }
}

export const GSC_AUTH_SCOPE = GSC_READONLY_SCOPE;

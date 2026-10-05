/**
 * Server-only GSC configuration loader.
 * Never import from client components. Never log or return private-key material.
 */

import type { GscConfigStatus } from "@/lib/cms/gsc/types";

export const GSC_TIMEOUT_MS = 15_000;
export const GSC_MAX_ROW_LIMIT = 1_000;

export type GscConfig = {
  configured: boolean;
  siteUrl: string;
  clientEmail: string;
  privateKey: string;
  projectId: string;
  timeoutMs: number;
};

function trimEnv(value: string | undefined) {
  return String(value ?? "").trim();
}

/**
 * Hostinger / panel env often stores PEM with literal `\n` escape sequences.
 * Normalize to real newlines server-side only. Never log the result.
 */
export function normalizeGscPrivateKey(raw: string) {
  let key = String(raw ?? "").trim();
  if (
    (key.startsWith('"') && key.endsWith('"')) ||
    (key.startsWith("'") && key.endsWith("'"))
  ) {
    key = key.slice(1, -1);
  }
  return key.replace(/\\n/g, "\n");
}

/**
 * Validate opaque Search Console property identifiers.
 * Accepts domain properties (`sc-domain:example.com`) and URL-prefix (`https://example.com/`).
 * Does not hard-code production hostnames.
 */
export function isValidGscSiteUrl(value: string) {
  const siteUrl = trimEnv(value);
  if (!siteUrl || siteUrl.length > 300) return false;

  if (siteUrl.startsWith("sc-domain:")) {
    const domain = siteUrl.slice("sc-domain:".length).trim().toLowerCase();
    if (!domain || domain.includes("/") || domain.includes(" ") || domain.includes("\\")) {
      return false;
    }
    // Basic hostname: labels with dots, no protocol/schemes.
    return /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/.test(domain);
  }

  try {
    const url = new URL(siteUrl);
    if (url.protocol !== "https:" && url.protocol !== "http:") return false;
    if (!url.hostname || url.username || url.password) return false;
    if (url.hash) return false;
    return true;
  } catch {
    return false;
  }
}

export type GscEnv = Record<string, string | undefined>;

/** Safe boolean-only config diagnostics. Never includes env values. */
export type GscConfigDiagnostics = {
  siteUrlPresent: boolean;
  siteUrlValid: boolean;
  clientEmailPresent: boolean;
  clientEmailValid: boolean;
  privateKeyPresent: boolean;
  privateKeyLooksPem: boolean;
  projectIdPresent: boolean;
};

/**
 * Boolean diagnostics for GSC env presence/shape.
 * Uses the same normalization/validation as isGscConfigured().
 * Never returns credential values.
 */
export function getGscConfigDiagnostics(env: GscEnv = process.env): GscConfigDiagnostics {
  const siteUrl = trimEnv(env.GSC_SITE_URL);
  const clientEmail = trimEnv(env.GSC_CLIENT_EMAIL);
  const privateKeyRaw = trimEnv(env.GSC_PRIVATE_KEY);
  const privateKey = normalizeGscPrivateKey(privateKeyRaw);
  const projectId = trimEnv(env.GSC_PROJECT_ID);

  return {
    siteUrlPresent: Boolean(siteUrl),
    siteUrlValid: isValidGscSiteUrl(siteUrl),
    clientEmailPresent: Boolean(clientEmail),
    clientEmailValid: clientEmail.includes("@"),
    privateKeyPresent: Boolean(privateKeyRaw),
    privateKeyLooksPem: privateKey.includes("PRIVATE KEY"),
    projectIdPresent: Boolean(projectId),
  };
}

export function isGscConfigured(env: GscEnv = process.env) {
  const d = getGscConfigDiagnostics(env);
  return Boolean(
    d.siteUrlPresent &&
      d.siteUrlValid &&
      d.clientEmailPresent &&
      d.clientEmailValid &&
      d.privateKeyPresent &&
      d.privateKeyLooksPem,
  );
}

/** Safe client-facing status — never includes credentials or property URL. */
export function getGscConfigStatus(env: GscEnv = process.env): GscConfigStatus {
  return { configured: isGscConfigured(env) };
}

/**
 * Full server config. Callers must keep this server-side only.
 * Returns configured:false without throwing when env is incomplete/invalid.
 */
export function getGscConfig(env: GscEnv = process.env): GscConfig {
  const siteUrl = trimEnv(env.GSC_SITE_URL);
  const clientEmail = trimEnv(env.GSC_CLIENT_EMAIL);
  const privateKey = normalizeGscPrivateKey(trimEnv(env.GSC_PRIVATE_KEY));
  const projectId = trimEnv(env.GSC_PROJECT_ID);
  const configured = isGscConfigured(env);

  return {
    configured,
    siteUrl: configured ? siteUrl : "",
    clientEmail: configured ? clientEmail : "",
    privateKey: configured ? privateKey : "",
    projectId: configured ? projectId : "",
    timeoutMs: GSC_TIMEOUT_MS,
  };
}

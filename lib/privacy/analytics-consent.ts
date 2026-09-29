/** First-party analytics preference cookie (not HttpOnly — client UI must update it). */
export const ANALYTICS_CONSENT_COOKIE = "flix_analytics_consent";
export const ANALYTICS_CONSENT_GRANTED = "granted";
export const ANALYTICS_CONSENT_DENIED = "denied";
export const ANALYTICS_CONSENT_MAX_AGE_SECONDS = 180 * 24 * 60 * 60;

export type AnalyticsConsentValue = "granted" | "denied" | "undecided";

export function parseAnalyticsConsent(value: string | undefined | null): AnalyticsConsentValue {
  if (value === ANALYTICS_CONSENT_GRANTED) return "granted";
  if (value === ANALYTICS_CONSENT_DENIED) return "denied";
  return "undecided";
}

export function isAnalyticsConsentGranted(value: string | undefined | null): boolean {
  return value === ANALYTICS_CONSENT_GRANTED;
}

export function isGaCookieName(name: string): boolean {
  return name === "_ga" || name.startsWith("_ga_");
}

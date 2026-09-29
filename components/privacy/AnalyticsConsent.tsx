"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ANALYTICS_CONSENT_COOKIE,
  ANALYTICS_CONSENT_DENIED,
  ANALYTICS_CONSENT_GRANTED,
  ANALYTICS_CONSENT_MAX_AGE_SECONDS,
  isGaCookieName,
  type AnalyticsConsentValue,
} from "@/lib/privacy/analytics-consent";

function preferenceCookie(value: typeof ANALYTICS_CONSENT_GRANTED | typeof ANALYTICS_CONSENT_DENIED) {
  const secure = typeof window !== "undefined" && window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${ANALYTICS_CONSENT_COOKIE}=${value}; Path=/; Max-Age=${ANALYTICS_CONSENT_MAX_AGE_SECONDS}; SameSite=Lax${secure}`;
}

function cookieDomains(): string[] {
  const host = window.location.hostname;
  const domains = ["", host];
  if (host !== "localhost" && !/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
    const parts = host.split(".");
    if (parts.length >= 2) {
      domains.push(`.${parts.slice(-2).join(".")}`);
      if (parts.length > 2) domains.push(`.${host}`);
    }
  }
  return [...new Set(domains)];
}

/** Best-effort clear of accessible first-party GA cookies only. */
export function clearAccessibleGaCookies() {
  if (typeof document === "undefined") return;
  const names = document.cookie
    .split(";")
    .map((part) => part.split("=")[0]?.trim() || "")
    .filter((name) => isGaCookieName(name));
  const domains = cookieDomains();
  for (const name of names) {
    for (const domain of domains) {
      const domainPart = domain ? `; Domain=${domain}` : "";
      document.cookie = `${name}=; Path=/; Max-Age=0${domainPart}`;
    }
  }
}

export function AnalyticsConsent({ initialConsent }: { initialConsent: AnalyticsConsentValue }) {
  const [consent, setConsent] = useState<AnalyticsConsentValue>(initialConsent);
  const [panelOpen, setPanelOpen] = useState(initialConsent === "undecided");

  useEffect(() => {
    if (consent !== "granted") {
      clearAccessibleGaCookies();
    }
  }, [consent]);

  function accept() {
    preferenceCookie(ANALYTICS_CONSENT_GRANTED);
    setConsent("granted");
    window.location.reload();
  }

  function reject() {
    preferenceCookie(ANALYTICS_CONSENT_DENIED);
    clearAccessibleGaCookies();
    setConsent("denied");
    window.location.reload();
  }

  const showBanner = panelOpen;

  return (
    <>
      {showBanner ? (
        <div
          className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-white/95 p-4 shadow-[0_-8px_30px_rgba(0,0,0,0.12)] backdrop-blur-sm sm:p-5"
          role="region"
          aria-labelledby="analytics-consent-heading"
        >
          <div className="mx-auto flex max-w-6xl flex-col gap-4 pr-0 sm:flex-row sm:items-end sm:justify-between sm:pr-28 lg:px-8">
            <div className="max-w-2xl">
              <h2 id="analytics-consent-heading" className="text-sm font-bold text-ink">
                Analytics cookies
              </h2>
              <p className="mt-1 text-sm leading-relaxed text-muted">
                We use Google Analytics to understand how the website is used. Analytics is optional.{" "}
                <Link href="/cookie-policy/" className="font-medium text-ink underline underline-offset-2 hover:text-brand">
                  Cookie Policy
                </Link>
              </p>
              {consent !== "undecided" ? (
                <p className="mt-2 text-xs text-muted">
                  Current choice: {consent === "granted" ? "analytics accepted" : "analytics rejected"}.
                </p>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={reject}
                className="rounded-md border border-line bg-white px-4 py-2.5 text-sm font-semibold text-ink hover:bg-paper focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
              >
                Reject analytics
              </button>
              <button
                type="button"
                onClick={accept}
                className="rounded-md border border-line bg-ink px-4 py-2.5 text-sm font-semibold text-white hover:bg-ink/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
              >
                Accept analytics
              </button>
              {consent !== "undecided" ? (
                <button
                  type="button"
                  onClick={() => setPanelOpen(false)}
                  className="rounded-md px-3 py-2.5 text-sm font-medium text-muted underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                >
                  Close
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {!showBanner ? (
        <button
          type="button"
          onClick={() => setPanelOpen(true)}
          className="fixed bottom-5 left-5 z-40 rounded-md border border-line bg-white/95 px-3 py-2 text-xs font-semibold text-ink shadow-sm backdrop-blur-sm hover:bg-paper focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          Cookie settings
        </button>
      ) : null}
    </>
  );
}

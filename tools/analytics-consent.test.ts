import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import {
  filterHeadNodesForAnalytics,
  isGoogleAnalyticsHeadNode,
  parseHeadCode,
} from "../lib/cms/head-code";
import {
  ANALYTICS_CONSENT_COOKIE,
  ANALYTICS_CONSENT_DENIED,
  ANALYTICS_CONSENT_GRANTED,
  ANALYTICS_CONSENT_MAX_AGE_SECONDS,
  isAnalyticsConsentGranted,
  isGaCookieName,
  parseAnalyticsConsent,
} from "../lib/privacy/analytics-consent";

const root = process.cwd();
const read = (rel: string) => readFileSync(path.join(root, rel), "utf8");

const GA_HTML = `
<meta name="google-site-verification" content="HSyoq3vF15puMrchRkJQivdt9E2ZssygshsYJk4o6IA">
<script async src="https://www.googletagmanager.com/gtag/js?id=G-TKB3PJ9FT3"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'G-TKB3PJ9FT3');
</script>
<script src="https://example.com/widget.js"></script>
`;

test("analytics consent cookie constants are stable", () => {
  assert.equal(ANALYTICS_CONSENT_COOKIE, "flix_analytics_consent");
  assert.equal(ANALYTICS_CONSENT_GRANTED, "granted");
  assert.equal(ANALYTICS_CONSENT_DENIED, "denied");
  assert.equal(ANALYTICS_CONSENT_MAX_AGE_SECONDS, 180 * 24 * 60 * 60);
});

test("server grants analytics only for exact granted cookie value", () => {
  assert.equal(isAnalyticsConsentGranted("granted"), true);
  assert.equal(isAnalyticsConsentGranted("denied"), false);
  assert.equal(isAnalyticsConsentGranted(undefined), false);
  assert.equal(isAnalyticsConsentGranted(""), false);
  assert.equal(isAnalyticsConsentGranted("yes"), false);
  assert.equal(parseAnalyticsConsent(undefined), "undecided");
  assert.equal(parseAnalyticsConsent("denied"), "denied");
  assert.equal(parseAnalyticsConsent("granted"), "granted");
});

test("GA external gtag loader is classified as analytics", () => {
  const nodes = parseHeadCode(
    `<script async src="https://www.googletagmanager.com/gtag/js?id=G-TKB3PJ9FT3"></script>`,
  );
  assert.equal(nodes.length, 1);
  assert.equal(isGoogleAnalyticsHeadNode(nodes[0]!), true);
});

test("GA inline dataLayer/gtag config is classified as analytics", () => {
  const nodes = parseHeadCode(`<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'G-AAAA1111');
</script>`);
  assert.equal(nodes.length, 1);
  assert.equal(isGoogleAnalyticsHeadNode(nodes[0]!), true);
});

test("google-site-verification meta is not analytics", () => {
  const nodes = parseHeadCode(
    `<meta name="google-site-verification" content="token-value">`,
  );
  assert.equal(nodes.length, 1);
  assert.equal(isGoogleAnalyticsHeadNode(nodes[0]!), false);
});

test("unrelated script is not analytics", () => {
  const nodes = parseHeadCode(`<script src="https://example.com/widget.js"></script>`);
  assert.equal(nodes.length, 1);
  assert.equal(isGoogleAnalyticsHeadNode(nodes[0]!), false);
});

test("filter omits GA when analyticsAllowed is false and keeps verification", () => {
  const all = parseHeadCode(GA_HTML);
  const filtered = filterHeadNodesForAnalytics(all, false);
  assert.equal(filtered.some((n) => isGoogleAnalyticsHeadNode(n)), false);
  assert.ok(
    filtered.some(
      (n) => n.kind === "meta" && n.attrs.name === "google-site-verification",
    ),
  );
  assert.ok(
    filtered.some((n) => n.kind === "script" && n.attrs.src?.includes("example.com")),
  );
});

test("filter keeps GA when analyticsAllowed is true", () => {
  const all = parseHeadCode(GA_HTML);
  const filtered = filterHeadNodesForAnalytics(all, true);
  assert.equal(filtered.length, all.length);
  assert.equal(filtered.filter((n) => isGoogleAnalyticsHeadNode(n)).length, 2);
});

test("CustomHeadCode and SiteShell wire analyticsAllowed from granted cookie only", () => {
  const head = read("components/seo/CustomHeadCode.tsx");
  const shell = read("components/layout/SiteShell.tsx");
  assert.match(head, /analyticsAllowed/);
  assert.match(head, /filterHeadNodesForAnalytics/);
  assert.match(shell, /ANALYTICS_CONSENT_COOKIE/);
  assert.match(shell, /isAnalyticsConsentGranted/);
  assert.match(shell, /analyticsAllowed=\{analyticsAllowed\}/);
  assert.match(shell, /AnalyticsConsent/);
  assert.doesNotMatch(shell, /gtag\(\s*["']consent["']/);
});

test("preference UI exposes accept reject policy and cookie settings", () => {
  const ui = read("components/privacy/AnalyticsConsent.tsx");
  assert.match(ui, /Accept analytics/);
  assert.match(ui, /Reject analytics/);
  assert.match(ui, /Cookie Policy/);
  assert.match(ui, /Cookie settings/);
  assert.match(ui, /\/cookie-policy\//);
  assert.match(ui, /clearAccessibleGaCookies/);
  assert.doesNotMatch(ui, /analytics_storage|ad_storage|consent\",\s*\"default|consent\",\s*\"update/);
});

test("GA cookie cleanup targets _ga / _ga_* only", () => {
  assert.equal(isGaCookieName("_ga"), true);
  assert.equal(isGaCookieName("_ga_TKB3PJ9FT3"), true);
  assert.equal(isGaCookieName("flix_analytics_consent"), false);
  assert.equal(isGaCookieName("sidhu_session"), false);
  const ui = read("components/privacy/AnalyticsConsent.tsx");
  assert.match(ui, /isGaCookieName/);
  assert.doesNotMatch(ui, /sidhu_session/);
});

test("no Consent Mode APIs added in A2", () => {
  const files = [
    read("lib/cms/head-code.ts"),
    read("components/seo/CustomHeadCode.tsx"),
    read("components/layout/SiteShell.tsx"),
    read("components/privacy/AnalyticsConsent.tsx"),
    read("lib/privacy/analytics-consent.ts"),
  ].join("\n");
  assert.doesNotMatch(files, /analytics_storage|ad_storage|ad_user_data|ad_personalization/);
  assert.doesNotMatch(files, /gtag\(\s*["']consent["']/);
});

test("C1 public cache remains unchanged and Sidhu has no consent UI", () => {
  const cache = read("lib/cms/public-request-cache.ts");
  assert.doesNotMatch(cache, /analytics|consent|CustomHeadCode/);
  const adminShell = read("components/sidhu/AdminShell.tsx");
  assert.doesNotMatch(adminShell, /AnalyticsConsent/);
  const sidhuLayout = read("app/sidhu/(protected)/layout.tsx");
  assert.doesNotMatch(sidhuLayout, /AnalyticsConsent|SiteShell/);
});

test("source Cookie Policy mentions optional Google Analytics and Cookie Settings", () => {
  const src = read("lib/cms/company-pages.ts");
  assert.match(src, /Google Analytics/);
  assert.match(src, /Analytics is optional/);
  assert.match(src, /Cookie Settings/);
  assert.doesNotMatch(src, /There is no separate Flix IPTV cookie dashboard/);
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import {
  APEX_ORIGIN,
  isProductionWwwHost,
  normalizeHostname,
  wwwToApexRedirectUrl,
} from "../lib/www-host-canonical";

test("www root → 301 apex root URL", () => {
  assert.equal(
    wwwToApexRedirectUrl({ hostname: "www.theflixiptv.com", pathname: "/", search: "" }),
    `${APEX_ORIGIN}/`,
  );
});

test("www /welcome/ → apex /welcome/", () => {
  assert.equal(
    wwwToApexRedirectUrl({ hostname: "www.theflixiptv.com", pathname: "/welcome/", search: "" }),
    `${APEX_ORIGIN}/welcome/`,
  );
});

test("www deep path preserves path", () => {
  assert.equal(
    wwwToApexRedirectUrl({
      hostname: "www.theflixiptv.com",
      pathname: "/blogs/how-to-watch-iptv-on-firestick/",
      search: "",
    }),
    `${APEX_ORIGIN}/blogs/how-to-watch-iptv-on-firestick/`,
  );
});

test("www query string is preserved", () => {
  assert.equal(
    wwwToApexRedirectUrl({
      hostname: "www.theflixiptv.com",
      pathname: "/contact/",
      search: "?source=test",
    }),
    `${APEX_ORIGIN}/contact/?source=test`,
  );
  assert.equal(
    wwwToApexRedirectUrl({
      hostname: "www.theflixiptv.com",
      pathname: "/blogs/example/",
      search: "?a=1&b=2",
    }),
    `${APEX_ORIGIN}/blogs/example/?a=1&b=2`,
  );
});

test("www subscription legacy source: host-only first hop, path unchanged", () => {
  assert.equal(
    wwwToApexRedirectUrl({
      hostname: "www.theflixiptv.com",
      pathname: "/iptv-subscriptions-uk/",
      search: "",
    }),
    `${APEX_ORIGIN}/iptv-subscriptions-uk/`,
  );
});

test("www legacy blog source: host-only first hop, path unchanged", () => {
  assert.equal(
    wwwToApexRedirectUrl({
      hostname: "www.theflixiptv.com",
      pathname: "/blog/how-to-watch-iptv-on-firestick/",
      search: "",
    }),
    `${APEX_ORIGIN}/blog/how-to-watch-iptv-on-firestick/`,
  );
});

test("apex request is not canonicalized", () => {
  assert.equal(
    wwwToApexRedirectUrl({ hostname: "theflixiptv.com", pathname: "/welcome/", search: "" }),
    null,
  );
});

test("localhost is untouched", () => {
  assert.equal(wwwToApexRedirectUrl({ hostname: "localhost", pathname: "/", search: "" }), null);
  assert.equal(wwwToApexRedirectUrl({ hostname: "127.0.0.1", pathname: "/", search: "" }), null);
});

test("preview/staging hostname is untouched", () => {
  assert.equal(
    wwwToApexRedirectUrl({ hostname: "flix-next.vercel.app", pathname: "/welcome/", search: "" }),
    null,
  );
  assert.equal(
    wwwToApexRedirectUrl({ hostname: "staging.theflixiptv.com", pathname: "/", search: "" }),
    null,
  );
  assert.equal(
    wwwToApexRedirectUrl({ hostname: "preview.hostinger.com", pathname: "/", search: "" }),
    null,
  );
});

test("mixed-case Host is normalized", () => {
  assert.equal(isProductionWwwHost("WWW.TheFlixIPTV.com"), true);
  assert.equal(
    wwwToApexRedirectUrl({ hostname: "WWW.TheFlixIPTV.com", pathname: "/blogs/", search: "" }),
    `${APEX_ORIGIN}/blogs/`,
  );
});

test("host with port is recognized safely", () => {
  assert.equal(normalizeHostname("www.theflixiptv.com:443"), "www.theflixiptv.com");
  assert.equal(isProductionWwwHost("www.theflixiptv.com:443"), true);
  assert.equal(
    wwwToApexRedirectUrl({
      hostname: "www.theflixiptv.com:443",
      pathname: "/sitemap.xml",
      search: "",
    }),
    `${APEX_ORIGIN}/sitemap.xml`,
  );
  assert.equal(isProductionWwwHost("theflixiptv.com:443"), false);
});

test("proxy exits on www before CMS redirect DB lookup", () => {
  const proxySource = readFileSync(path.join(process.cwd(), "proxy.ts"), "utf8");
  const fnStart = proxySource.indexOf("export async function proxy");
  assert.ok(fnStart > 0, "proxy function must exist");
  const body = proxySource.slice(fnStart);

  const wwwCall = body.indexOf("wwwToApexRedirectUrl({ hostname, pathname, search })");
  const apexRedirect = body.indexOf("NextResponse.redirect(apexTarget, 301)");
  const cmsCall = body.indexOf("cmsRedirect(request)");
  const sessionCall = body.indexOf("resolveAdminFromToken(");
  const legacyCall = body.indexOf("isLegacyBlogPostPath(pathname)");

  assert.ok(wwwCall >= 0, "www helper must be invoked in proxy body");
  assert.ok(apexRedirect > wwwCall, "301 apex redirect must follow www check");
  assert.ok(cmsCall > apexRedirect, "cmsRedirect call must come after www early exit");
  assert.ok(sessionCall > apexRedirect, "Sidhu session resolve must come after www early exit");
  assert.ok(legacyCall > apexRedirect, "legacy blog redirect must come after www early exit");
  assert.match(proxySource, /getActiveRedirectBySourcePath\(/);
  assert.equal(proxySource.includes("listActiveRedirects("), false);
});
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { iconTypeFromUrl, siteIconMetadata, versionedMediaUrl } from "../lib/cms/favicon";
import { defaultSettings } from "../lib/cms/defaults";

test("metadata icons use Cloudinary URL directly when CMS favicon is set", () => {
  const settings = defaultSettings();
  settings.branding.favicon = {
    id: "media-favicon",
    publicId: "flix/favicon",
    secureUrl: "https://res.cloudinary.com/dehknghwm/image/upload/v1/flix/favicon.png",
  };
  const icons = siteIconMetadata(settings) as { icon: Array<{ url: string }> };
  const urls = icons.icon.map((item) => item.url);
  assert.equal(urls.length, 1);
  assert.match(urls[0]!, /^https:\/\/res\.cloudinary\.com\//);
  assert.match(urls[0]!, /v=media-favicon/);
  assert.equal(urls.some((url) => url.includes("/icon")), false);
});

test("metadata falls back to public favicon.svg when CMS favicon missing", () => {
  const settings = defaultSettings();
  settings.branding.favicon = null;
  const icons = siteIconMetadata(settings) as { icon: Array<{ url: string }> };
  const urls = icons.icon.map((item) => item.url);
  assert.deepEqual(urls, ["/favicon.svg"]);
});

test("versionedMediaUrl preserves Cloudinary public identity", () => {
  const url = versionedMediaUrl({
    id: "abc",
    publicId: "flix/favicon",
    secureUrl: "https://res.cloudinary.com/dehknghwm/image/upload/v1/flix/favicon.png",
  });
  assert.match(url, /flix\/favicon\.png/);
  assert.match(url, /[?&]v=abc/);
  assert.equal(iconTypeFromUrl(url), "image/png");
});

test("favicon response redirects to Cloudinary and does not proxy bytes", () => {
  const file = readFileSync(path.join(process.cwd(), "lib/cms/favicon-response.ts"), "utf8");
  assert.match(file, /NextResponse\.redirect/);
  assert.equal(file.includes("arrayBuffer"), false);
  assert.equal(file.includes('fetch(favicon.secureUrl'), false);
  assert.match(file, /public\/favicon\.svg/);
});

test("/favicon.ico and /icon routes stay available with revalidate", () => {
  const icon = readFileSync(path.join(process.cwd(), "app/icon/route.ts"), "utf8");
  const favicon = readFileSync(path.join(process.cwd(), "app/favicon.ico/route.ts"), "utf8");
  assert.match(icon, /serveSiteFavicon/);
  assert.match(favicon, /serveSiteFavicon/);
  assert.match(icon, /export const revalidate/);
  assert.match(favicon, /export const revalidate/);
  assert.equal(icon.includes('dynamic = "force-dynamic"'), false);
  assert.equal(favicon.includes('dynamic = "force-dynamic"'), false);
});

test("next.config still maps /favicon.ico without CMS redirect tables", () => {
  const config = readFileSync(path.join(process.cwd(), "next.config.ts"), "utf8");
  assert.match(config, /source:\s*"\/favicon\.ico"/);
  assert.match(config, /destination:\s*"\/icon"/);
  const proxy = readFileSync(path.join(process.cwd(), "proxy.ts"), "utf8");
  assert.match(proxy, /favicon\.ico/);
});

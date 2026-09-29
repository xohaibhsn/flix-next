import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { defaultSettings } from "../lib/cms/defaults";
import { builtInRedirectDestination } from "../lib/cms/internal-links";
import { lockedSlugForPageId } from "../lib/cms/page-paths";
import { sanitizeHref, sanitizeNavHref, sanitizeSettings } from "../lib/cms/validation";

const root = process.cwd();
const settingsForm = readFileSync(path.join(root, "components/sidhu/SiteSettingsForm.tsx"), "utf8");

test("NavEditor new link defaults to /welcome/", () => {
  const match = settingsForm.match(
    /label:\s*"New link",\s*href:\s*"([^"]+)",\s*visible:\s*true/,
  );
  assert.ok(match, "expected NavEditor add-link default");
  assert.equal(match?.[1], "/welcome/");
  assert.equal(settingsForm.includes('href: "/"'), false);
});

test("sanitizeNavHref maps blank, root, and invalid to /welcome/", () => {
  assert.equal(sanitizeNavHref(""), "/welcome/");
  assert.equal(sanitizeNavHref("   "), "/welcome/");
  assert.equal(sanitizeNavHref("/"), "/welcome/");
  assert.equal(sanitizeNavHref("javascript:alert(1)"), "/welcome/");
  assert.equal(sanitizeNavHref("random-invalid-value"), "/welcome/");
});

test("sanitizeNavHref preserves valid destinations", () => {
  assert.equal(sanitizeNavHref("/contact/"), "/contact/");
  assert.equal(sanitizeNavHref("/iptv-subscription-uk/"), "/iptv-subscription-uk/");
  assert.equal(sanitizeNavHref("/welcome/#faq"), "/welcome/#faq");
  assert.equal(sanitizeNavHref("#faq"), "#faq");
  assert.equal(sanitizeNavHref("https://example.com/"), "https://example.com/");
  assert.equal(sanitizeNavHref("mailto:test@example.com"), "mailto:test@example.com");
  assert.equal(sanitizeNavHref("tel:+441234567890"), "tel:+441234567890");
});

test("global sanitizeHref still maps blank and root to /", () => {
  assert.equal(sanitizeHref(""), "/");
  assert.equal(sanitizeHref("/"), "/");
});

test("default header/footer navigation uses direct public paths", () => {
  const settings = sanitizeSettings(defaultSettings());
  for (const link of [
    ...settings.headerNav,
    ...settings.footerQuickLinks,
    ...settings.footerSupportLinks,
    ...(settings.footerLegalLinks || []),
  ]) {
    assert.notEqual(link.href, "/");
  }
  assert.equal(settings.headerNav.find((item) => item.label === "Home")?.href, "/welcome/");
  assert.equal(settings.footerQuickLinks.find((item) => item.label === "Home")?.href, "/welcome/");
});

test("sanitizeNavList via settings maps root nav href to /welcome/", () => {
  const settings = sanitizeSettings({
    ...defaultSettings(),
    headerNav: [{ id: "n1", label: "Home", href: "/", visible: true }],
  });
  assert.equal(settings.headerNav[0]?.href, "/welcome/");
});

test("root managed redirect and page-home slug remain intact", () => {
  assert.equal(builtInRedirectDestination("/"), "/welcome/");
  assert.equal(lockedSlugForPageId("page-home"), "/");
});

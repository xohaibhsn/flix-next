import assert from "node:assert/strict";
import { test } from "node:test";
import { renderCmsHtml } from "../lib/cms/html";
import { migratePublicSubscriptionHref } from "../lib/cms/page-paths";
import { rewriteDemoCopy } from "../lib/cms/public-copy-cleanup";
import { brandedSocialTitle } from "../lib/seo";

test("branded social title does not duplicate an existing brand", () => {
  assert.equal(brandedSocialTitle("Flix IPTV | IPTV Providers UK", "Flix IPTV"), "Flix IPTV | IPTV Providers UK");
  assert.equal(
    brandedSocialTitle("Flix IPTV | IPTV Providers UK | Flix IPTV", "Flix IPTV"),
    "Flix IPTV | IPTV Providers UK",
  );
  assert.equal(brandedSocialTitle("About Flix IPTV", "Flix IPTV"), "About Flix IPTV");
  assert.equal(brandedSocialTitle("About Flix IPTV | Flix IPTV", "Flix IPTV"), "About Flix IPTV");
  assert.equal(brandedSocialTitle("Flix IPTV", "Flix IPTV"), "Flix IPTV");
  assert.equal(brandedSocialTitle("IPTV Providers UK", "Flix IPTV"), "IPTV Providers UK | Flix IPTV");
});

test("public subscription hrefs migrate old CMS links only", () => {
  assert.equal(migratePublicSubscriptionHref("/iptv-subscriptions-uk/"), "/iptv-subscription-uk/");
  assert.equal(migratePublicSubscriptionHref("/iptv-subscription-uk/"), "/iptv-subscription-uk/");
  assert.equal(migratePublicSubscriptionHref("/about-us/"), "/about-us/");
  assert.equal(
    migratePublicSubscriptionHref("https://theflixiptv.com/iptv-subscriptions-uk/"),
    "https://theflixiptv.com/iptv-subscription-uk/",
  );
  assert.equal(
    migratePublicSubscriptionHref("https://example.com/iptv-subscriptions-uk/"),
    "https://example.com/iptv-subscriptions-uk/",
  );
});

test("CMS HTML rewrites old subscription hrefs when rendered", () => {
  const html = renderCmsHtml(
    '<p><a href="/iptv-subscriptions-uk/">Plans</a> <a href="https://theflixiptv.com/iptv-subscriptions-uk/">Same</a></p>',
  );
  assert.match(html, /href="\/iptv-subscription-uk\/"/);
  assert.match(html, /href="https:\/\/theflixiptv.com\/iptv-subscription-uk\/"/);
  assert.doesNotMatch(html, /iptv-subscriptions-uk/);
});

test("public copy cleanup makes trial wording conditional and qualifies the refund", () => {
  assert.equal(
    rewriteDemoCopy(
      "Get a premium IPTV subscription in the UK with HD & 4K channels, reliable streaming, 24/7 support and a free trial. Join Flix IPTV & start watching today.",
    ),
    "Get a premium IPTV subscription in the UK with HD & 4K streaming, reliable service, 24/7 support and free trials subject to availability. Join Flix IPTV & start watching today.",
  );
  const faq = rewriteDemoCopy(
    "We offer a 7-Day Money Back Guarantee. If the service is not suitable, contact us on WhatsApp within the applicable 7-day period.",
  );
  assert.match(faq, /eligible 1 Year plans and above/i);
  assert.match(faq, /24\/7 support|WhatsApp/);
  assert.doesNotMatch(faq, /applicable 7-day period/);
  const html = rewriteDemoCopy('<p><a href="/iptv-subscriptions-uk/">Plans</a></p>');
  assert.equal(html, '<p><a href="/iptv-subscription-uk/">Plans</a></p>');
});

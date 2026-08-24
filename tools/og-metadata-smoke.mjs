const DEFAULT_BASE = process.env.OG_SMOKE_BASE || "http://localhost:3012";
const ROUTES = process.argv.slice(2).length
  ? process.argv.slice(2)
  : ["/", "/welcome/", "/iptv-subscriptions-uk/", "/contact/", "/blog/"];

function metas(html, key) {
  const re = new RegExp(
    `<meta[^>]+(?:property|name)="${key}"[^>]*content="([^"]*)"|<meta[^>]+content="([^"]*)"[^>]*(?:property|name)="${key}"`,
    "gi",
  );
  const values = [];
  for (const match of html.matchAll(re)) {
    const value = decode(match[1] || match[2] || "").trim();
    if (value) values.push(value);
  }
  return values;
}

function decode(value) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'");
}

function isUsefulImage(url) {
  return /^https:\/\//i.test(url) && !/\/sidhu\//i.test(url);
}

let failed = 0;
for (const route of ROUTES) {
  const url = new URL(route, DEFAULT_BASE).href;
  const res = await fetch(url, { headers: { "user-agent": "WhatsApp/2.23.0" } });
  const html = await res.text();
  const head = html.includes("</head>") ? html.slice(0, html.indexOf("</head>")) : html;
  const ogImages = [...new Set(metas(head, "og:image").filter(isUsefulImage))];
  const twitterImages = [...new Set(metas(head, "twitter:image").filter(isUsefulImage))];
  const ok = res.ok && ogImages.length === 1 && twitterImages.length === 1 && ogImages[0] === twitterImages[0];
  if (!ok) failed += 1;
  console.log(ok ? "PASS" : "FAIL", route, {
    status: res.status,
    title: metas(head, "og:title")[0] || "",
    ogImage: ogImages,
    twitterImage: twitterImages,
    width: metas(head, "og:image:width")[0] || "",
    height: metas(head, "og:image:height")[0] || "",
  });
}

if (failed) {
  console.error(`og-metadata-smoke: ${failed} route(s) failed`);
  process.exit(1);
}
console.log("og-metadata-smoke: all routes passed");

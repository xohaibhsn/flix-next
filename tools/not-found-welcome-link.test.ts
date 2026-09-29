import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import {
  builtInRedirectDestination,
  resolveInternalRedirectPath,
} from "../lib/cms/internal-links";

const notFoundPath = path.join(process.cwd(), "app/not-found.tsx");
const notFoundSource = readFileSync(notFoundPath, "utf8");

test("404 Back to Home links directly to /welcome/", () => {
  assert.match(notFoundSource, /Back to Home/);
  const homeLink = notFoundSource.match(
    /<Link\s+href="([^"]+)"[\s\S]*?>\s*Back to Home\s*<\/Link>/,
  );
  assert.ok(homeLink);
  assert.equal(homeLink?.[1], "/welcome/");
  assert.equal(notFoundSource.includes('href="/"'), false);
});

test("root redirect hop remains / → /welcome/", () => {
  assert.equal(builtInRedirectDestination("/"), "/welcome/");
  const resolved = resolveInternalRedirectPath("/", []);
  assert.equal(resolved.redirected, true);
  assert.equal(resolved.finalPath, "/welcome/");
});

test("branded not-found page remains the Next.js 404 handler", () => {
  assert.equal(existsSync(notFoundPath), true);
  assert.match(notFoundSource, /export default function NotFound/);
  assert.match(notFoundSource, /Page not found/);
  assert.equal(notFoundSource.includes("redirect("), false);
  assert.equal(notFoundSource.includes("permanentRedirect("), false);
});

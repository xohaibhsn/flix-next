/**
 * Preload for node:test / tsx: replace `server-only` with a no-op so server modules
 * can be unit-tested outside the Next.js bundler (which enforces the real package).
 */
const Module = require("module");
const path = require("path");

const stub = path.join(__dirname, "server-only.js");
const original = Module._resolveFilename;

Module._resolveFilename = function (request, parent, isMain, options) {
  if (request === "server-only") {
    return stub;
  }
  return original.call(this, request, parent, isMain, options);
};

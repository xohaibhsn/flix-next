import assert from "node:assert/strict";
import { test } from "node:test";
import { headCodePolicyError, parseHeadCode, sanitizeCustomHeadCode } from "../lib/cms/head-code";

test("empty head code renders nothing", () => {
  assert.deepEqual(parseHeadCode(""), []);
  assert.deepEqual(parseHeadCode("   "), []);
});

test("parses verification meta and a harmless script once", () => {
  const html = `
    <meta name="example-verification" content="test-value">
    <script>window.__headCodeTest = true;</script>
  `;
  const nodes = parseHeadCode(html);
  assert.equal(nodes.length, 2);
  assert.equal(nodes[0].kind, "meta");
  if (nodes[0].kind === "meta") {
    assert.equal(nodes[0].attrs.name, "example-verification");
    assert.equal(nodes[0].attrs.content, "test-value");
  }
  assert.equal(nodes[1].kind, "script");
  if (nodes[1].kind === "script") {
    assert.match(nodes[1].content, /headCodeTest/);
  }
});

test("rejects php and does not execute server constructs", () => {
  assert.ok(headCodePolicyError("<?php echo 1; ?>"));
  assert.deepEqual(parseHeadCode("<?php echo 1; ?><meta name='x' content='y'>"), []);
});

test("skips javascript urls and charset/refresh meta", () => {
  const nodes = parseHeadCode(`
    <meta charset="utf-8">
    <meta http-equiv="refresh" content="0;url=https://example.com">
    <script src="javascript:alert(1)"></script>
    <meta name="example-verification" content="ok">
  `);
  assert.equal(nodes.length, 1);
  assert.equal(nodes[0].kind, "meta");
});

test("does not reject noscript iframe snippets", () => {
  assert.equal(
    headCodePolicyError(
      '<noscript><iframe src="https://www.googletagmanager.com/ns.html?id=GTM-TEST" height="0" width="0"></iframe></noscript>',
    ),
    null,
  );
});

test("sanitize keeps stored markup and caps length", () => {
  const raw = '<meta name="example-verification" content="test-value">';
  assert.equal(sanitizeCustomHeadCode(raw), raw);
  assert.equal(sanitizeCustomHeadCode(undefined), "");
});

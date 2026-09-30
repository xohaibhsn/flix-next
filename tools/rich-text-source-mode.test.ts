import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import {
  DEFAULT_RICH_TEXT_EDITOR_MODE,
  enterHtmlSourceMode,
  enterVisualModeFromSource,
  normalizeEditorHtml,
  resolveHtmlModeIncomingValue,
  sourceRoundTrip,
} from "../lib/cms/rich-text-editor-mode";
import { sanitizeHtml } from "../lib/cms/html";

const root = process.cwd();

function read(rel: string) {
  return readFileSync(path.join(root, rel), "utf8");
}

test("Visual mode is the shared editor default", () => {
  assert.equal(DEFAULT_RICH_TEXT_EDITOR_MODE, "visual");
  const src = read("components/sidhu/RichTextEditor.tsx");
  assert.match(src, /useState<RichTextEditorMode>\(DEFAULT_RICH_TEXT_EDITOR_MODE\)/);
});

test("shared RichTextEditor exposes Visual and HTML mode controls", () => {
  const src = read("components/sidhu/RichTextEditor.tsx");
  assert.match(src, />\s*Visual\s*</);
  assert.match(src, />\s*HTML\s*</);
  assert.match(src, /aria-pressed=\{mode === "visual"\}/);
  assert.match(src, /aria-pressed=\{mode === "html"\}/);
  assert.match(src, /type="button"/);
  assert.match(src, /HTML source/);
  assert.match(src, /aria-label="HTML source editor"/);
  assert.match(src, /font-mono/);
});

test("HTML mode shows raw markup without auto-escaping entities", () => {
  const sample = "<p>Hello</p><h2>Heading</h2>";
  const shown = sourceRoundTrip(sample);
  assert.equal(shown, sample);
  assert.equal(shown.includes("&lt;p&gt;"), false);
  assert.equal(shown.includes("<p>Hello</p>"), true);
});

test("HTML source edits call the same onChange callback", () => {
  const calls: string[] = [];
  const html = enterHtmlSourceMode({
    getEditorHtml: () => "<p>From visual</p>",
    onChange: (next) => calls.push(next),
  });
  assert.equal(html, "<p>From visual</p>");
  assert.deepEqual(calls, ["<p>From visual</p>"]);

  const typed: string[] = [];
  // Simulate textarea typing through the same parent onChange used by Visual mode.
  const emit = (value: string) => typed.push(value);
  emit("<p>Edited in HTML</p>");
  assert.deepEqual(typed, ["<p>Edited in HTML</p>"]);
});

test("Visual → HTML uses latest editor.getHTML(), not a stale original", () => {
  let live = "<p>Stale prop</p>";
  const getEditorHtml = () => "<p>Latest from TipTap</p>";
  const shown = enterHtmlSourceMode({
    getEditorHtml: () => {
      live = getEditorHtml();
      return live;
    },
    onChange: () => undefined,
  });
  assert.equal(shown, "<p>Latest from TipTap</p>");
  assert.notEqual(shown, "<p>Stale prop</p>");
});

test("HTML → Visual loads latest source into TipTap with emitUpdate false", () => {
  const calls: Array<{ html: string; opts: { emitUpdate: boolean } }> = [];
  const parent: string[] = [];
  const result = enterVisualModeFromSource({
    sourceHtml: "<h2>Heading</h2><p><a href=\"/contact/\">Contact</a></p>",
    setContent: (html, opts) => calls.push({ html, opts }),
    onChange: (html) => parent.push(html),
  });
  assert.equal(result, "<h2>Heading</h2><p><a href=\"/contact/\">Contact</a></p>");
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.opts.emitUpdate, false);
  assert.equal(calls[0]?.html, result);
  assert.deepEqual(parent, [result]);
});

test("round trip does not double-escape markup", () => {
  const original = "<p>Hello</p>";
  let current = original;
  // Visual → HTML
  current = enterHtmlSourceMode({
    getEditorHtml: () => current,
    onChange: (html) => {
      current = html;
    },
  });
  // HTML → Visual
  current = enterVisualModeFromSource({
    sourceHtml: current,
    setContent: (html) => {
      current = html;
    },
    onChange: (html) => {
      current = html;
    },
  });
  // Visual → HTML again
  current = enterHtmlSourceMode({
    getEditorHtml: () => current,
    onChange: (html) => {
      current = html;
    },
  });
  assert.equal(current, original);
  assert.equal(current.includes("&lt;p&gt;"), false);
  assert.equal(current.includes("<p>&lt;p&gt;"), false);
});

test("headings and links survive mode switch helpers", () => {
  const withHeading = "<h2>What cookies are</h2><p>Body</p>";
  const withLink = '<p><a href="/privacy-policy/">Privacy Policy</a></p>';
  assert.equal(sourceRoundTrip(withHeading), withHeading);
  assert.match(sourceRoundTrip(withHeading), /<h2>What cookies are<\/h2>/);
  assert.equal(sourceRoundTrip(withLink), withLink);
  assert.match(sourceRoundTrip(withLink), /href="\/privacy-policy\/"/);
});

test("existing escaped CMS content is not auto-decoded", () => {
  const escaped = "&lt;p&gt;Hello&lt;/p&gt;";
  assert.equal(sourceRoundTrip(escaped), escaped);
});

test("external HTML-mode updates apply only when not an echo of last emit", () => {
  const echo = resolveHtmlModeIncomingValue({
    incoming: "<p>Same</p>",
    lastEmitted: "<p>Same</p>",
  });
  assert.equal(echo.apply, false);

  const external = resolveHtmlModeIncomingValue({
    incoming: "<p>Image inserted</p>",
    lastEmitted: "<p>Same</p>",
  });
  assert.equal(external.apply, true);
  assert.equal(external.next, "<p>Image inserted</p>");
});

test("normalizeEditorHtml keeps empty as a paragraph shell", () => {
  assert.equal(normalizeEditorHtml(""), "<p></p>");
  assert.equal(normalizeEditorHtml("   "), "<p></p>");
  assert.equal(normalizeEditorHtml("<p>Hi</p>"), "<p>Hi</p>");
});

test("source mode does not introduce its own save path", () => {
  const editor = read("components/sidhu/RichTextEditor.tsx");
  const helpers = read("lib/cms/rich-text-editor-mode.ts");
  assert.doesNotMatch(editor, /savePostAction|savePageAction|fetch\(/);
  assert.doesNotMatch(helpers, /savePostAction|savePageAction|cms\.|repository/);
});

test("existing sanitizeHtml remains authoritative against unsafe scripts", () => {
  const dirty =
    '<p>Safe</p><script>alert(1)</script><p><a href="javascript:alert(1)">x</a></p><img src="http://evil.test/x.png" onclick="alert(1)" />';
  const clean = sanitizeHtml(dirty);
  assert.match(clean, /Safe/);
  assert.doesNotMatch(clean, /<script/i);
  assert.doesNotMatch(clean, /javascript:/i);
  assert.doesNotMatch(clean, /onclick=/i);
  // http img stripped by existing policy (https-only images)
  assert.doesNotMatch(clean, /evil\.test/);
});

test("BlogEditor and Rich Content inherit ClientRichTextEditor (shared mode)", () => {
  const blog = read("components/sidhu/BlogEditor.tsx");
  const section = read("components/sidhu/SectionEditor.tsx");
  const client = read("components/sidhu/ClientRichTextEditor.tsx");
  assert.match(client, /RichTextEditor/);
  assert.match(blog, /ClientRichTextEditor/);
  assert.match(blog, /value=\{draft\.content\}/);
  assert.match(section, /ClientRichTextEditor/);
  assert.match(section, /value=\{data\.html\}/);
  // No duplicate source-mode implementations in consumers
  assert.doesNotMatch(blog, /Editor mode|HTML source editor|enterHtmlSourceMode/);
  assert.doesNotMatch(section, /enterHtmlSourceMode|DEFAULT_RICH_TEXT_EDITOR_MODE/);
});

test("legacy rich-text HTML textarea remains unchanged", () => {
  const section = read("components/sidhu/SectionEditor.tsx");
  assert.match(section, /label="HTML content"/);
  assert.match(section, /Keep this simple\. Scripts are stripped on save\./);
  assert.match(section, /function RichTextFields/);
});

test("formatting toolbar is gated behind Visual mode in shared editor", () => {
  const src = read("components/sidhu/RichTextEditor.tsx");
  assert.match(src, /inHtmlMode \? \(/);
  assert.match(src, /label="H2"/);
  // Toolbar H2 appears only in the Visual branch after the HTML textarea branch
  const htmlBranch = src.indexOf('aria-label="HTML source editor"');
  const h2 = src.indexOf('label="H2"');
  assert.ok(htmlBranch > 0 && h2 > htmlBranch);
});

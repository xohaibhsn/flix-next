import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { test } from "node:test";
import { isEditorDirty } from "../lib/cms/editor-dirty";
import { EditorTabs } from "../components/sidhu/ui/EditorTabs";
import { StickyEditorBar } from "../components/sidhu/ui/StickyEditorBar";
import { SeoAiDraftPanel } from "../components/sidhu/SeoAiDraftPanel";

const root = process.cwd();

function read(rel: string) {
  return readFileSync(path.join(root, rel), "utf8");
}

test("Blog editor exposes Content / SEO / Social / Advanced tabs and sticky save", () => {
  const src = read("components/sidhu/BlogEditor.tsx");
  assert.match(src, /id: "content"/);
  assert.match(src, /id: "seo"/);
  assert.match(src, /id: "social"/);
  assert.match(src, /id: "advanced"/);
  assert.match(src, /EditorTabs/);
  assert.match(src, /StickyEditorBar/);
  assert.match(src, /savePostAction/);
  assert.match(src, /isEditorDirty/);
  assert.match(src, /beforeunload/);
  assert.match(src, /SeoAiDraftPanel/);
  assert.doesNotMatch(src, /setInterval|autosave|poll/i);
});

test("Category editor exposes meaningful tabs without inventing empty ones", () => {
  const src = read("components/sidhu/CategoryEditor.tsx");
  assert.match(src, /id: "content"/);
  assert.match(src, /id: "seo"/);
  assert.match(src, /id: "social"/);
  assert.match(src, /id: "advanced"/);
  assert.match(src, /saveCategoryAction/);
  assert.match(src, /StickyEditorBar/);
  assert.doesNotMatch(src, /Opportunities|GSC/);
});

test("Page SEO editor groups SEO/Social/Advanced and does not own page content controls", () => {
  const src = read("components/sidhu/PageSeoPanel.tsx");
  assert.match(src, /id: "seo"/);
  assert.match(src, /id: "social"/);
  assert.match(src, /id: "advanced"/);
  assert.doesNotMatch(src, /id: "content"/);
  assert.match(src, /Page content is edited in the builder above/);
  assert.match(src, /savePageSeoAction/);
  assert.doesNotMatch(src, /savePageAction|ClientRichTextEditor/);
  assert.match(src, /builder above/);
  assert.match(src, /customJsonLd/);
});

test("Editor tabs are local UI state only — no save/AI on tab change", () => {
  const tabs = read("components/sidhu/ui/EditorTabs.tsx");
  const blog = read("components/sidhu/BlogEditor.tsx");
  assert.match(tabs, /role="tablist"/);
  assert.match(tabs, /aria-selected/);
  assert.doesNotMatch(tabs, /savePost|saveCategory|savePage|draftAction|fetch\(/);
  assert.match(blog, /setTab/);
  assert.doesNotMatch(blog, /onChange=\{setTab\}[\s\S]{0,40}save\(/);
});

test("dirty helper marks real field edits only", () => {
  const baseline = { title: "A", seoTitle: "" };
  assert.equal(isEditorDirty(baseline, baseline), false);
  assert.equal(isEditorDirty({ ...baseline, title: "B" }, baseline), true);
  assert.equal(isEditorDirty({ ...baseline, seoTitle: "AI" }, baseline), true);
});

test("StickyEditorBar exposes saved / unsaved / saving statuses", () => {
  const clean = renderToStaticMarkup(
    createElement(StickyEditorBar, {
      title: "Post",
      dirty: false,
      saving: false,
      saveLabel: "Save post",
      onSave: () => undefined,
    }),
  );
  assert.match(clean, /Saved/);
  assert.match(clean, /Save post/);

  const dirty = renderToStaticMarkup(
    createElement(StickyEditorBar, {
      title: "Post",
      dirty: true,
      saving: false,
      saveLabel: "Save post",
      onSave: () => undefined,
    }),
  );
  assert.match(dirty, /Unsaved changes/);

  const saving = renderToStaticMarkup(
    createElement(StickyEditorBar, {
      title: "Post",
      dirty: true,
      saving: true,
      saveLabel: "Save post",
      onSave: () => undefined,
    }),
  );
  assert.match(saving, /Saving…/);
});

test("EditorTabs render selected tab without calling handlers on mount", () => {
  let changes = 0;
  const html = renderToStaticMarkup(
    createElement(EditorTabs, {
      items: [
        { id: "content", label: "Content" },
        { id: "seo", label: "SEO" },
      ],
      value: "content",
      onChange: () => {
        changes += 1;
      },
    }),
  );
  assert.match(html, /role="tablist"/);
  assert.match(html, /Content/);
  assert.match(html, /SEO/);
  assert.match(html, /aria-selected="true"/);
  assert.equal(changes, 0);
});

test("AI drawer entry opens without provider call; Draft with Gemini/OpenAI remain generate actions", () => {
  let calls = 0;
  const html = renderToStaticMarkup(
    createElement(SeoAiDraftPanel, {
      context: {
        entityKind: "page",
        entityLabel: "About Us",
        publicUrl: "/about-us/",
        currentTitle: "About Us",
        currentDescription: "Desc",
        siteName: "Flix IPTV",
        titleSuffix: " | Flix IPTV",
      },
      openaiConfigured: true,
      geminiConfigured: true,
      draftAction: async () => {
        calls += 1;
        return {
          ok: true as const,
          draft: {
            titles: [],
            descriptions: [],
            guidance: "",
          },
          provider: "openai" as const,
        };
      },
      onUseTitle: () => undefined,
      onUseDescription: () => undefined,
    }),
  );
  assert.match(html, /Ask Sidhu AI/);
  assert.doesNotMatch(html, /role="dialog"/);
  assert.equal(calls, 0);
  const src = read("components/sidhu/SeoAiDraftPanel.tsx");
  assert.match(src, /openDrawer/);
  assert.match(src, /function runDraft/);
  assert.match(src, /Draft with Gemini/);
  assert.match(src, /Draft with OpenAI/);
  assert.match(src, /Generate again with Gemini/);
  assert.match(src, /Generate again with OpenAI/);
  assert.doesNotMatch(src, /another AI request/);
  assert.match(src, /Undo/);
  assert.match(src, /AI suggestion applied — not saved/);
});

test("editors keep original save actions and post-save advisory wiring", () => {
  const blog = read("components/sidhu/BlogEditor.tsx");
  const category = read("components/sidhu/CategoryEditor.tsx");
  const page = read("components/sidhu/PageSeoPanel.tsx");
  assert.match(blog, /result\.seoAdvisory/);
  assert.match(category, /result\.seoAdvisory/);
  assert.match(page, /result\.seoAdvisory/);
  assert.match(blog, /SeoPostSaveAdvisoryPanel/);
  assert.doesNotMatch(blog, /draftSeoTitleMetaAction\(\)/);
  assert.doesNotMatch(page, /runSeoHealthScan|saveSeoHealthState/);
});

test("package.json still has no new UI framework or OpenAI SDK", () => {
  const pkg = JSON.parse(read("package.json")) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  const all = { ...pkg.dependencies, ...pkg.devDependencies };
  for (const name of ["@mui/material", "antd", "framer-motion", "openai", "@radix-ui/react-dialog"]) {
    assert.equal(all[name], undefined);
  }
});

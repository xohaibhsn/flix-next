"use client";

import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import { TextStyle } from "@tiptap/extension-text-style";
import TextAlign from "@tiptap/extension-text-align";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import CharacterCount from "@tiptap/extension-character-count";
import { Table, TableRow, TableCell, TableHeader } from "@tiptap/extension-table";
import { mergeAttributes } from "@tiptap/core";
import { useEffect, useRef, useState, type MouseEvent } from "react";

const DANGEROUS_SCHEME = /^(javascript|data|vbscript|file):/i;

const EditorLink = Link.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      target: { default: null },
      rel: { default: null },
      "data-nofollow": {
        default: null,
        parseHTML: (element) => element.getAttribute("data-nofollow"),
        renderHTML: (attributes) =>
          attributes["data-nofollow"] === "true" ? { "data-nofollow": "true" } : {},
      },
    };
  },
}).configure({
  openOnClick: false,
  autolink: true,
  defaultProtocol: "https",
  HTMLAttributes: {
    target: null,
    rel: null,
    class: null,
  },
  isAllowedUri: (url, ctx) => {
    const href = String(url || "").trim();
    if (!href || DANGEROUS_SCHEME.test(href) || href.startsWith("//")) return false;
    const ok =
      href.startsWith("/") ||
      href.startsWith("#") ||
      href.startsWith("mailto:") ||
      href.startsWith("tel:") ||
      href.startsWith("https://") ||
      href.startsWith("http://localhost") ||
      href.startsWith("http://127.0.0.1");
    return ok && ctx.defaultValidate(href);
  },
});

const EditorTable = Table.extend({
  renderHTML({ HTMLAttributes }) {
    const attrs = Object.fromEntries(
      Object.entries(HTMLAttributes as Record<string, unknown>).filter(([key]) => key !== "style"),
    );
    return ["table", mergeAttributes(this.options.HTMLAttributes, attrs), ["tbody", 0]];
  },
}).configure({
  resizable: false,
  renderWrapper: false,
});

function keepEditorSelection(event: MouseEvent<HTMLButtonElement>) {
  event.preventDefault();
}

function ToolButton({
  label,
  title,
  active,
  disabled,
  onClick,
}: {
  label: string;
  title?: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={title || label}
      disabled={disabled}
      aria-pressed={active ? true : undefined}
      className={`rounded border px-2 py-1 text-xs ${
        disabled
          ? "cursor-not-allowed border-line bg-paper text-muted"
          : active
            ? "border-brand bg-brand text-white"
            : "border-line bg-white"
      }`}
      onMouseDown={keepEditorSelection}
      onClick={() => {
        if (!disabled) onClick();
      }}
    >
      {label}
    </button>
  );
}

function run(editor: Editor, command: (chain: ReturnType<Editor["chain"]>) => boolean) {
  command(editor.chain().focus());
}

function parseTableSize(value: string) {
  const match = value.trim().match(/^(\d+)\s*[x×]\s*(\d+)$/i);
  const rows = match ? Number.parseInt(match[1], 10) : 3;
  const cols = match ? Number.parseInt(match[2], 10) : 3;
  return {
    rows: Math.min(20, Math.max(2, Number.isFinite(rows) ? rows : 3)),
    cols: Math.min(12, Math.max(1, Number.isFinite(cols) ? cols : 3)),
  };
}

export function RichTextEditor({
  value,
  onChange,
  onRequestImage,
  placeholder = "Write the article…",
}: {
  value: string;
  onChange: (html: string) => void;
  onRequestImage?: () => void;
  placeholder?: string;
}) {
  const onChangeRef = useRef(onChange);
  const [, setToolbar] = useState(0);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkHref, setLinkHref] = useState("");
  const [linkNewTab, setLinkNewTab] = useState(false);
  const [linkNofollow, setLinkNofollow] = useState(false);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3, 4] } }),
      Underline,
      TextStyle,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      EditorLink,
      Image,
      EditorTable,
      TableRow,
      TableHeader,
      TableCell,
      Placeholder.configure({ placeholder }),
      CharacterCount,
    ],
    content: value || "<p></p>",
    editorProps: {
      attributes: {
        class: "prose-cms min-h-64 rounded-md border border-line px-3 py-2 text-sm focus:outline-none",
      },
    },
    onUpdate: ({ editor: current }) => onChangeRef.current(current.getHTML()),
    onSelectionUpdate: () => setToolbar((tick) => tick + 1),
  });

  useEffect(() => {
    if (!editor) return;
    const incoming = value || "<p></p>";
    if (incoming === editor.getHTML()) return;
    if (editor.isFocused) return;
    editor.commands.setContent(incoming, { emitUpdate: false });
  }, [editor, value]);

  if (!editor) return <p className="text-sm text-muted">Loading editor…</p>;
  const current = editor;
  const inTable = current.isActive("table");

  function openLinkPanel() {
    const attrs = current.getAttributes("link") as Record<string, string | null>;
    setLinkHref(attrs.href || "");
    setLinkNewTab(attrs.target === "_blank");
    setLinkNofollow(attrs["data-nofollow"] === "true");
    setLinkOpen(true);
  }

  function applyLink() {
    const href = linkHref.trim();
    if (!href) {
      run(current, (chain) => chain.extendMarkRange("link").unsetLink().run());
      setLinkOpen(false);
      return;
    }
    const rel = linkNewTab
      ? linkNofollow
        ? "noopener noreferrer nofollow"
        : "noopener noreferrer"
      : linkNofollow
        ? "nofollow"
        : null;
    run(current, (chain) =>
      chain
        .extendMarkRange("link")
        .setLink({
          href,
          target: linkNewTab ? "_blank" : null,
          rel,
          "data-nofollow": linkNofollow ? "true" : null,
        } as { href: string })
        .run(),
    );
    setLinkOpen(false);
  }

  function insertTable() {
    const spec = window.prompt("Insert table as rows × columns", "3x3");
    if (spec === null) return;
    const size = parseTableSize(spec);
    run(current, (chain) => chain.insertTable({ ...size, withHeaderRow: true }).run());
  }

  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-1">
        <ToolButton label="P" active={current.isActive("paragraph")} onClick={() => run(current, (chain) => chain.setParagraph().run())} />
        <ToolButton label="H2" active={current.isActive("heading", { level: 2 })} onClick={() => run(current, (chain) => chain.toggleHeading({ level: 2 }).run())} />
        <ToolButton label="H3" active={current.isActive("heading", { level: 3 })} onClick={() => run(current, (chain) => chain.toggleHeading({ level: 3 }).run())} />
        <ToolButton label="H4" active={current.isActive("heading", { level: 4 })} onClick={() => run(current, (chain) => chain.toggleHeading({ level: 4 }).run())} />
        <ToolButton label="B" active={current.isActive("bold")} onClick={() => run(current, (chain) => chain.toggleBold().run())} />
        <ToolButton label="I" active={current.isActive("italic")} onClick={() => run(current, (chain) => chain.toggleItalic().run())} />
        <ToolButton label="U" active={current.isActive("underline")} onClick={() => run(current, (chain) => chain.toggleUnderline().run())} />
        <ToolButton label="S" active={current.isActive("strike")} onClick={() => run(current, (chain) => chain.toggleStrike().run())} />
        <ToolButton label="•" active={current.isActive("bulletList")} onClick={() => run(current, (chain) => chain.toggleBulletList().run())} />
        <ToolButton label="1." active={current.isActive("orderedList")} onClick={() => run(current, (chain) => chain.toggleOrderedList().run())} />
        <ToolButton label="“" active={current.isActive("blockquote")} onClick={() => run(current, (chain) => chain.toggleBlockquote().run())} />
        <ToolButton label="—" onClick={() => run(current, (chain) => chain.setHorizontalRule().run())} />
        <ToolButton label="Left" active={current.isActive({ textAlign: "left" })} onClick={() => run(current, (chain) => chain.setTextAlign("left").run())} />
        <ToolButton label="Center" active={current.isActive({ textAlign: "center" })} onClick={() => run(current, (chain) => chain.setTextAlign("center").run())} />
        <ToolButton label="Right" active={current.isActive({ textAlign: "right" })} onClick={() => run(current, (chain) => chain.setTextAlign("right").run())} />
        <ToolButton label="Link" active={current.isActive("link")} onClick={openLinkPanel} />
        <ToolButton label="Image" onClick={() => onRequestImage?.()} />
        <ToolButton label="Table" title="Insert table" onClick={insertTable} />
        <ToolButton label="+Row" title="Add row" disabled={!inTable} onClick={() => run(current, (chain) => chain.addRowAfter().run())} />
        <ToolButton label="-Row" title="Delete row" disabled={!inTable} onClick={() => run(current, (chain) => chain.deleteRow().run())} />
        <ToolButton label="+Col" title="Add column" disabled={!inTable} onClick={() => run(current, (chain) => chain.addColumnAfter().run())} />
        <ToolButton label="-Col" title="Delete column" disabled={!inTable} onClick={() => run(current, (chain) => chain.deleteColumn().run())} />
        <ToolButton label="HRow" title="Toggle header row" disabled={!inTable} onClick={() => run(current, (chain) => chain.toggleHeaderRow().run())} />
        <ToolButton label="HCol" title="Toggle header column" disabled={!inTable} onClick={() => run(current, (chain) => chain.toggleHeaderColumn().run())} />
        <ToolButton label="Merge" title="Merge cells" disabled={!inTable || !current.can().mergeCells()} onClick={() => run(current, (chain) => chain.mergeCells().run())} />
        <ToolButton label="Split" title="Split cell" disabled={!inTable || !current.can().splitCell()} onClick={() => run(current, (chain) => chain.splitCell().run())} />
        <ToolButton label="Del table" title="Delete table" disabled={!inTable} onClick={() => run(current, (chain) => chain.deleteTable().run())} />
        <ToolButton label="Undo" onClick={() => run(current, (chain) => chain.undo().run())} />
        <ToolButton label="Redo" onClick={() => run(current, (chain) => chain.redo().run())} />
      </div>
      {linkOpen ? (
        <div className="mb-2 space-y-2 rounded-md border border-line bg-paper p-3">
          <label className="block text-xs font-semibold text-ink">
            Link URL
            <input
              value={linkHref}
              onChange={(event) => setLinkHref(event.target.value)}
              placeholder="/contact/ or https://example.com/"
              className="mt-1 w-full rounded border border-line bg-white px-2 py-1 text-sm"
            />
          </label>
          <label className="flex items-center gap-2 text-xs text-ink">
            <input type="checkbox" checked={linkNewTab} onChange={(event) => setLinkNewTab(event.target.checked)} />
            Open in new tab
          </label>
          <label className="flex items-center gap-2 text-xs text-ink">
            <input type="checkbox" checked={linkNofollow} onChange={(event) => setLinkNofollow(event.target.checked)} />
            Nofollow
          </label>
          <div className="flex flex-wrap gap-1">
            <ToolButton label="Apply link" onClick={applyLink} />
            <ToolButton label="Remove" onClick={() => {
              run(current, (chain) => chain.extendMarkRange("link").unsetLink().run());
              setLinkOpen(false);
            }} />
            <ToolButton label="Cancel" onClick={() => setLinkOpen(false)} />
          </div>
        </div>
      ) : null}
      <EditorContent editor={current} />
    </div>
  );
}

export { insertEditorImage } from "@/lib/cms/blog";

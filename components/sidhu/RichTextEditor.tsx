"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import { TextStyle } from "@tiptap/extension-text-style";
import TextAlign from "@tiptap/extension-text-align";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import CharacterCount from "@tiptap/extension-character-count";
import { useEffect } from "react";

export function RichTextEditor({
  value,
  onChange,
  onRequestImage,
}: {
  value: string;
  onChange: (html: string) => void;
  onRequestImage?: () => void;
}) {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3, 4] } }),
      Underline,
      TextStyle,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Link.configure({ openOnClick: false, autolink: true }),
      Image,
      Placeholder.configure({ placeholder: "Write the article…" }),
      CharacterCount,
    ],
    content: value,
    editorProps: {
      attributes: {
        class: "prose-cms min-h-64 rounded-md border border-line px-3 py-2 text-sm focus:outline-none",
      },
    },
    onUpdate: ({ editor: current }) => onChange(current.getHTML()),
  });

  useEffect(() => {
    if (!editor) return;
    const current = editor.getHTML();
    if (value && value !== current) editor.commands.setContent(value, { emitUpdate: false });
  }, [editor, value]);

  if (!editor) return <p className="text-sm text-muted">Loading editor…</p>;
  const current = editor;

  function setLink() {
    const previous = current.getAttributes("link").href as string | undefined;
    const url = window.prompt("Link URL", previous || "https://");
    if (url === null) return;
    if (!url) {
      current.chain().focus().unsetLink().run();
      return;
    }
    current.chain().focus().setLink({ href: url }).run();
  }

  const tools: Array<{ label: string; run: () => void }> = [
    { label: "P", run: () => current.chain().focus().setParagraph().run() },
    { label: "H2", run: () => current.chain().focus().toggleHeading({ level: 2 }).run() },
    { label: "H3", run: () => current.chain().focus().toggleHeading({ level: 3 }).run() },
    { label: "H4", run: () => current.chain().focus().toggleHeading({ level: 4 }).run() },
    { label: "B", run: () => current.chain().focus().toggleBold().run() },
    { label: "I", run: () => current.chain().focus().toggleItalic().run() },
    { label: "U", run: () => current.chain().focus().toggleUnderline().run() },
    { label: "S", run: () => current.chain().focus().toggleStrike().run() },
    { label: "•", run: () => current.chain().focus().toggleBulletList().run() },
    { label: "1.", run: () => current.chain().focus().toggleOrderedList().run() },
    { label: "“", run: () => current.chain().focus().toggleBlockquote().run() },
    { label: "—", run: () => current.chain().focus().setHorizontalRule().run() },
    { label: "Left", run: () => current.chain().focus().setTextAlign("left").run() },
    { label: "Center", run: () => current.chain().focus().setTextAlign("center").run() },
    { label: "Right", run: () => current.chain().focus().setTextAlign("right").run() },
  ];

  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-1">
        {tools.map((tool) => (
          <button
            key={tool.label}
            type="button"
            className="rounded border border-line px-2 py-1 text-xs"
            onClick={tool.run}
          >
            {tool.label}
          </button>
        ))}
        <button type="button" className="rounded border border-line px-2 py-1 text-xs" onClick={setLink}>
          Link
        </button>
        <button type="button" className="rounded border border-line px-2 py-1 text-xs" onClick={() => onRequestImage?.()}>
          Image
        </button>
        <button type="button" className="rounded border border-line px-2 py-1 text-xs" onClick={() => current.chain().focus().undo().run()}>
          Undo
        </button>
        <button type="button" className="rounded border border-line px-2 py-1 text-xs" onClick={() => current.chain().focus().redo().run()}>
          Redo
        </button>
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}

export function insertEditorImage(html: string, url: string, alt: string) {
  return `${html}<p><img src="${url}" alt="${alt.replace(/"/g, "")}" /></p>`;
}

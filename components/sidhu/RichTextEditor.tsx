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
import { useEffect, useRef, useState, type MouseEvent } from "react";

function keepEditorSelection(event: MouseEvent<HTMLButtonElement>) {
  event.preventDefault();
}

function ToolButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active ? true : undefined}
      className={`rounded border px-2 py-1 text-xs ${
        active ? "border-brand bg-brand text-white" : "border-line bg-white"
      }`}
      onMouseDown={keepEditorSelection}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

function run(editor: Editor, command: (chain: ReturnType<Editor["chain"]>) => boolean) {
  command(editor.chain().focus());
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
      Link.configure({ openOnClick: false, autolink: true }),
      Image,
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

  function setLink() {
    const previous = current.getAttributes("link").href as string | undefined;
    const url = window.prompt("Link URL", previous || "https://");
    if (url === null) return;
    if (!url) {
      run(current, (chain) => chain.unsetLink().run());
      return;
    }
    run(current, (chain) => chain.setLink({ href: url }).run());
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
        <ToolButton label="Link" active={current.isActive("link")} onClick={setLink} />
        <ToolButton label="Image" onClick={() => onRequestImage?.()} />
        <ToolButton label="Undo" onClick={() => run(current, (chain) => chain.undo().run())} />
        <ToolButton label="Redo" onClick={() => run(current, (chain) => chain.redo().run())} />
      </div>
      <EditorContent editor={current} />
    </div>
  );
}

export { insertEditorImage } from "@/lib/cms/blog";

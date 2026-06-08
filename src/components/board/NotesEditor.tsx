import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import { Markdown } from "tiptap-markdown";
import { useEffect } from "react";

interface Props {
  value: string;
  onChange: (v: string) => void;
}

/**
 * Notion-style live markdown editor.
 *
 * StarterKit's input rules turn the markdown shortcuts (# heading, **bold**,
 * - list, > quote, ``` code, --- hr) into formatting as you type. We persist
 * the document as markdown via `tiptap-markdown`, so the `task.notes` string
 * stays plain markdown (drop-in compatible with the previous textarea).
 */
export function NotesEditor({ value, onChange }: Props) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        // Inline code is fine, but disable the heading levels we don't style.
        heading: { levels: [1, 2, 3] },
      }),
      Link.configure({ openOnClick: true, autolink: true, linkOnPaste: true }),
      Placeholder.configure({
        placeholder: "Notes — scratchpad, plan, links. Markdown is fine.",
      }),
      Markdown.configure({
        html: false,
        tightLists: true,
        bulletListMarker: "-",
        linkify: true,
        transformPastedText: true,
      }),
    ],
    content: value,
    editorProps: {
      attributes: { class: "busta-prose" },
    },
    onUpdate: ({ editor }) => {
      const md = (editor.storage as unknown as { markdown: { getMarkdown: () => string } }).markdown.getMarkdown();
      onChange(md);
    },
  });

  // Sync external value changes (opening a different task swaps the buffer).
  useEffect(() => {
    if (!editor) return;
    const current = (editor.storage as unknown as { markdown: { getMarkdown: () => string } }).markdown.getMarkdown();
    if (current !== value) {
      editor.commands.setContent(value || "", { emitUpdate: false });
    }
  }, [editor, value]);

  return (
    <div className="rounded-md bg-(--color-surface-muted)">
      <EditorContent editor={editor} />
    </div>
  );
}

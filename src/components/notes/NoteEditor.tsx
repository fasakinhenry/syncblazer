import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Placeholder from "@tiptap/extension-placeholder";
import CharacterCount from "@tiptap/extension-character-count";
import { Markdown } from "tiptap-markdown";
import { useEffect, useRef, useState, type ChangeEvent, type MouseEvent } from "react";
import { Copy, TextAa, Scissors, ClipboardText } from "@phosphor-icons/react";
import { api } from "@/lib/api.ts";
import { useToast } from "@/context/ToastContext.tsx";
import { NoteEditorToolbar } from "@/components/notes/NoteEditorToolbar.tsx";
import { NoteContextMenu, type ContextMenuItem } from "@/components/notes/NoteContextMenu.tsx";

function getMarkdown(editor: Editor): string {
  return (editor.storage as unknown as { markdown: { getMarkdown: () => string } }).markdown.getMarkdown();
}

interface NoteEditorProps {
  /** Remount key for the parent — switching notes (or applying a remote
   * update while not focused) should reinitialize the editor from fresh
   * content rather than trying to patch a live ProseMirror doc in place. */
  noteId: string;
  initialContent: string;
  fontFamily: string;
  editable: boolean;
  onUpdateMarkdown: (markdown: string) => void;
  onFontChange: (cssFamily: string) => void;
}

export function NoteEditor({ noteId, initialContent, fontFamily, editable, onUpdateMarkdown, onFontChange }: NoteEditorProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);

  const editor = useEditor(
    {
      extensions: [
        StarterKit.configure({
          link: { openOnClick: false, autolink: true, HTMLAttributes: { class: "text-brand underline" } },
        }),
        Image.configure({ HTMLAttributes: { class: "rounded-lg max-w-full" } }),
        TaskList,
        TaskItem.configure({ nested: true }),
        Placeholder.configure({ placeholder: "Start typing…" }),
        CharacterCount,
        Markdown.configure({ html: false, transformPastedText: true, transformCopiedText: true }),
      ],
      content: initialContent,
      editable,
      onUpdate: ({ editor }) => {
        onUpdateMarkdown(getMarkdown(editor));
      },
      editorProps: {
        attributes: { class: "note-prose focus:outline-none" },
      },
    },
    [noteId]
  );

  useEffect(() => {
    editor?.setEditable(editable);
  }, [editor, editable]);

  if (!editor) return null;

  const insertImage = async (file: File) => {
    try {
      const { url } = await api.noteImages.upload(file);
      editor.chain().focus().setImage({ src: api.noteImages.absoluteUrl(url) }).run();
    } catch {
      toast("Couldn't upload that image", "error");
    }
  };

  const onFileChosen = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) void insertImage(file);
  };

  const onContextMenu = (e: MouseEvent) => {
    e.preventDefault();
    setMenu({ x: e.clientX, y: e.clientY });
  };

  const selectedText = () => editor.state.doc.textBetween(editor.state.selection.from, editor.state.selection.to, " ");

  const contextItems: ContextMenuItem[] = [
    {
      label: "Copy",
      icon: <Copy className="h-4 w-4" />,
      disabled: editor.state.selection.empty,
      onSelect: () => navigator.clipboard.writeText(selectedText()),
    },
    {
      label: "Copy note as Markdown",
      icon: <TextAa className="h-4 w-4" />,
      onSelect: () => navigator.clipboard.writeText(getMarkdown(editor)),
    },
    ...(editable
      ? [
          {
            label: "Cut",
            icon: <Scissors className="h-4 w-4" />,
            disabled: editor.state.selection.empty,
            onSelect: () => {
              navigator.clipboard.writeText(selectedText());
              editor.chain().focus().deleteSelection().run();
            },
          },
          {
            label: "Paste",
            icon: <ClipboardText className="h-4 w-4" />,
            onSelect: async () => {
              try {
                const text = await navigator.clipboard.readText();
                editor.chain().focus().insertContent(text).run();
              } catch {
                toast("Clipboard access was blocked by the browser", "info");
              }
            },
          },
        ]
      : []),
  ];

  const characterCountStorage = (editor.storage as unknown as { characterCount?: { characters: () => number; words: () => number } })
    .characterCount;
  const characters = characterCountStorage?.characters() ?? 0;
  const words = characterCountStorage?.words() ?? 0;

  return (
    <div style={{ fontFamily }} className="flex flex-1 flex-col gap-3" onContextMenu={onContextMenu}>
      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={onFileChosen} />
      {editable && <NoteEditorToolbar editor={editor} fontFamily={fontFamily} onFontChange={onFontChange} onInsertImage={() => fileInputRef.current?.click()} />}

      <EditorContent editor={editor} className="min-h-[45vh] flex-1" />

      <p className="text-right text-xs text-text-secondary">
        {words} {words === 1 ? "word" : "words"} · {characters} {characters === 1 ? "character" : "characters"}
      </p>

      {menu && <NoteContextMenu x={menu.x} y={menu.y} items={contextItems} onClose={() => setMenu(null)} />}
    </div>
  );
}

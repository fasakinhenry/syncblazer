import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import Collaboration from "@tiptap/extension-collaboration";
import CollaborationCaret from "@tiptap/extension-collaboration-caret";
import { useEffect, useRef, useState, type ChangeEvent, type MouseEvent } from "react";
import { Copy, TextAa, Scissors, ClipboardText } from "@phosphor-icons/react";
import { api } from "@/lib/api.ts";
import { useToast } from "@/context/ToastContext.tsx";
import { createBaseNoteExtensions } from "@/lib/noteEditorExtensions.ts";
import { NOTE_YJS_FIELD } from "@/lib/noteYjsSeed.ts";
import type { NoteCollabHandle } from "@/hooks/useNoteCollab.ts";
import { NoteEditorToolbar } from "@/components/notes/NoteEditorToolbar.tsx";
import { NoteContextMenu, type ContextMenuItem } from "@/components/notes/NoteContextMenu.tsx";
import type { SelectedCollaborator } from "@/components/notes/UserDetailsModal.tsx";

function getMarkdown(editor: Editor): string {
  return (editor.storage as unknown as { markdown: { getMarkdown: () => string } }).markdown.getMarkdown();
}

interface CaretUser {
  name?: string;
  color?: string;
  avatarUrl?: string;
  email?: string;
}

/** Custom cursor for another live collaborator: a small, clickable avatar
 * bubble floating above the caret line instead of TipTap's default
 * text-label pill — hovering it (native title attribute) shows the
 * person's name, clicking it opens UserDetailsModal. `onClickRef` is a ref
 * (not the callback directly) so this renderer stays a stable function —
 * it's only ever created once per editor instance, but should always call
 * whatever the latest onSelectCollaborator prop is. */
function createCaretRenderer(onClickRef: { current: (user: CaretUser) => void }) {
  return (user: CaretUser): HTMLElement => {
    const color = typeof user.color === "string" && /^#[0-9a-fA-F]{6}$/.test(user.color) ? user.color : "#94a3b8";
    const name = user.name || "Someone";

    const caret = document.createElement("span");
    caret.classList.add("collaboration-carets__caret");
    caret.style.borderColor = color;

    const avatar = document.createElement(user.avatarUrl ? "img" : "span");
    avatar.classList.add("collaboration-carets__avatar");
    avatar.style.borderColor = color;
    avatar.title = name;
    avatar.setAttribute("role", "button");
    avatar.tabIndex = 0;
    if (user.avatarUrl) {
      (avatar as HTMLImageElement).src = user.avatarUrl;
      (avatar as HTMLImageElement).alt = name;
    } else {
      avatar.textContent = name.charAt(0).toUpperCase();
      avatar.style.backgroundColor = color;
    }
    avatar.addEventListener("click", (e) => {
      e.stopPropagation();
      onClickRef.current(user);
    });
    caret.appendChild(avatar);

    return caret;
  };
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
  /** When present and `ready`, the document is Yjs-backed for live
   * collaborative editing instead of the plain content string — see
   * useNoteCollab.ts. Omitted/not-ready falls back to today's plain-text
   * editor (offline, or before the collab join handshake completes). */
  collab?: NoteCollabHandle | null;
  /** Clicking a live cursor's avatar opens UserDetailsModal with this. */
  onSelectCollaborator?: (user: SelectedCollaborator) => void;
}

export function NoteEditor({
  noteId,
  initialContent,
  fontFamily,
  editable,
  onUpdateMarkdown,
  onFontChange,
  collab,
  onSelectCollaborator,
}: NoteEditorProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const activeCollab = collab?.ready ? collab : null;

  const onSelectCollaboratorRef = useRef(onSelectCollaborator);
  onSelectCollaboratorRef.current = onSelectCollaborator;
  const caretClickRef = useRef((user: CaretUser) => {
    onSelectCollaboratorRef.current?.({ name: user.name || "Someone", email: user.email, avatarUrl: user.avatarUrl });
  });
  const caretRenderer = useRef(createCaretRenderer(caretClickRef)).current;

  const editor = useEditor(
    {
      extensions: [
        ...createBaseNoteExtensions({ history: !activeCollab }),
        ...(activeCollab
          ? [
              Collaboration.configure({ document: activeCollab.doc, field: NOTE_YJS_FIELD }),
              CollaborationCaret.configure({
                provider: { awareness: activeCollab.awareness },
                user: activeCollab.localUser,
                render: caretRenderer,
              }),
            ]
          : []),
      ],
      ...(activeCollab ? {} : { content: initialContent }),
      editable,
      onUpdate: ({ editor }) => {
        onUpdateMarkdown(getMarkdown(editor));
      },
      editorProps: {
        attributes: { class: "note-prose focus:outline-none" },
      },
    },
    [noteId, !!activeCollab]
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

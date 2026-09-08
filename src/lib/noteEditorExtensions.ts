import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Placeholder from "@tiptap/extension-placeholder";
import CharacterCount from "@tiptap/extension-character-count";
import { Markdown } from "tiptap-markdown";
import type { AnyExtension, NodeViewRendererProps } from "@tiptap/core";

/** Vanilla-DOM node view (not React — the same approach as the collab
 * cursor renderer in NoteEditor.tsx) so an image node renders with a
 * hover-reveal delete button, without pulling this shared extension list
 * into React-mounting territory: it's also used by the headless editor
 * that seeds a legacy note's Yjs doc (noteYjsSeed.ts), which never
 * actually displays anything and shouldn't need a live React tree just to
 * parse markdown. Deleting removes the whole image node in one action —
 * previously the only way was to select it as a node and press
 * Backspace, which nothing in the UI hinted at. */
function createNoteImageNodeView({ node, editor, getPos }: NodeViewRendererProps) {
  const wrapper = document.createElement("span");
  wrapper.classList.add("note-image-wrapper");

  const img = document.createElement("img");
  img.src = node.attrs.src as string;
  img.alt = (node.attrs.alt as string | null) ?? "";
  img.className = "rounded-lg max-w-full";
  wrapper.appendChild(img);

  if (editor.isEditable) {
    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.classList.add("note-image-delete");
    deleteBtn.setAttribute("aria-label", "Remove image");
    deleteBtn.textContent = "×";
    deleteBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const pos = typeof getPos === "function" ? getPos() : undefined;
      if (typeof pos !== "number") return;
      editor
        .chain()
        .focus()
        .deleteRange({ from: pos, to: pos + node.nodeSize })
        .run();
    });
    wrapper.appendChild(deleteBtn);
  }

  return { dom: wrapper };
}

/** The extension set every note editor instance uses — shared so the
 * one-time markdown -> Yjs seeding step (see noteYjsSeed.ts) parses with
 * the exact same schema the real editor renders with. A schema mismatch
 * there would corrupt formatting the moment collaboration seeds a note
 * that existed before live co-editing shipped.
 *
 * `undoRedo: false` when collaboration is active — Yjs's Collaboration
 * extension brings its own undo/redo (Y.UndoManager); leaving StarterKit's
 * plain undo/redo on too would fight it with a second, unsynced undo stack. */
export function createBaseNoteExtensions(opts: { history: boolean } = { history: true }): AnyExtension[] {
  return [
    StarterKit.configure({
      undoRedo: opts.history ? {} : false,
      link: { openOnClick: false, autolink: true, HTMLAttributes: { class: "text-brand underline" } },
    }),
    Image.extend({ addNodeView: () => createNoteImageNodeView }).configure({
      HTMLAttributes: { class: "rounded-lg max-w-full" },
    }),
    TaskList,
    TaskItem.configure({ nested: true }),
    Placeholder.configure({ placeholder: "Start typing…" }),
    CharacterCount,
    Markdown.configure({ html: false, transformPastedText: true, transformCopiedText: true }),
  ];
}

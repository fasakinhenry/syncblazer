import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Placeholder from "@tiptap/extension-placeholder";
import CharacterCount from "@tiptap/extension-character-count";
import { Markdown } from "tiptap-markdown";
import type { AnyExtension } from "@tiptap/core";

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
    Image.configure({ HTMLAttributes: { class: "rounded-lg max-w-full" } }),
    TaskList,
    TaskItem.configure({ nested: true }),
    Placeholder.configure({ placeholder: "Start typing…" }),
    CharacterCount,
    Markdown.configure({ html: false, transformPastedText: true, transformCopiedText: true }),
  ];
}

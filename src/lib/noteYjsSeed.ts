import { Editor } from "@tiptap/core";
import * as Y from "yjs";
import { prosemirrorJSONToYXmlFragment } from "y-prosemirror";
import { createBaseNoteExtensions } from "@/lib/noteEditorExtensions.ts";

export const NOTE_YJS_FIELD = "default";

/** One-time migration path for a note that existed before live
 * collaboration shipped: fills the note's (empty) Y.Doc from its existing
 * markdown `content` so opening it collaboratively for the first time
 * shows what was already there instead of a blank document. Uses a
 * throwaway headless editor purely to get a ProseMirror doc + matching
 * schema out of the markdown — never mounted, destroyed immediately after. */
export function seedYDocFromMarkdown(doc: Y.Doc, markdown: string): void {
  const temp = new Editor({ extensions: createBaseNoteExtensions({ history: false }), content: markdown });
  try {
    const json = temp.getJSON();
    prosemirrorJSONToYXmlFragment(temp.schema, json, doc.getXmlFragment(NOTE_YJS_FIELD));
  } finally {
    temp.destroy();
  }
}

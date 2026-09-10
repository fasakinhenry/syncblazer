import { useEffect } from "react";

const DEFAULT_TITLE = "SyncBlaze: Send Files Between Devices Instantly, Free";
const DEFAULT_DESCRIPTION =
  "SyncBlaze moves files, photos, notes, and links between your phone, laptop, and other devices instantly over your own network, no cloud upload, no cable, no emailing yourself. Free, with end-to-end encrypted room chat.";

/** Sets a page-specific <title> and meta description while mounted, and
 * restores the site default on unmount. Search engines (and browser tabs,
 * social unfurls that execute JS) see a distinct, keyword-relevant title
 * per route instead of every page sharing index.html's one generic title. */
export function useDocumentTitle(title: string, description?: string) {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = title;

    const descriptionTag = document.querySelector('meta[name="description"]');
    const previousDescription = descriptionTag?.getAttribute("content") ?? null;
    if (description && descriptionTag) descriptionTag.setAttribute("content", description);

    return () => {
      document.title = previousTitle;
      if (previousDescription !== null && descriptionTag) descriptionTag.setAttribute("content", previousDescription);
    };
  }, [title, description]);
}

export { DEFAULT_TITLE, DEFAULT_DESCRIPTION };

import { FolderOpen, UploadSimple } from "@phosphor-icons/react";

/** Small "choose files or a folder" menu, anchored under whatever Send
 * button opened it — shared by every room's send flow (PublicRoomPage,
 * RoomDetailPage) so file-vs-folder picking looks and works the same
 * everywhere devices can be sent to. */
export function SendDropdown({
  onPickFiles,
  onPickFolder,
  onClose,
  align = "right",
}: {
  onPickFiles: () => void;
  onPickFolder: () => void;
  onClose: () => void;
  align?: "left" | "right";
}) {
  return (
    <>
      <button aria-label="Close menu" className="fixed inset-0 z-10 cursor-default" onClick={onClose} />
      <div className={`absolute top-full z-20 mt-1 w-44 rounded-lg border border-border bg-surface p-1 shadow-lg ${align === "right" ? "right-0" : "left-0"}`}>
        <button
          onClick={onPickFiles}
          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-text-primary hover:bg-surface-hover"
        >
          <UploadSimple className="h-4 w-4" />
          Choose files
        </button>
        <button
          onClick={onPickFolder}
          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-text-primary hover:bg-surface-hover"
        >
          <FolderOpen className="h-4 w-4" />
          Choose a folder
        </button>
      </div>
    </>
  );
}

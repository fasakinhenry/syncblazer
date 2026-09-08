import { useEffect, useRef, useState } from "react";
import { LockKey, MusicNote } from "@phosphor-icons/react";
import { Avatar } from "@/components/Avatar.tsx";
import { formatRelativeTime } from "@/lib/format.ts";
import type { ChatMessage } from "@/context/RoomChatContext.tsx";
import { useRoomChat } from "@/context/RoomChatContext.tsx";
import { ChatLinkPreview } from "@/components/chat/ChatLinkPreview.tsx";

const URL_PATTERN = /\bhttps?:\/\/[^\s)<>"'\]]+/gi;

function Linkified({ text }: { text: string }) {
  const parts = text.split(URL_PATTERN);
  const urls = text.match(URL_PATTERN) ?? [];
  return (
    <>
      {parts.map((part, i) => (
        <span key={i}>
          {part}
          {urls[i] && (
            <a href={urls[i]} target="_blank" rel="noopener noreferrer" className="text-brand underline">
              {urls[i]}
            </a>
          )}
        </span>
      ))}
    </>
  );
}

function ChatImage({ storageKey, keyB64, ivB64, mimeType }: { storageKey: string; keyB64: string; ivB64: string; mimeType?: string }) {
  const { resolveAttachmentUrl } = useRoomChat();
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;
    resolveAttachmentUrl({ attachmentKey: storageKey, attachmentKeyB64: keyB64, attachmentIvB64: ivB64, mimeType }).then((u) => {
      if (cancelled) return;
      objectUrl = u;
      setUrl(u);
    });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  if (!url) return <div className="flex h-32 w-48 items-center justify-center rounded-lg bg-surface-hover text-xs text-text-secondary">Decrypting…</div>;
  return <img src={url} alt="" className="max-h-64 max-w-64 rounded-lg object-cover" />;
}

function ChatAudio({ storageKey, keyB64, ivB64, mimeType }: { storageKey: string; keyB64: string; ivB64: string; mimeType?: string }) {
  const { resolveAttachmentUrl } = useRoomChat();
  const [url, setUrl] = useState<string | null>(null);
  const fetchedRef = useRef(false);

  const load = () => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    resolveAttachmentUrl({ attachmentKey: storageKey, attachmentKeyB64: keyB64, attachmentIvB64: ivB64, mimeType }).then(setUrl);
  };

  if (!url) {
    return (
      <button
        type="button"
        onClick={load}
        className="flex items-center gap-2 rounded-lg bg-surface-hover px-3 py-2 text-xs text-text-secondary hover:bg-surface"
      >
        <MusicNote className="h-4 w-4" />
        Tap to decrypt and play
      </button>
    );
  }
  // eslint-disable-next-line jsx-a11y/media-has-caption
  return <audio src={url} controls className="h-9 max-w-64" />;
}

export function ChatMessageBubble({ message }: { message: ChatMessage }) {
  const { payload, isMine } = message;

  return (
    <div className={`flex items-end gap-2 ${isMine ? "flex-row-reverse" : ""}`}>
      <Avatar name={message.senderName} src={message.senderAvatarUrl} className="h-7 w-7 text-xs" />
      <div className={`flex max-w-[75%] flex-col gap-0.5 ${isMine ? "items-end" : "items-start"}`}>
        {!isMine && <span className="px-1 text-[11px] font-medium text-text-secondary">{message.senderName}</span>}
        <div
          className={`rounded-2xl px-3 py-2 text-sm ${
            isMine ? "rounded-br-sm bg-brand text-white" : "rounded-bl-sm bg-surface-hover text-text-primary"
          } ${message.pending ? "opacity-60" : ""}`}
        >
          {payload === null ? (
            <span className="flex items-center gap-1.5 text-xs italic opacity-70">
              <LockKey className="h-3.5 w-3.5" />
              Encrypted message
            </span>
          ) : payload.attachmentKey && message.type === "image" ? (
            <ChatImage
              storageKey={payload.attachmentKey}
              keyB64={payload.attachmentKeyB64!}
              ivB64={payload.attachmentIvB64!}
              mimeType={payload.mimeType}
            />
          ) : payload.attachmentKey && message.type === "audio" ? (
            <ChatAudio
              storageKey={payload.attachmentKey}
              keyB64={payload.attachmentKeyB64!}
              ivB64={payload.attachmentIvB64!}
              mimeType={payload.mimeType}
            />
          ) : (
            <>
              {payload.text && <Linkified text={payload.text} />}
              {payload.linkPreviewUrl && <ChatLinkPreview url={payload.linkPreviewUrl} />}
            </>
          )}
        </div>
        <span className="px-1 text-[10px] text-text-secondary">{formatRelativeTime(message.createdAt)}</span>
      </div>
    </div>
  );
}

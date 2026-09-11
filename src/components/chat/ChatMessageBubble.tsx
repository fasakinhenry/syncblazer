import { useEffect, useRef, useState } from "react";
import { Copy, DotsThreeVertical, LockKey, Pause, PencilSimple, Play, Spinner, TrashSimple } from "@phosphor-icons/react";
import { Avatar } from "@/components/Avatar.tsx";
import { formatRelativeTime } from "@/lib/format.ts";
import type { ChatMessage } from "@/context/RoomChatContext.tsx";
import { useRoomChat } from "@/context/RoomChatContext.tsx";
import { ChatLinkPreview } from "@/components/chat/ChatLinkPreview.tsx";
import { WaveformBars } from "@/components/chat/WaveformBars.tsx";
import { Lightbox } from "@/components/chat/Lightbox.tsx";
import { useToast } from "@/context/ToastContext.tsx";

function formatDuration(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

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
  const [expanded, setExpanded] = useState(false);

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
  return (
    <>
      <img
        src={url}
        alt=""
        onClick={() => setExpanded(true)}
        className="max-h-64 max-w-64 cursor-zoom-in rounded-lg object-cover"
      />
      {expanded && <Lightbox src={url} onClose={() => setExpanded(false)} />}
    </>
  );
}

interface ChatAudioProps {
  storageKey: string;
  keyB64: string;
  ivB64: string;
  mimeType?: string;
  waveform?: number[];
  durationSec?: number;
  isMine: boolean;
}

const FALLBACK_BARS = new Array(40).fill(0.35);

function ChatAudio({ storageKey, keyB64, ivB64, mimeType, waveform, durationSec, isMine }: ChatAudioProps) {
  const { resolveAttachmentUrl } = useRoomChat();
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(durationSec ?? 0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const wantsPlayRef = useRef(false);

  useEffect(() => {
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  useEffect(() => {
    if (url && wantsPlayRef.current) {
      wantsPlayRef.current = false;
      void audioRef.current?.play();
    }
  }, [url]);

  const togglePlay = async () => {
    if (playing) {
      audioRef.current?.pause();
      return;
    }
    if (!url) {
      setLoading(true);
      wantsPlayRef.current = true;
      const resolved = await resolveAttachmentUrl({ attachmentKey: storageKey, attachmentKeyB64: keyB64, attachmentIvB64: ivB64, mimeType });
      setLoading(false);
      if (!resolved) return;
      setUrl(resolved);
      return;
    }
    void audioRef.current?.play();
  };

  return (
    <div className="flex w-56 items-center gap-2">
      <audio
        ref={audioRef}
        src={url ?? undefined}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          setProgress(0);
        }}
        onTimeUpdate={(e) => {
          const el = e.currentTarget;
          if (el.duration && Number.isFinite(el.duration)) setProgress(el.currentTime / el.duration);
        }}
        onLoadedMetadata={(e) => {
          const d = e.currentTarget.duration;
          if (Number.isFinite(d)) setDuration(d);
        }}
        className="hidden"
      />
      <button
        type="button"
        onClick={togglePlay}
        disabled={loading}
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
          isMine ? "bg-white/20 text-white" : "bg-brand text-white"
        }`}
        aria-label={playing ? "Pause voice note" : "Play voice note"}
      >
        {loading ? (
          <Spinner className="h-4 w-4 animate-spin" />
        ) : playing ? (
          <Pause className="h-3.5 w-3.5" weight="fill" />
        ) : (
          <Play className="h-3.5 w-3.5" weight="fill" />
        )}
      </button>
      <WaveformBars
        levels={waveform && waveform.length > 0 ? waveform : FALLBACK_BARS}
        progress={progress}
        activeColor={isMine ? "#FFFFFF" : "var(--color-brand, #287BFF)"}
        mutedColor={isMine ? "#FFFFFF" : "currentColor"}
        className="flex-1"
      />
      <span className={`shrink-0 font-mono text-[10px] ${isMine ? "text-white/80" : "text-text-secondary"}`}>
        {formatDuration(playing || progress > 0 ? progress * duration : duration)}
      </span>
    </div>
  );
}

export function ChatMessageBubble({ message }: { message: ChatMessage }) {
  const { payload, isMine } = message;
  const { deleteMessage, startEditing } = useRoomChat();
  const { toast } = useToast();
  const [menuOpen, setMenuOpen] = useState(false);

  const canCopy = !message.deleted && !!payload?.text;
  const canEdit = isMine && !message.deleted && message.type === "text" && !message.pending;
  const canDelete = isMine && !message.deleted && !message.pending;
  const hasMenu = canCopy || canEdit || canDelete;

  const onCopy = () => {
    if (payload?.text) navigator.clipboard.writeText(payload.text);
    setMenuOpen(false);
    toast("Copied", "success");
  };
  const onEdit = () => {
    if (payload?.text) startEditing(message._id, payload.text);
    setMenuOpen(false);
  };
  const onDelete = () => {
    if (window.confirm("Delete this message?")) deleteMessage(message._id);
    setMenuOpen(false);
  };

  return (
    <div className={`group flex items-end gap-2 ${isMine ? "flex-row-reverse" : ""}`}>
      <Avatar name={message.senderName} src={message.senderAvatarUrl} className="h-7 w-7 text-xs" />
      <div className={`flex max-w-[75%] flex-col gap-0.5 ${isMine ? "items-end" : "items-start"}`}>
        {!isMine && <span className="px-1 text-[11px] font-medium text-text-secondary">{message.senderName}</span>}
        <div className={`flex items-center gap-1 ${isMine ? "flex-row-reverse" : ""}`}>
          <div
            className={`rounded-2xl px-3 py-2 text-sm ${
              isMine ? "rounded-br-sm bg-brand text-white" : "rounded-bl-sm bg-surface-hover text-text-primary"
            } ${message.pending ? "opacity-60" : ""}`}
          >
            {message.deleted ? (
              <span className="text-xs italic opacity-70">Message deleted</span>
            ) : payload === null ? (
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
                waveform={payload.waveform}
                durationSec={payload.durationSec}
                isMine={isMine}
              />
            ) : (
              <>
                {payload.text && <Linkified text={payload.text} />}
                {payload.linkPreviewUrl && <ChatLinkPreview url={payload.linkPreviewUrl} />}
              </>
            )}
          </div>
          {hasMenu && (
            <div className="relative shrink-0 opacity-0 transition-opacity group-hover:opacity-100">
              <button
                onClick={() => setMenuOpen((v) => !v)}
                aria-label="Message actions"
                className="rounded-full p-1 text-text-secondary hover:bg-surface-hover"
              >
                <DotsThreeVertical className="h-4 w-4" />
              </button>
              {menuOpen && (
                <>
                  <button aria-label="Close menu" className="fixed inset-0 z-10 cursor-default" onClick={() => setMenuOpen(false)} />
                  <div
                    className={`absolute top-full z-20 mt-1 w-36 rounded-lg border border-border bg-surface p-1 shadow-lg ${
                      isMine ? "right-0" : "left-0"
                    }`}
                  >
                    {canCopy && (
                      <button
                        onClick={onCopy}
                        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-text-primary hover:bg-surface-hover"
                      >
                        <Copy className="h-3.5 w-3.5" />
                        Copy
                      </button>
                    )}
                    {canEdit && (
                      <button
                        onClick={onEdit}
                        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-text-primary hover:bg-surface-hover"
                      >
                        <PencilSimple className="h-3.5 w-3.5" />
                        Edit
                      </button>
                    )}
                    {canDelete && (
                      <button
                        onClick={onDelete}
                        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-danger hover:bg-danger/10"
                      >
                        <TrashSimple className="h-3.5 w-3.5" />
                        Delete
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
        <span className="px-1 text-[10px] text-text-secondary">
          {formatRelativeTime(message.createdAt)}
          {message.edited ? " · edited" : ""}
        </span>
      </div>
    </div>
  );
}

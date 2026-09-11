import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { Image, Microphone, PaperPlaneTilt, PencilSimple, Stop, Trash, X } from "@phosphor-icons/react";
import { useToast } from "@/context/ToastContext.tsx";
import { useRoomChat } from "@/context/RoomChatContext.tsx";
import { extractUrls } from "@/lib/linkPreviewCache.ts";
import { useVoiceRecorder } from "@/hooks/useVoiceRecorder.ts";
import { WaveformBars } from "@/components/chat/WaveformBars.tsx";

function formatElapsed(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function ChatComposer() {
  const { sendText, sendAttachment, editMessage, editingTarget, cancelEditing, notifyTyping } = useRoomChat();
  const { toast } = useToast();
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const { recording, liveBars, elapsedSec, start, stop, cancel } = useVoiceRecorder((message) => toast(message, "error"));

  const hasText = text.trim().length > 0;

  useEffect(() => {
    if (editingTarget) setText(editingTarget.text);
  }, [editingTarget]);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;
    if (editingTarget) {
      editMessage(editingTarget.id, trimmed);
      cancelEditing();
      setText("");
      return;
    }
    const [firstUrl] = extractUrls(trimmed);
    sendText(trimmed, firstUrl);
    setText("");
  };

  const onPickImage = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast("That doesn't look like an image", "error");
      return;
    }
    await sendAttachment(file, "image");
  };

  const onMicClick = async () => {
    if (hasText) return;
    await start();
  };

  const onStopAndSend = async () => {
    setSending(true);
    const result = await stop();
    setSending(false);
    if (!result) return;
    await sendAttachment(result.file, "audio", { waveform: result.waveform, durationSec: result.durationSec });
  };

  if (recording) {
    return (
      <div className="flex items-center gap-2 border-t border-border bg-surface p-3">
        <button
          type="button"
          onClick={cancel}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-text-secondary transition-colors hover:bg-danger/10 hover:text-danger"
          aria-label="Cancel recording"
          title="Cancel recording"
        >
          <Trash className="h-4 w-4" />
        </button>
        <div className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-full border border-danger/30 bg-background px-3">
          <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-danger" />
          <WaveformBars levels={liveBars} className="min-w-0 flex-1 text-danger" />
          <span className="shrink-0 font-mono text-xs text-text-secondary">{formatElapsed(elapsedSec)}</span>
        </div>
        <button
          type="button"
          onClick={onStopAndSend}
          disabled={sending}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand text-white transition-opacity disabled:opacity-60"
          aria-label="Stop and send voice note"
          title="Stop and send"
        >
          <Stop className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="border-t border-border bg-surface">
      {editingTarget && (
        <div className="flex items-center gap-2 border-b border-border bg-brand-soft px-3 py-1.5 text-xs text-brand">
          <PencilSimple className="h-3.5 w-3.5 shrink-0" />
          <span className="flex-1">Editing message</span>
          <button
            type="button"
            onClick={() => {
              cancelEditing();
              setText("");
            }}
            aria-label="Cancel edit"
            className="rounded p-0.5 hover:bg-brand/10"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
      <form onSubmit={onSubmit} className="flex items-center gap-2 p-3">
        <input ref={imageInputRef} type="file" accept="image/*" className="hidden" onChange={onPickImage} />
        {!editingTarget && (
          <button
            type="button"
            onClick={() => imageInputRef.current?.click()}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-text-secondary transition-colors hover:bg-surface-hover"
            aria-label="Attach image"
            title="Attach image"
          >
            <Image className="h-4 w-4" />
          </button>
        )}
        <input
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            notifyTyping();
          }}
          placeholder={editingTarget ? "Edit message" : "Message"}
          className="h-9 flex-1 rounded-full border border-border bg-background px-4 text-sm text-text-primary focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
        />
        {hasText ? (
          <button
            type="submit"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand text-white"
            aria-label={editingTarget ? "Save edit" : "Send"}
          >
            <PaperPlaneTilt className="h-4 w-4" />
          </button>
        ) : (
          <button
            type="button"
            onClick={onMicClick}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-text-secondary transition-colors hover:bg-surface-hover"
            aria-label="Record a voice note"
            title="Record a voice note"
          >
            <Microphone className="h-4 w-4" />
          </button>
        )}
      </form>
    </div>
  );
}

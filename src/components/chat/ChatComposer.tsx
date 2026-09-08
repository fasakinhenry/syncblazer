import { useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { Image, Microphone, PaperPlaneTilt, Stop } from "@phosphor-icons/react";
import { useToast } from "@/context/ToastContext.tsx";
import { useRoomChat } from "@/context/RoomChatContext.tsx";
import { extractUrls } from "@/lib/linkPreviewCache.ts";

export function ChatComposer() {
  const { sendText, sendAttachment, notifyTyping } = useRoomChat();
  const { toast } = useToast();
  const [text, setText] = useState("");
  const [recording, setRecording] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;
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

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (evt) => {
        if (evt.data.size > 0) chunksRef.current.push(evt.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        const file = new File([blob], "voice-note.webm", { type: blob.type });
        await sendAttachment(file, "audio");
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setRecording(true);
    } catch {
      toast("Couldn't access your microphone", "error");
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    mediaRecorderRef.current = null;
    setRecording(false);
  };

  return (
    <form onSubmit={onSubmit} className="flex items-center gap-2 border-t border-border bg-surface p-3">
      <input ref={imageInputRef} type="file" accept="image/*" className="hidden" onChange={onPickImage} />
      <button
        type="button"
        onClick={() => imageInputRef.current?.click()}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-text-secondary transition-colors hover:bg-surface-hover"
        aria-label="Attach image"
        title="Attach image"
      >
        <Image className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={recording ? stopRecording : startRecording}
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors ${
          recording ? "bg-danger/10 text-danger" : "text-text-secondary hover:bg-surface-hover"
        }`}
        aria-label={recording ? "Stop recording" : "Record a voice note"}
        title={recording ? "Stop recording" : "Record a voice note"}
      >
        {recording ? <Stop className="h-4 w-4" /> : <Microphone className="h-4 w-4" />}
      </button>
      <input
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          notifyTyping();
        }}
        placeholder={recording ? "Recording…" : "Message"}
        disabled={recording}
        className="h-9 flex-1 rounded-full border border-border bg-background px-4 text-sm text-text-primary focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand disabled:opacity-60"
      />
      <button
        type="submit"
        disabled={!text.trim()}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand text-white transition-opacity disabled:opacity-40"
        aria-label="Send"
      >
        <PaperPlaneTilt className="h-4 w-4" />
      </button>
    </form>
  );
}

import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, LockKey } from "@phosphor-icons/react";
import { api } from "@/lib/api.ts";
import type { Room } from "@/lib/types.ts";
import { RoomChatProvider, useRoomChat } from "@/context/RoomChatContext.tsx";
import { ChatMessageBubble } from "@/components/chat/ChatMessageBubble.tsx";
import { ChatComposer } from "@/components/chat/ChatComposer.tsx";
import { PageSpinner } from "@/components/ui/Spinner.tsx";
import { Button } from "@/components/ui/Button.tsx";

function ChatBody() {
  const { ready, messages, hasMore, loadingMore, loadMore, someoneTyping } = useRoomChat();
  const scrollRef = useRef<HTMLDivElement>(null);
  const prevLengthRef = useRef(0);

  useEffect(() => {
    if (messages.length > prevLengthRef.current) {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
    }
    prevLengthRef.current = messages.length;
  }, [messages.length]);

  if (!ready) return <PageSpinner />;

  return (
    <>
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4">
        {hasMore && (
          <div className="mb-3 flex justify-center">
            <Button variant="secondary" size="sm" loading={loadingMore} onClick={loadMore}>
              Load earlier messages
            </Button>
          </div>
        )}
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 py-16 text-center text-text-secondary">
            <LockKey className="h-6 w-6" />
            <p className="text-sm">No messages yet. Say hello — it's end-to-end encrypted.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {messages.map((msg) => (
              <ChatMessageBubble key={msg._id} message={msg} />
            ))}
          </div>
        )}
        {someoneTyping && <p className="mt-2 px-1 text-xs italic text-text-secondary">Someone is typing…</p>}
      </div>
      <ChatComposer />
    </>
  );
}

export function RoomChatPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const [room, setRoom] = useState<Room | null>(null);

  useEffect(() => {
    if (!roomId) return;
    api.rooms.get(roomId).then(({ room }) => setRoom(room));
  }, [roomId]);

  if (!roomId) return null;

  return (
    <div className="mx-auto flex h-[calc(100vh-8rem)] max-w-2xl flex-col overflow-hidden rounded-xl border border-border bg-surface">
      <div className="flex items-center gap-3 border-b border-border px-4 py-3">
        <button
          onClick={() => navigate(`/rooms/${roomId}`)}
          className="rounded-md p-2 text-text-secondary hover:bg-surface-hover"
          aria-label="Back"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-text-primary">{room?.name ?? "Chat"}</p>
          <p className="flex items-center gap-1 text-xs text-text-secondary">
            <LockKey className="h-3 w-3" />
            End-to-end encrypted
          </p>
        </div>
      </div>
      <RoomChatProvider roomId={roomId}>
        <ChatBody />
      </RoomChatProvider>
    </div>
  );
}

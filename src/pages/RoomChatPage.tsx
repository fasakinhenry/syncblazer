import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, LockKey } from "@phosphor-icons/react";
import { api } from "@/lib/api.ts";
import type { Room, RoomMember } from "@/lib/types.ts";
import { RoomChatProvider, useRoomChat } from "@/context/RoomChatContext.tsx";
import { useNotifications } from "@/context/NotificationContext.tsx";
import { ChatMessageBubble } from "@/components/chat/ChatMessageBubble.tsx";
import { ChatComposer } from "@/components/chat/ChatComposer.tsx";
import { PageSpinner } from "@/components/ui/Spinner.tsx";
import { Button } from "@/components/ui/Button.tsx";

function typingLabel(names: string[]): string {
  if (names.length === 1) return `${names[0]} is typing…`;
  if (names.length === 2) return `${names[0]} and ${names[1]} are typing…`;
  return `${names[0]} and ${names.length - 1} others are typing…`;
}

function ChatBody() {
  const { ready, messages, hasMore, loadingMore, loadMore, typingNames } = useRoomChat();
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
            <p className="text-sm">No messages yet. Say hello, it's private and encrypted.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {messages.map((msg) => (
              <ChatMessageBubble key={msg._id} message={msg} />
            ))}
          </div>
        )}
        {typingNames.length > 0 && (
          <p className="mt-2 px-1 text-xs italic text-text-secondary">{typingLabel(typingNames)}</p>
        )}
      </div>
      <ChatComposer />
    </>
  );
}

export function RoomChatPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const [room, setRoom] = useState<Room | null>(null);
  const [members, setMembers] = useState<RoomMember[]>([]);
  const { clearRoomChatUnread } = useNotifications();

  useEffect(() => {
    if (!roomId) return;
    api.rooms.get(roomId).then(({ room, members }) => {
      setRoom(room);
      setMembers(members);
    });
  }, [roomId]);

  // Opening chat counts as reading it — clears this room's badge on the
  // Room page / Activity page, same as RoomChatContext's own local
  // chatReadState.markRead(...) already does for RoomDetailPage's badge.
  useEffect(() => {
    if (roomId) clearRoomChatUnread(roomId);
  }, [roomId, clearRoomChatUnread]);

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
      <RoomChatProvider roomId={roomId} members={members}>
        <ChatBody />
      </RoomChatProvider>
    </div>
  );
}

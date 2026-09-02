import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { File as FileIcon, Fire, Plus, SignIn, Note as NoteIcon, WifiHigh, ArrowRight } from "@phosphor-icons/react";
import { useAuth } from "@/context/AuthContext.tsx";
import { useRooms } from "@/context/RoomContext.tsx";
import { useToast } from "@/context/ToastContext.tsx";
import { api, ApiClientError } from "@/lib/api.ts";
import { takePendingRoomJoin } from "@/lib/pendingRoomJoin.ts";
import { LocalNetworkSection } from "@/components/rooms/LocalNetworkSection.tsx";
import { RoomCard } from "@/components/rooms/RoomCard.tsx";
import { CreateRoomModal } from "@/components/rooms/CreateRoomModal.tsx";
import { JoinRoomModal } from "@/components/rooms/JoinRoomModal.tsx";
import { Button } from "@/components/ui/Button.tsx";
import { PageSpinner } from "@/components/ui/Spinner.tsx";
import { InstallAppButton } from "@/components/InstallAppButton.tsx";

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export function RoomPage() {
  const { user } = useAuth();
  const { rooms, loading, refresh } = useRooms();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [createOpen, setCreateOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);

  useEffect(() => {
    const code = takePendingRoomJoin();
    if (!code) return;
    api.rooms
      .join(code)
      .then(({ room }) => {
        toast(`Joined "${room.name}"`, "success");
        navigate(`/rooms/${room._id}`, { replace: true });
      })
      .catch((err) => {
        toast(err instanceof ApiClientError ? err.message : "That room link didn't work", "error");
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) return <PageSpinner />;

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-10">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-text-secondary">
            {greeting()}
            {user ? `, ${user.name.split(" ")[0]}` : ""}.
          </p>
          <h1 className="text-2xl font-semibold text-text-primary">Your workspace</h1>
        </div>
        <InstallAppButton />
      </div>

      <Link
        to="/local-session"
        className="flex items-center gap-4 rounded-xl border border-brand/30 bg-brand-soft p-4 transition-colors hover:border-brand"
      >
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-brand text-white">
          <WifiHigh className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-medium text-text-primary">Local session — works with zero internet</p>
          <p className="text-sm text-text-secondary">
            Connect over hotspot or Wi-Fi with a QR code and send files directly, even with no one online.
          </p>
        </div>
        <ArrowRight className="h-5 w-5 shrink-0 text-brand" />
      </Link>

      <LocalNetworkSection />

      <section>
        <h2 className="mb-3 text-sm font-semibold text-text-secondary">Quick actions</h2>
        <div className="grid grid-cols-3 gap-3">
          <Link
            to="/blaze"
            className="flex flex-col items-center gap-2 rounded-xl border border-brand bg-brand-soft p-4 text-brand"
          >
            <Fire className="h-5 w-5" />
            <span className="text-sm font-medium">Blaze</span>
          </Link>
          <Link
            to="/notes"
            className="flex flex-col items-center gap-2 rounded-xl border border-border bg-surface p-4 text-text-primary hover:bg-surface-hover"
          >
            <NoteIcon className="h-5 w-5" />
            <span className="text-sm font-medium">Note</span>
          </Link>
          <Link
            to="/blaze"
            className="flex flex-col items-center gap-2 rounded-xl border border-border bg-surface p-4 text-text-primary hover:bg-surface-hover"
          >
            <FileIcon className="h-5 w-5" />
            <span className="text-sm font-medium">File</span>
          </Link>
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-text-secondary">Your rooms</h2>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={() => setJoinOpen(true)} className="gap-1.5">
              <SignIn className="h-4 w-4" />
              Join
            </Button>
            <Button size="sm" onClick={() => setCreateOpen(true)} className="gap-1.5">
              <Plus className="h-4 w-4" />
              New room
            </Button>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rooms.map((room) => (
            <RoomCard key={room._id} room={room} />
          ))}
        </div>
      </section>

      <CreateRoomModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(room) => {
          void refresh();
          sessionStorage.setItem("syncblaze.celebrateRoomId", room._id);
          navigate(`/rooms/${room._id}`);
        }}
      />
      <JoinRoomModal
        open={joinOpen}
        onClose={() => setJoinOpen(false)}
        onJoined={(room) => {
          void refresh();
          navigate(`/rooms/${room._id}`);
        }}
      />
    </div>
  );
}

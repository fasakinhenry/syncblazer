import { lazy, Suspense, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useRooms } from "@/context/RoomContext.tsx";
import { api } from "@/lib/api.ts";
import { PageSpinner } from "@/components/ui/Spinner.tsx";

const RoomDetailPage = lazy(() => import("@/pages/RoomDetailPage.tsx").then((m) => ({ default: m.RoomDetailPage })));
const PublicRoomPage = lazy(() => import("@/pages/PublicRoomPage.tsx").then((m) => ({ default: m.PublicRoomPage })));

/** The one thing this component does: pick which room page to render,
 * without changing RoomDetailPage.tsx (and everything it already does for
 * personal/project/instant/shared rooms) at all. Tries the room list
 * RoomContext already has loaded first (no extra fetch, the common case);
 * only falls back to a direct lookup when the room isn't in that list yet
 * (e.g. landing here right after joining a public room for the first
 * time, before the context has refreshed) — matters specifically for
 * public rooms, since defaulting to the wrong page in that race would be
 * the wrong page for the room that most needs this to work correctly. */
export function RoomEntryPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const { rooms, loading } = useRooms();
  const [fallbackType, setFallbackType] = useState<string | null>(null);
  const [fallbackChecked, setFallbackChecked] = useState(false);

  const knownRoom = rooms.find((r) => r._id === roomId);

  useEffect(() => {
    if (loading || knownRoom || !roomId) return;
    let cancelled = false;
    api.rooms
      .get(roomId)
      .then(({ room }) => {
        if (!cancelled) setFallbackType(room.type);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setFallbackChecked(true);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, knownRoom, roomId]);

  if (loading) return <PageSpinner />;
  if (!knownRoom && !fallbackChecked) return <PageSpinner />;

  const isPublic = (knownRoom?.type ?? fallbackType) === "public";

  return (
    <Suspense fallback={<PageSpinner />}>
      {isPublic ? <PublicRoomPage /> : <RoomDetailPage />}
    </Suspense>
  );
}

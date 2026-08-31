import { useEffect, useState } from "react";
import { ClockCounterClockwise } from "@phosphor-icons/react";
import { api } from "@/lib/api.ts";
import type { Activity } from "@/lib/types.ts";
import { formatRelativeTime } from "@/lib/format.ts";

export function NoteActivityPanel({ noteId, roomId }: { noteId: string; roomId: string }) {
  const [activity, setActivity] = useState<Activity[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.activity.list(roomId).then(({ activity }) => {
      if (cancelled) return;
      setActivity(activity.filter((item) => item.metadata?.noteId === noteId));
    });
    return () => {
      cancelled = true;
    };
  }, [noteId, roomId]);

  if (!activity || activity.length === 0) return null;

  return (
    <div className="flex flex-col gap-2 border-t border-border pt-4">
      <div className="flex items-center gap-1.5">
        <ClockCounterClockwise className="h-3.5 w-3.5 text-text-secondary" />
        <p className="text-xs font-medium uppercase tracking-wide text-text-secondary">Activity</p>
      </div>
      <ul className="flex flex-col gap-1.5">
        {activity.slice(0, 8).map((item) => (
          <li key={item._id} className="flex items-center justify-between gap-3 text-xs">
            <span className="truncate text-text-secondary">{item.message}</span>
            <span className="shrink-0 text-text-secondary/70">{formatRelativeTime(item.createdAt)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Per-device "have I seen this room's chat" tracking — deliberately local
// (localStorage), not synced to the server: it's a UI convenience (should
// I show an unread dot?), not something that needs to be consistent
// across devices the way the messages themselves do.
const PREFIX = "syncblaze.chatLastRead.";

export function getLastRead(roomId: string): number {
  const raw = localStorage.getItem(PREFIX + roomId);
  return raw ? Number(raw) || 0 : 0;
}

export function markRead(roomId: string, at: number = Date.now()) {
  const current = getLastRead(roomId);
  if (at > current) localStorage.setItem(PREFIX + roomId, String(at));
}

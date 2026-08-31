const KEY = "syncblaze.pendingRoomJoin";

/** Captures ?joinRoom=CODE from the URL a visitor actually landed on, before
 * any auth redirect (landing -> login -> room) strips the query string, so
 * scanning a room's QR code still joins it even for a signed-out visitor. */
export function capturePendingRoomJoinFromUrl(): void {
  const code = new URLSearchParams(window.location.search).get("joinRoom");
  if (code) sessionStorage.setItem(KEY, code);
}

export function takePendingRoomJoin(): string | null {
  const code = sessionStorage.getItem(KEY);
  if (code) sessionStorage.removeItem(KEY);
  return code;
}

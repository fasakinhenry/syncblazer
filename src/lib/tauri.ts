// Detects whether this build is running inside the SyncBlaze desktop
// companion (Tauri) shell versus a normal browser tab/PWA. Safe to import
// and call from anywhere — outside Tauri this is just a cheap `false`, no
// native dependency is pulled in by this file itself.
//
// The full LAN-pairing command surface (get_lan_ip, get_pairing_code, etc.)
// is wired in once the desktop app exists (see the `desktop` repo) — this
// file is deliberately minimal until then so the shared frontend can safely
// branch on "am I in the desktop app" without depending on Tauri yet.
export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export interface LanInfo {
  ip: string;
  port: number;
}

/** Only ever call this after checking isTauri() — outside the desktop shell
 * there's no Rust side to answer, and the dynamic import below would fail. */
export async function getLanInfo(): Promise<LanInfo> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<LanInfo>("get_lan_info");
}

/** Opens the real system browser for Google sign-in (PKCE, no secret
 * involved) and resolves with the id_token once the user completes it there
 * — the desktop app never renders Google's popup inside its own webview.
 * Only call after isTauri(). Rejects if the user cancels or it times out. */
export async function startGoogleSignIn(clientId: string): Promise<string> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<string>("start_google_signin", { clientId });
}


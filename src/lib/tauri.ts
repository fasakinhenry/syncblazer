// Detects whether this build is running inside the SyncBlaze desktop
// companion (Tauri) shell versus a normal browser tab/PWA. Safe to import
// and call from anywhere — outside Tauri this is just a cheap `false`
// (@tauri-apps/api is a tiny, portable package with no native dependency of
// its own; it's exactly as safe to import in a plain browser build).
//
// This re-exports Tauri's own official `isTauri()` (checks the documented
// `window.isTauri` boolean) rather than hand-checking an internal property
// ourselves — an earlier version of this file checked for
// `__TAURI_INTERNALS__`, which isn't the actual public contract and made
// this always return false in the packaged app, silently falling back to
// the embedded Google popup flow that doesn't work in WebView2.
export { isTauri } from "@tauri-apps/api/core";

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


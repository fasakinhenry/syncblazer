import { detectPlatform } from "@/lib/deviceInfo.ts";

// Set once the `desktop` (Tauri) repo has a real published release — e.g.
// its GitHub Releases URL. Left unset, every "download desktop app" surface
// shows an honest "coming soon" state instead of a broken link.
const DESKTOP_DOWNLOAD_URL = import.meta.env.VITE_DESKTOP_DOWNLOAD_URL;

export function desktopDownloadInfo(): { label: string; relevant: boolean; url?: string } {
  const platform = detectPlatform();
  const labels: Partial<Record<ReturnType<typeof detectPlatform>, string>> = {
    windows: "Download for Windows",
    macos: "Download for Mac",
    linux: "Download for Linux",
  };
  return {
    label: labels[platform] ?? "Download desktop app",
    relevant: platform === "windows" || platform === "macos" || platform === "linux",
    url: DESKTOP_DOWNLOAD_URL,
  };
}

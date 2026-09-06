import { useEffect, useState } from "react";
import { detectPlatform } from "@/lib/deviceInfo.ts";
import { getDesktopReleaseInfo, type DesktopReleaseInfo } from "@/lib/desktopReleases.ts";

export interface DesktopDownloadState {
  loading: boolean;
  relevant: boolean; // false on phones/tablets — no desktop build applies
  label: string;
  url?: string;
  size?: number;
  release: DesktopReleaseInfo | null;
}

const LABELS: Record<string, string> = {
  windows: "Download for Windows",
  macos: "Download for Mac",
  linux: "Download for Linux",
};

/** The primary, one-click "download for your OS" pick. macOS can't be told
 * apart Intel-vs-Apple-Silicon reliably from the browser across engines, so
 * this defaults to Apple Silicon (current-generation Macs) — Intel users get
 * a secondary link on the full downloads page. */
export function useDesktopDownload(): DesktopDownloadState {
  const [release, setRelease] = useState<DesktopReleaseInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const platform = detectPlatform();
  const relevant = platform === "windows" || platform === "macos" || platform === "linux";

  useEffect(() => {
    if (!relevant) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    getDesktopReleaseInfo().then((info) => {
      if (!cancelled) {
        setRelease(info);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const primary = release && (platform === "windows" ? release.windows : platform === "macos" ? release.macArm : platform === "linux" ? release.linuxAppImage : undefined);

  return {
    loading,
    relevant,
    label: LABELS[platform] ?? "Download desktop app",
    url: primary?.url,
    size: primary?.size,
    release,
  };
}

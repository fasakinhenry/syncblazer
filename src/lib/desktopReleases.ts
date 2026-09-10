// Resolves the current desktop app installers directly from GitHub's
// releases API, matched by pattern rather than a hand-constructed filename
// — survives version bumps (and incidental naming changes) without needing
// a frontend redeploy every time a new desktop version ships.
const REPO = "fasakinhenry/syncblazer-desktop";
const CACHE_KEY = "syncblaze.desktopReleaseCache";
const CACHE_TTL_MS = 10 * 60 * 1000; // stay well under GitHub's 60/hr unauthenticated rate limit

interface GitHubAsset {
  name: string;
  size: number;
  browser_download_url: string;
}

interface GitHubRelease {
  tag_name: string;
  html_url: string;
  assets: GitHubAsset[];
}

export interface DesktopAsset {
  url: string;
  size: number;
}

export interface DesktopReleaseInfo {
  version: string;
  releaseUrl: string;
  windows?: DesktopAsset; // NSIS .exe — primary
  windowsMsi?: DesktopAsset;
  macArm?: DesktopAsset; // Apple Silicon — primary Mac build
  macIntel?: DesktopAsset;
  linuxAppImage?: DesktopAsset; // primary Linux build — no install step needed
  linuxDeb?: DesktopAsset;
  linuxRpm?: DesktopAsset;
}

function findAsset(assets: GitHubAsset[], pattern: RegExp): DesktopAsset | undefined {
  const match = assets.find((a) => pattern.test(a.name));
  return match ? { url: match.browser_download_url, size: match.size } : undefined;
}

function parseRelease(release: GitHubRelease): DesktopReleaseInfo {
  const { assets } = release;
  return {
    version: release.tag_name,
    releaseUrl: release.html_url,
    windows: findAsset(assets, /_x64-setup\.exe$/),
    windowsMsi: findAsset(assets, /_x64_en-US\.msi$/),
    macArm: findAsset(assets, /_aarch64\.dmg$/),
    macIntel: findAsset(assets, /_x64\.dmg$/),
    linuxAppImage: findAsset(assets, /_amd64\.AppImage$/),
    linuxDeb: findAsset(assets, /_amd64\.deb$/),
    linuxRpm: findAsset(assets, /-1\.x86_64\.rpm$/),
  };
}

/** Plain x.y.z comparison — good enough here since every SyncBlaze desktop
 * release is a simple three-part version, no pre-release/build suffixes. */
export function isNewerVersion(current: string, latest: string): boolean {
  const clean = (v: string) => v.replace(/^v/i, "").split(".").map((n) => Number(n) || 0);
  const a = clean(current);
  const b = clean(latest);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const diff = (b[i] ?? 0) - (a[i] ?? 0);
    if (diff !== 0) return diff > 0;
  }
  return false;
}

export async function getDesktopReleaseInfo(): Promise<DesktopReleaseInfo | null> {
  try {
    const cached = sessionStorage.getItem(CACHE_KEY);
    if (cached) {
      const { data, fetchedAt } = JSON.parse(cached) as { data: DesktopReleaseInfo; fetchedAt: number };
      if (Date.now() - fetchedAt < CACHE_TTL_MS) return data;
    }
  } catch {
    // Corrupt/inaccessible cache — just refetch below.
  }

  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`);
    if (!res.ok) return null;
    const release = (await res.json()) as GitHubRelease;
    const data = parseRelease(release);
    try {
      sessionStorage.setItem(CACHE_KEY, JSON.stringify({ data, fetchedAt: Date.now() }));
    } catch {
      // Storage full/unavailable — fine, just won't cache this time.
    }
    return data;
  } catch {
    return null;
  }
}

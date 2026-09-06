import { Link } from "react-router-dom";
import { AppleLogo, ArrowSquareOut, DeviceMobile, DownloadSimple, Fire, LinuxLogo, WindowsLogo } from "@phosphor-icons/react";
import { useDesktopDownload } from "@/hooks/useDesktopDownload.ts";
import { detectDeviceInfo } from "@/lib/deviceInfo.ts";
import { formatBytes } from "@/lib/format.ts";
import type { DesktopAsset } from "@/lib/desktopReleases.ts";
import { Button } from "@/components/ui/Button.tsx";
import { Card } from "@/components/ui/Card.tsx";
import { PageSpinner } from "@/components/ui/Spinner.tsx";
import { InstallAppButton } from "@/components/InstallAppButton.tsx";

function AssetLink({ label, asset }: { label: string; asset?: DesktopAsset }) {
  if (!asset) return null;
  return (
    <a
      href={asset.url}
      download
      className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface px-4 py-3 text-sm hover:border-brand hover:bg-brand-soft"
    >
      <span className="font-medium text-text-primary">{label}</span>
      <span className="flex shrink-0 items-center gap-2 text-xs text-text-secondary">
        {formatBytes(asset.size)}
        <DownloadSimple className="h-4 w-4" />
      </span>
    </a>
  );
}

export function DownloadsPage() {
  const { loading, relevant, label, url, release } = useDesktopDownload();
  const isMobile = detectDeviceInfo().type === "mobile" || detectDeviceInfo().type === "tablet";

  return (
    <div className="min-h-dvh bg-background">
      <header className="border-b border-border px-4 py-4 md:px-8">
        <Link to="/" className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand">
            <Fire weight="fill" className="h-4 w-4 text-white" />
          </span>
          <span className="font-display text-base font-semibold text-text-primary">SyncBlaze</span>
        </Link>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-12">
        <div className="text-center">
          <h1 className="font-display text-3xl font-semibold text-text-primary">Download SyncBlaze Desktop</h1>
          <p className="mt-2 text-sm text-text-secondary">
            A small companion app for Windows, Mac, and Linux — pairs with your phone over Wi-Fi with a single scan,
            no camera or internet required on the computer.
          </p>
        </div>

        {isMobile ? (
          <Card className="mt-8 flex flex-col items-center gap-3 p-6 text-center">
            <DeviceMobile className="h-8 w-8 text-brand" />
            <p className="text-sm font-medium text-text-primary">You're on a phone — there's nothing to install here.</p>
            <p className="text-sm text-text-secondary">
              SyncBlaze on mobile works straight from your browser. Install it to your home screen for the full
              app-like experience instead.
            </p>
            <InstallAppButton />
          </Card>
        ) : (
          <div className="mt-8 flex flex-col items-center gap-3">
            {loading ? (
              <PageSpinner />
            ) : relevant && url ? (
              <a href={url} download>
                <Button size="lg" className="gap-2">
                  <DownloadSimple className="h-5 w-5" />
                  {label}
                </Button>
              </a>
            ) : (
              <p className="text-sm text-text-secondary">Couldn't check for the latest build right now — try the platform list below.</p>
            )}
            {release && (
              <a
                href={release.releaseUrl}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 text-xs font-medium text-text-secondary hover:text-text-primary"
              >
                {release.version} release notes
                <ArrowSquareOut className="h-3 w-3" />
              </a>
            )}
          </div>
        )}

        {release && (
          <div className="mt-10 flex flex-col gap-6">
            <section>
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-text-secondary">
                <WindowsLogo className="h-4 w-4" />
                Windows
              </h2>
              <div className="flex flex-col gap-2">
                <AssetLink label="Installer (recommended)" asset={release.windows} />
                <AssetLink label="MSI installer" asset={release.windowsMsi} />
              </div>
            </section>

            <section>
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-text-secondary">
                <AppleLogo className="h-4 w-4" />
                macOS
              </h2>
              <div className="flex flex-col gap-2">
                <AssetLink label="Apple Silicon (M1/M2/M3/M4)" asset={release.macArm} />
                <AssetLink label="Intel" asset={release.macIntel} />
              </div>
            </section>

            <section>
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-text-secondary">
                <LinuxLogo className="h-4 w-4" />
                Linux
              </h2>
              <div className="flex flex-col gap-2">
                <AssetLink label="AppImage (works on most distros, no install needed)" asset={release.linuxAppImage} />
                <AssetLink label="Debian / Ubuntu (.deb)" asset={release.linuxDeb} />
                <AssetLink label="Fedora / RHEL (.rpm)" asset={release.linuxRpm} />
              </div>
            </section>
          </div>
        )}

        <p className="mt-10 text-center text-xs text-text-secondary">
          Installers aren't code-signed yet — Windows/Mac may show an "unknown publisher" warning on first launch.
          That's expected for now, not a sign anything's wrong.
        </p>
      </main>
    </div>
  );
}

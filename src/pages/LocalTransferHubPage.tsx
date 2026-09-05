import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  CloudCheck,
  DownloadSimple,
  Info,
  Monitor,
  WifiHigh,
  WifiSlash,
} from "@phosphor-icons/react";
import { useOnlineStatus } from "@/hooks/useOnlineStatus.ts";
import { isTauri } from "@/lib/tauri.ts";
import { desktopDownloadInfo } from "@/lib/desktopApp.ts";
import { detectDeviceInfo } from "@/lib/deviceInfo.ts";
import { Badge } from "@/components/ui/Badge.tsx";
import { Button } from "@/components/ui/Button.tsx";
import { Card } from "@/components/ui/Card.tsx";

interface OptionCardProps {
  icon: ReactNode;
  title: string;
  badge: { label: string; tone: "brand" | "success" | "neutral" | "warning" };
  summary: string;
  points: { label: string; value: string }[];
  cta: ReactNode;
  disabled?: boolean;
  disabledReason?: string;
}

function OptionCard({ icon, title, badge, summary, points, cta, disabled, disabledReason }: OptionCardProps) {
  return (
    <Card className={`flex flex-col gap-4 p-5 ${disabled ? "opacity-60" : ""}`}>
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand">
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold text-text-primary">{title}</h2>
            <Badge tone={badge.tone}>{badge.label}</Badge>
          </div>
          <p className="mt-1 text-sm text-text-secondary">{summary}</p>
        </div>
      </div>

      <dl className="grid grid-cols-1 gap-x-4 gap-y-1.5 rounded-lg bg-surface-hover p-3 text-xs sm:grid-cols-2">
        {points.map((p) => (
          <div key={p.label} className="flex justify-between gap-2 sm:flex-col sm:justify-start">
            <dt className="font-medium text-text-secondary">{p.label}</dt>
            <dd className="text-right text-text-primary sm:text-left">{p.value}</dd>
          </div>
        ))}
      </dl>

      {disabled && disabledReason && (
        <div className="flex items-start gap-1.5 rounded-lg bg-warning/10 px-3 py-2 text-xs text-warning">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {disabledReason}
        </div>
      )}

      {cta}
    </Card>
  );
}

export function LocalTransferHubPage() {
  const online = useOnlineStatus();
  const inDesktopApp = isTauri();
  const download = desktopDownloadInfo();
  const isMobile = detectDeviceInfo().type === "mobile" || detectDeviceInfo().type === "tablet";

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-text-primary">Local transfer</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Move files, notes, and links straight between your devices — never stored in the cloud. Pick whichever
          fits what you've got right now; you can always try another if one doesn't work.
        </p>
      </div>

      <OptionCard
        icon={<CloudCheck className="h-5 w-5" />}
        title="Quick Connect"
        badge={{ label: "Recommended", tone: "brand" }}
        summary="A short code connects two or more devices in seconds, even across different Wi-Fi networks or accounts."
        points={[
          { label: "Needs", value: "A moment of internet, just to say hello" },
          { label: "Best for", value: "Most situations — fastest, most reliable" },
          { label: "Your data", value: "Goes device-to-device directly, never through our servers" },
          { label: "Works across networks", value: "Yes — even two phones on different Wi-Fi" },
        ]}
        disabled={!online}
        disabledReason="You're offline right now, so there's no internet available for the initial handshake. Try Local Network below instead, or reconnect and come back."
        cta={
          online ? (
            <Link to="/quick-connect">
              <Button className="w-full gap-1.5">
                Open Quick Connect
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          ) : (
            <Button disabled className="w-full gap-1.5">
              Open Quick Connect
              <ArrowRight className="h-4 w-4" />
            </Button>
          )
        }
      />

      <OptionCard
        icon={<WifiHigh className="h-5 w-5" />}
        title="Local Network"
        badge={{ label: "Zero internet needed", tone: "success" }}
        summary="Scan or type a code directly between two devices on the same Wi-Fi or hotspot — no server involved at all, ever."
        points={[
          { label: "Needs", value: "Both devices on the same Wi-Fi/hotspot" },
          { label: "Best for", value: "Truly no signal anywhere — a hotspot with no data plan" },
          { label: "Your data", value: "Never leaves the two devices, not even briefly" },
          { label: "Setup", value: "A short back-and-forth code exchange (a bit more manual)" },
        ]}
        cta={
          <Link to="/local-session">
            <Button variant="secondary" className="w-full gap-1.5">
              Open Local Network
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        }
      />

      <OptionCard
        icon={<Monitor className="h-5 w-5" />}
        title="Desktop App"
        badge={{ label: "Best for laptops with no camera", tone: "neutral" }}
        summary="A small companion app for Windows/Mac/Linux that your phone can reach directly over Wi-Fi — the laptop never needs a camera, and it works with zero internet."
        points={[
          { label: "Needs", value: "The SyncBlaze desktop app installed on this computer" },
          { label: "Best for", value: "A laptop with no webcam, still zero internet" },
          { label: "Your data", value: "Stays on your local network, direct device-to-device" },
          { label: "Setup", value: "One scan from your phone — the app never needs a camera" },
        ]}
        cta={
          inDesktopApp ? (
            <Link to="/lan-connect">
              <Button className="w-full gap-1.5">
                Host a session
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          ) : isMobile ? (
            <Link to="/lan-connect">
              <Button variant="secondary" className="w-full gap-1.5">
                Scan a desktop's code
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          ) : download.relevant && download.url ? (
            <a href={download.url} target="_blank" rel="noreferrer">
              <Button variant="secondary" className="w-full gap-1.5">
                <DownloadSimple className="h-4 w-4" />
                {download.label}
              </Button>
            </a>
          ) : (
            <Button variant="secondary" disabled className="w-full gap-1.5">
              <DownloadSimple className="h-4 w-4" />
              {download.relevant ? "Coming soon" : "Available for Windows, Mac and Linux"}
            </Button>
          )
        }
      />

      {!online && (
        <div className="flex items-center gap-2 rounded-lg bg-warning/10 px-3 py-2 text-xs text-warning">
          <WifiSlash className="h-3.5 w-3.5 shrink-0" />
          You're offline — Local Network and the Desktop App both still work with zero internet.
        </div>
      )}
    </div>
  );
}

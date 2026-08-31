import type { ReactNode } from "react";
import type { Device } from "@/lib/types.ts";
import { DEVICE_TYPE_ICON } from "@/components/devices/deviceIcons.tsx";
import { formatRelativeTime } from "@/lib/format.ts";
import { Card } from "@/components/ui/Card.tsx";

const PLATFORM_LABEL: Record<Device["platform"], string> = {
  windows: "Windows",
  macos: "macOS",
  linux: "Linux",
  ios: "iOS",
  android: "Android",
  web: "Browser",
};

export function DeviceCard({ device, actions }: { device: Device; actions?: ReactNode }) {
  const Icon = DEVICE_TYPE_ICON[device.type];
  const online = device.status === "online";

  return (
    <Card className="flex items-center gap-3 p-4">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand">
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate font-medium text-text-primary">{device.name}</p>
          {device.isCurrent ? <span className="shrink-0 text-xs text-text-secondary">(this device)</span> : null}
        </div>
        <p className="flex items-center gap-1.5 text-sm text-text-secondary">
          <span className={`h-1.5 w-1.5 rounded-full ${online ? "bg-success" : "bg-text-secondary/40"}`} />
          {online ? "Connected" : `Last seen ${formatRelativeTime(device.lastSeenAt)}`}
          <span aria-hidden="true">·</span>
          {PLATFORM_LABEL[device.platform]}
          {device.isLocal ? (
            <>
              <span aria-hidden="true">·</span>
              <span className="text-success">Same network</span>
            </>
          ) : null}
        </p>
      </div>
      {actions}
    </Card>
  );
}

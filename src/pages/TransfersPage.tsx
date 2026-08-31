import { useEffect, useState } from "react";
import { ArrowLeft, File as FileIcon, Image as ImageIcon, LinkSimple, ArrowClockwise, TextAa } from "@phosphor-icons/react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api.ts";
import type { Device, Transfer, TransferType } from "@/lib/types.ts";
import { formatBytes, formatRelativeTime } from "@/lib/format.ts";
import { Badge } from "@/components/ui/Badge.tsx";
import { Card } from "@/components/ui/Card.tsx";
import { EmptyState } from "@/components/ui/EmptyState.tsx";
import { PageSpinner } from "@/components/ui/Spinner.tsx";
import { Button } from "@/components/ui/Button.tsx";
import { STATUS_LABEL, STATUS_TONE } from "@/components/transfers/statusMeta.ts";

const TYPE_ICON: Record<TransferType, typeof FileIcon> = {
  file: FileIcon,
  image: ImageIcon,
  text: TextAa,
  link: LinkSimple,
};

const FILTERS: { label: string; value: TransferType | "all" }[] = [
  { label: "All", value: "all" },
  { label: "Files", value: "file" },
  { label: "Images", value: "image" },
  { label: "Text", value: "text" },
  { label: "Links", value: "link" },
];

function deviceName(d: Device | string): string {
  return typeof d === "string" ? "Device" : d.name;
}

export function TransfersPage() {
  const [transfers, setTransfers] = useState<Transfer[] | null>(null);
  const [filter, setFilter] = useState<TransferType | "all">("all");

  const load = async (type: TransferType | "all") => {
    const { transfers } = await api.transfers.list(type === "all" ? undefined : { type });
    setTransfers(transfers);
  };

  useEffect(() => {
    void load(filter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  const retry = async (transferId: string) => {
    await api.transfers.retry(transferId);
    void load(filter);
  };

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div className="flex items-center gap-3">
        <Link to="/room" className="rounded-md p-2 text-text-secondary hover:bg-surface-hover" aria-label="Back">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-xl font-semibold text-text-primary">Transfers</h1>
          <p className="text-sm text-text-secondary">Everything sent and received.</p>
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-medium ${
              filter === f.value ? "bg-brand text-white" : "bg-surface-hover text-text-secondary"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {transfers === null ? (
        <PageSpinner />
      ) : transfers.length === 0 ? (
        <EmptyState title="Nothing here yet" description="Your transfers will appear here." />
      ) : (
        <div className="flex flex-col gap-2">
          {transfers.map((t) => {
            const Icon = TYPE_ICON[t.type];
            return (
              <Card key={t._id} className="flex items-center gap-3 p-4">
                <Icon className="h-5 w-5 shrink-0 text-text-secondary" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-text-primary">{t.name}</p>
                  <p className="truncate text-xs text-text-secondary">
                    {deviceName(t.senderDeviceId)} → {deviceName(t.receiverDeviceId)}
                    {t.size ? ` · ${formatBytes(t.size)}` : ""} · {formatRelativeTime(t.createdAt)}
                  </p>
                </div>
                <Badge tone={STATUS_TONE[t.status]}>{STATUS_LABEL[t.status]}</Badge>
                {t.status === "failed" && (
                  <Button size="sm" variant="ghost" onClick={() => retry(t._id)} className="gap-1">
                    <ArrowClockwise className="h-3.5 w-3.5" />
                    Retry
                  </Button>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

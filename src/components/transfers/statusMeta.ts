import type { TransferStatus } from "@/lib/types.ts";

export const STATUS_TONE: Record<TransferStatus, "neutral" | "success" | "warning" | "danger" | "brand"> = {
  created: "neutral",
  queued: "neutral",
  connecting: "brand",
  transferring: "brand",
  completed: "success",
  failed: "danger",
  retrying: "warning",
  cancelled: "neutral",
};

export const STATUS_LABEL: Record<TransferStatus, string> = {
  created: "Created",
  queued: "Queued",
  connecting: "Connecting",
  transferring: "Transferring",
  completed: "Completed",
  failed: "Failed",
  retrying: "Retrying",
  cancelled: "Cancelled",
};

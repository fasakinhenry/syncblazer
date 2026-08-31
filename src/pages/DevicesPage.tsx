import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { DeviceMobile, PencilSimple, Plus, Trash } from "@phosphor-icons/react";
import { api } from "@/lib/api.ts";
import type { Device } from "@/lib/types.ts";
import { useRooms } from "@/context/RoomContext.tsx";
import { useSocket } from "@/context/SocketContext.tsx";
import { useToast } from "@/context/ToastContext.tsx";
import { getCurrentDevice } from "@/lib/deviceInfo.ts";
import { DeviceCard } from "@/components/devices/DeviceCard.tsx";
import { PairDeviceModal } from "@/components/devices/PairDeviceModal.tsx";
import { JoinDeviceForm } from "@/components/devices/JoinDeviceForm.tsx";
import { Button } from "@/components/ui/Button.tsx";
import { Card } from "@/components/ui/Card.tsx";
import { EmptyState } from "@/components/ui/EmptyState.tsx";
import { PageSpinner } from "@/components/ui/Spinner.tsx";
import { Input } from "@/components/ui/Input.tsx";

export function DevicesPage() {
  const { defaultRoom } = useRooms();
  const { socket } = useSocket();
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [devices, setDevices] = useState<Device[] | null>(null);
  const [pairOpen, setPairOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

  const currentDeviceId = getCurrentDevice()?._id;
  const joinCode = searchParams.get("join") ?? undefined;

  const load = useCallback(async () => {
    const { devices } = await api.devices.list();
    setDevices(devices.map((d) => ({ ...d, isCurrent: d._id === currentDeviceId })));
  }, [currentDeviceId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!socket) return;
    const onPresence = (payload: { deviceId: string; status: Device["status"]; lastSeenAt: string }) => {
      setDevices((prev) =>
        prev?.map((d) => (d._id === payload.deviceId ? { ...d, status: payload.status, lastSeenAt: payload.lastSeenAt } : d)) ?? null
      );
    };
    const onRemoved = (payload: { deviceId: string }) => {
      setDevices((prev) => prev?.filter((d) => d._id !== payload.deviceId) ?? null);
    };
    // Network membership can change independently of status (e.g. another
    // device joins your Wi-Fi), so refetch to keep "same network" accurate.
    const onNetworkChanged = () => void load();

    socket.on("device:presence", onPresence);
    socket.on("device:removed", onRemoved);
    socket.on("network:changed", onNetworkChanged);
    return () => {
      socket.off("device:presence", onPresence);
      socket.off("device:removed", onRemoved);
      socket.off("network:changed", onNetworkChanged);
    };
  }, [socket, load]);

  const handlePaired = () => {
    void load();
  };

  const handleJoined = (device: Device) => {
    toast(`${device.name} connected`, "success");
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete("join");
      return next;
    });
    void load();
  };

  const startRename = (device: Device) => {
    setEditingId(device._id);
    setEditingName(device.name);
  };

  const submitRename = async (deviceId: string) => {
    const name = editingName.trim();
    setEditingId(null);
    if (!name) return;
    const { device } = await api.devices.rename(deviceId, name);
    setDevices((prev) => prev?.map((d) => (d._id === deviceId ? { ...d, name: device.name } : d)) ?? null);
  };

  const removeDevice = async (device: Device) => {
    if (!window.confirm(`Remove ${device.name}? It will no longer be part of this workspace.`)) return;
    await api.devices.remove(device._id);
    setDevices((prev) => prev?.filter((d) => d._id !== device._id) ?? null);
    toast(`${device.name} removed`, "info");
  };

  if (devices === null) return <PageSpinner />;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-text-primary">Devices</h1>
          <p className="text-sm text-text-secondary">Devices trusted in your workspace.</p>
        </div>
        <Button onClick={() => setPairOpen(true)} disabled={!defaultRoom} className="gap-1.5">
          <Plus className="h-4 w-4" />
          Connect device
        </Button>
      </div>

      <Card className="p-4">
        <p className="mb-2 text-sm font-medium text-text-primary">Have a code?</p>
        <JoinDeviceForm initialCode={joinCode} onJoined={handleJoined} />
      </Card>

      {devices.length === 0 ? (
        <EmptyState
          icon={<DeviceMobile className="h-8 w-8" />}
          title="No devices connected"
          description="Pair your phone or laptop to get started."
          action={
            <Button onClick={() => setPairOpen(true)} disabled={!defaultRoom}>
              Connect device
            </Button>
          }
        />
      ) : (
        <div className="flex flex-col gap-3">
          {devices.map((device) => (
            <DeviceCard
              key={device._id}
              device={device}
              actions={
                editingId === device._id ? (
                  <div className="flex items-center gap-2">
                    <Input
                      autoFocus
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && submitRename(device._id)}
                      className="h-9 w-40"
                    />
                    <Button size="sm" onClick={() => submitRename(device._id)}>
                      Save
                    </Button>
                  </div>
                ) : (
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      aria-label={`Rename ${device.name}`}
                      onClick={() => startRename(device)}
                      className="rounded-md p-2 text-text-secondary hover:bg-surface-hover hover:text-text-primary"
                    >
                      <PencilSimple className="h-4 w-4" />
                    </button>
                    <button
                      aria-label={`Remove ${device.name}`}
                      onClick={() => removeDevice(device)}
                      className="rounded-md p-2 text-text-secondary hover:bg-danger/10 hover:text-danger"
                    >
                      <Trash className="h-4 w-4" />
                    </button>
                  </div>
                )
              }
            />
          ))}
        </div>
      )}

      <PairDeviceModal open={pairOpen} onClose={() => setPairOpen(false)} roomId={defaultRoom?._id} onPaired={handlePaired} />
    </div>
  );
}

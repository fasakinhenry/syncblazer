import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { Lightning, UploadSimple } from "@phosphor-icons/react";
import { api } from "@/lib/api.ts";
import type { Device } from "@/lib/types.ts";
import { useSocket } from "@/context/SocketContext.tsx";
import { useRooms } from "@/context/RoomContext.tsx";
import { useSendToDevice } from "@/hooks/useSendToDevice.ts";
import { DEVICE_TYPE_ICON } from "@/components/devices/deviceIcons.tsx";
import { Spinner } from "@/components/ui/Spinner.tsx";

export function LocalNetworkSection() {
  const { socket } = useSocket();
  const { defaultRoom } = useRooms();
  const { send, sendingTo } = useSendToDevice(defaultRoom?._id);
  const [devices, setDevices] = useState<Device[] | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const targetRef = useRef<{ id: string; name: string } | null>(null);

  const load = () => {
    api.devices.list().then(({ devices }) => setDevices(devices.filter((d) => d.isLocal && d.status === "online")));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!socket) return;
    socket.on("network:changed", load);
    socket.on("device:presence", load);
    return () => {
      socket.off("network:changed", load);
      socket.off("device:presence", load);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket]);

  const triggerSend = (device: Device) => {
    targetRef.current = { id: device._id, name: device.name };
    fileInputRef.current?.click();
  };

  const onFileChosen = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const target = targetRef.current;
    e.target.value = "";
    if (!file || !target) return;
    void send(target.id, target.name, file);
  };

  if (!devices || devices.length === 0) return null;

  return (
    <section>
      <input ref={fileInputRef} type="file" className="hidden" onChange={onFileChosen} />
      <div className="mb-3 flex items-center gap-2">
        <Lightning className="h-4 w-4 text-success" weight="fill" />
        <h2 className="text-sm font-semibold text-text-secondary">On your network right now</h2>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {devices.map((device) => {
          const Icon = DEVICE_TYPE_ICON[device.type];
          const isSending = sendingTo === device._id;
          return (
            <button
              key={device._id}
              onClick={() => triggerSend(device)}
              disabled={isSending}
              className="flex items-center gap-3 rounded-xl border border-success/30 bg-success/5 p-4 text-left transition-colors hover:border-success/60 disabled:opacity-60"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-surface text-text-secondary">
                <Icon className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-text-primary">{device.name}</p>
                <p className="text-xs text-success">Same network · tap to send</p>
              </div>
              {isSending ? (
                <Spinner className="h-4 w-4 shrink-0" />
              ) : (
                <UploadSimple className="h-4 w-4 shrink-0 text-text-secondary" />
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}

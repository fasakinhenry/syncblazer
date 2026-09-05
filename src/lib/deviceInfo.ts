import type { Device, DevicePlatform, DeviceType } from "@/lib/types.ts";

const CURRENT_DEVICE_KEY = "syncblaze.currentDevice";
const INSTALL_ID_KEY = "syncblaze.installId";

/**
 * A random id generated once per browser/installation and kept in
 * localStorage for good — NOT tied to any particular account. Every login
 * sends this so the backend can recognize "this is the same physical
 * device you've used before" and reuse its existing Device record instead
 * of creating a fresh one each time (which previously happened on every
 * login, piling up duplicate devices). Matching by auto-generated name
 * alone doesn't work once someone's renamed a device, so this is the
 * stable identifier that survives renames.
 */
export function getOrCreateInstallId(): string {
  let id = localStorage.getItem(INSTALL_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(INSTALL_ID_KEY, id);
  }
  return id;
}

export function detectPlatform(): DevicePlatform {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/i.test(ua)) return "ios";
  if (/Android/i.test(ua)) return "android";
  if (/Mac OS X/i.test(ua)) return "macos";
  if (/Windows/i.test(ua)) return "windows";
  if (/Linux/i.test(ua)) return "linux";
  return "web";
}

function detectType(): DeviceType {
  const ua = navigator.userAgent;
  if (/iPad|Tablet/i.test(ua)) return "tablet";
  if (/iPhone|Android.*Mobile|Mobi/i.test(ua)) return "mobile";
  return navigator.maxTouchPoints > 2 && /Mac/i.test(navigator.userAgent) ? "tablet" : "laptop";
}

export function detectDeviceInfo(): { name: string; type: DeviceType; platform: DevicePlatform; installId: string } {
  const platform = detectPlatform();
  const type = detectType();
  const platformLabel: Record<DevicePlatform, string> = {
    windows: "Windows",
    macos: "Mac",
    linux: "Linux",
    ios: "iPhone",
    android: "Android",
    web: "Browser",
  };
  const typeLabel: Record<DeviceType, string> = {
    desktop: "Desktop",
    laptop: "Laptop",
    mobile: "Phone",
    tablet: "Tablet",
  };
  return {
    name: `${platformLabel[platform]} ${typeLabel[type]}`,
    type,
    platform,
    installId: getOrCreateInstallId(),
  };
}

export function getCurrentDevice(): Device | null {
  const raw = localStorage.getItem(CURRENT_DEVICE_KEY);
  return raw ? (JSON.parse(raw) as Device) : null;
}

export function setCurrentDevice(device: Device | undefined | null) {
  if (!device) return;
  localStorage.setItem(CURRENT_DEVICE_KEY, JSON.stringify(device));
}

export function clearCurrentDevice() {
  localStorage.removeItem(CURRENT_DEVICE_KEY);
}

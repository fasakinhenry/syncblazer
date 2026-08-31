import type { Device, DevicePlatform, DeviceType } from "@/lib/types.ts";

const CURRENT_DEVICE_KEY = "syncblaze.currentDevice";

function detectPlatform(): DevicePlatform {
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

export function detectDeviceInfo(): { name: string; type: DeviceType; platform: DevicePlatform } {
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
  return { name: `${platformLabel[platform]} ${typeLabel[type]}`, type, platform };
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

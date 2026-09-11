import { api } from "@/lib/api.ts";
import { getCurrentDevice } from "@/lib/deviceInfo.ts";

export function pushSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window && "serviceWorker" in navigator && "PushManager" in window;
}

// pushManager.subscribe needs the VAPID public key as a Uint8Array, but the
// backend hands it over as the standard base64url string form.
function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const base64Safe = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64Safe);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

/** Requests permission, subscribes this browser to push, and registers the
 * subscription with the backend. Returns false (never throws) if the user
 * declines, push isn't supported here, or the server has no VAPID key
 * configured yet — callers should treat all of those as "just didn't work,"
 * not distinguish them with a try/catch. */
export async function subscribeToPush(): Promise<boolean> {
  if (!pushSupported()) return false;

  const permission = await Notification.requestPermission();
  if (permission !== "granted") return false;

  const { publicKey } = await api.notifications.getVapidPublicKey();
  if (!publicKey) return false;

  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey),
  });

  const json = subscription.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return false;

  await api.notifications.registerPushSubscription({
    endpoint: json.endpoint,
    keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
    deviceId: getCurrentDevice()?._id,
  });
  return true;
}

/** The service worker can't read localStorage (no access token), so on the
 * rare occasion a browser silently rotates a push subscription
 * (pushsubscriptionchange in sw.ts), it posts the renewed subscription to
 * any open tab instead — this is what actually forwards it to the backend
 * with real auth. Call once, while authenticated. No-op if push isn't
 * supported here. */
export function listenForPushRenewal(): () => void {
  if (!pushSupported()) return () => {};
  const onMessage = (event: MessageEvent) => {
    if (event.data?.type !== "PUSH_SUBSCRIPTION_RENEWED") return;
    const sub = event.data.subscription as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
    if (!sub.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) return;
    void api.notifications.registerPushSubscription({
      endpoint: sub.endpoint,
      keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth },
      deviceId: getCurrentDevice()?._id,
    });
  };
  navigator.serviceWorker.addEventListener("message", onMessage);
  return () => navigator.serviceWorker.removeEventListener("message", onMessage);
}

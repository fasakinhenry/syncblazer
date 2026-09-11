/// <reference lib="webworker" />
// Hand-written service worker (vite-plugin-pwa "injectManifest" mode) —
// replaces the previously auto-generated one specifically so it can add
// push/notificationclick handlers, which generateSW mode has no file to put
// them in. Everything that mode used to wire up implicitly (precaching, the
// /api/ runtime-caching rule, SPA navigation fallback, the update-skip-
// waiting handshake) is re-implemented below explicitly — dropping any one
// of them silently regresses offline/update behavior, not just push.

import { precacheAndRoute, createHandlerBoundToURL } from "workbox-precaching";
import { registerRoute, NavigationRoute } from "workbox-routing";
import { NetworkFirst } from "workbox-strategies";
import { CacheableResponsePlugin } from "workbox-cacheable-response";
import { ExpirationPlugin } from "workbox-expiration";

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ revision: string | null; url: string }>;
};

// 1. Precache the build's own assets — the same thing generateSW did
// automatically. vite-plugin-pwa injects the manifest array at build time.
precacheAndRoute(self.__WB_MANIFEST);

// 2. Port of the old workbox.runtimeCaching entry: cache API GETs, prefer
// the network but fall back to cache within 4s or if offline.
registerRoute(
  ({ url }) => url.pathname.startsWith("/api/"),
  new NetworkFirst({
    cacheName: "syncblaze-api",
    networkTimeoutSeconds: 4,
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 }),
    ],
  })
);

// 3. Port of the old navigateFallbackDenylist: deep-link refreshes (e.g.
// /rooms/abc) should still serve the cached index.html, but a request under
// /api/ should never be swallowed by that fallback.
const navigationHandler = createHandlerBoundToURL("/index.html");
registerRoute(new NavigationRoute(navigationHandler, { denylist: [/^\/api/] }));

// 4. Required for PwaUpdatePrompt.tsx's existing "Reload" button to work —
// generateSW + registerType:"autoUpdate" wired this implicitly; in
// injectManifest mode it has to be explicit or updateServiceWorker(true)
// (via virtual:pwa-register/react) becomes a silent no-op.
self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

// 5. Web Push: show a notification for whatever the backend sent (see
// backend/src/services/webPush.service.ts — always a JSON {title, body,
// url, tag} payload).
self.addEventListener("push", (event) => {
  if (!event.data) return;
  let payload: { title?: string; body?: string; url?: string; tag?: string };
  try {
    payload = event.data.json();
  } catch {
    return;
  }
  event.waitUntil(
    self.registration.showNotification(payload.title ?? "SyncBlaze", {
      body: payload.body,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      tag: payload.tag,
      data: { url: payload.url ?? "/activity" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data as { url?: string } | undefined)?.url ?? "/activity";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      const existing = clients.find((c) => new URL(c.url).pathname === targetUrl);
      if (existing) return existing.focus();
      return self.clients.openWindow(targetUrl);
    })
  );
});

// 6. Rare (browsers occasionally rotate a push subscription on their own),
// but when it happens the old one is already dead — try to get a fresh one
// and hand it to any open tab, which has the access token this worker
// doesn't, to actually register it with the backend. If nothing is open
// when this fires, the renewal is dropped until the app is next opened —
// an accepted gap, not silently "fixed" with an unauthenticated endpoint.
self.addEventListener("pushsubscriptionchange", (event) => {
  const pushEvent = event as ServiceWorkerGlobalScopeEventMap["pushsubscriptionchange"];
  event.waitUntil(
    (async () => {
      const options = pushEvent.oldSubscription?.options;
      if (!options) return;
      const newSubscription = await self.registration.pushManager.subscribe(options);
      const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of clients) {
        client.postMessage({ type: "PUSH_SUBSCRIPTION_RENEWED", subscription: newSubscription.toJSON() });
      }
    })()
  );
});

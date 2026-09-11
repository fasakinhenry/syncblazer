# SyncBlaze

SyncBlaze is a free, local-first workspace for moving files, photos, notes, and links between your own devices, phone to laptop, laptop to phone, instantly. When two of your devices share the same Wi-Fi, files travel straight between them and never touch a server. Every room also gets live collaborative notes and a private, end-to-end encrypted chat, and the whole thing installs as an app on your phone or desktop.

Live at **[syncblazer.vercel.app](https://syncblazer.vercel.app)**. This repo is the frontend: the React app everyone actually uses. It talks to a separate backend repo (linked below) for auth, signaling, and the cloud fallback.

## What's in here

- **Quick Blaze** — pick something, pick a device, send it. The fastest path between two of your devices.
- **Rooms** — a shared space for your own devices, or for other people you invite by email.
- **Notes** — plain notes that sync live across every device, with images, link previews, and real-time co-editing when a note is shared with a room.
- **Room chat** — a private, end-to-end encrypted chat per room, with photos and voice notes. The encryption itself lives entirely in this codebase (`src/lib/roomChatCrypto.ts`); the backend only ever sees ciphertext.
- **Guest access** — try it with one tap, no account, upgrade later without losing anything.
- **A real PWA** — installable, works offline, and can send you push notifications (see `src/sw.ts`, the hand-written service worker behind that).

## Tech stack

[React 19](https://react.dev) + [Vite](https://vite.dev) + TypeScript, [Tailwind CSS v4](https://tailwindcss.com), [Socket.IO](https://socket.io) for real-time updates, [Yjs](https://github.com/yjs/yjs) for collaborative note editing, the native Web Crypto API for end-to-end encrypted chat, [vite-plugin-pwa](https://vite-pwa-org.netlify.app) (in `injectManifest` mode, for custom push handling) for the installable app.

## Local development

```bash
cp .env.example .env
bun install
bun run dev
```

Runs at `http://localhost:5173`. Needs the [backend](https://github.com/fasakinhenry/syncblazer_backend) running too, `VITE_API_URL` and `VITE_SOCKET_URL` in `.env` point at it (defaults assume it's on `localhost:4000`). To test from a phone on the same Wi-Fi, point those at your machine's LAN IP instead.

Other useful commands:

```bash
bun run build       # tsc -b && vite build — the real production build
bun run typecheck   # tsc -b --noEmit — faster, but NOT a full substitute for build
bun run preview      # serve the production build locally
```

> `typecheck` alone can pass while `build` fails on this project (composite TypeScript project references behave slightly differently under `--noEmit`). Always confirm with a real `build` before calling a change done.

### Environment variables

| Variable | Purpose |
|---|---|
| `VITE_API_URL` | The backend's REST API URL |
| `VITE_SOCKET_URL` | The backend's Socket.IO URL (same host, no `/api`) |
| `VITE_GOOGLE_CLIENT_ID` | Optional, shows the "Continue with Google" button |
| `VITE_GOOGLE_DESKTOP_CLIENT_ID` | Optional, only used inside the desktop app build |

## Deploying it

Built for [Vercel](https://vercel.com). Import this repo directly, Vercel's own zero-config Vite detection handles the rest, and `vercel.json` already sets the build command and the SPA rewrite (without it, refreshing any page but the homepage would 404). Set the environment variables above in Vercel's dashboard, pointing `VITE_API_URL`/`VITE_SOCKET_URL` at your deployed [backend](https://github.com/fasakinhenry/syncblazer_backend), and set that backend's `CLIENT_ORIGIN` to match the exact Vercel URL you're given back.

## Related repos

- [Backend](https://github.com/fasakinhenry/syncblazer_backend) — the API, real-time layer, and cloud fallback this app talks to
- [Desktop app](https://github.com/fasakinhenry/syncblazer-desktop) — a native companion built with Tauri, wrapping this same frontend

---

> Made with 💖by [Fasakin Henry](https://github.com/fasakinhenry)

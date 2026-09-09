import { get, set } from "idb-keyval";

// The one file where correctness matters most for room chat's end-to-end
// encryption — kept small and deliberately unclever. Everything else
// (RoomChatContext.tsx) only ever calls these functions; nothing else in
// the app touches SubtleCrypto directly for chat.
//
// Design in one paragraph: each DEVICE (not each account) has its own
// ECDH P-256 keypair, generated once and kept in IndexedDB — the private
// half never leaves this function file, let alone the device. A room's
// chat has a symmetric AES-256-GCM "room key" per epoch; getting a copy of
// it means someone who already has it derived a per-recipient wrapping key
// via ECDH(their private key, your public key) and used it to AES-GCM-
// encrypt the raw room key bytes just for you (see wrapRoomKeyForDevice /
// unwrapRoomKey). The server only ever stores and relays those wrapped
// blobs — it has no private key for anyone, so it can't unwrap any of it.

const DEVICE_KEYPAIR_STORE_KEY = "syncblaze.chat.deviceKeyPair";
const ECDH_PARAMS: EcKeyImportParams & EcKeyGenParams = { name: "ECDH", namedCurve: "P-256" };

interface StoredKeyPair {
  publicKeyJwk: JsonWebKey;
  privateKeyJwk: JsonWebKey;
}

let cachedKeyPair: CryptoKeyPair | null = null;
let cachedPublicKeyJwk: JsonWebKey | null = null;

function toBase64(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = "";
  for (const byte of arr) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Generates this device's chat keypair the first time it's needed and
 * caches it in IndexedDB from then on — same keypair reused across every
 * room this device chats in, and across reloads. */
export async function getOrCreateDeviceKeyPair(): Promise<{ keyPair: CryptoKeyPair; publicKeyJwk: JsonWebKey }> {
  if (cachedKeyPair && cachedPublicKeyJwk) return { keyPair: cachedKeyPair, publicKeyJwk: cachedPublicKeyJwk };

  const stored = await get<StoredKeyPair>(DEVICE_KEYPAIR_STORE_KEY);
  if (stored) {
    const [publicKey, privateKey] = await Promise.all([
      crypto.subtle.importKey("jwk", stored.publicKeyJwk, ECDH_PARAMS, true, []),
      crypto.subtle.importKey("jwk", stored.privateKeyJwk, ECDH_PARAMS, true, ["deriveKey"]),
    ]);
    cachedKeyPair = { publicKey, privateKey };
    cachedPublicKeyJwk = stored.publicKeyJwk;
    return { keyPair: cachedKeyPair, publicKeyJwk: cachedPublicKeyJwk };
  }

  const keyPair = await crypto.subtle.generateKey(ECDH_PARAMS, true, ["deriveKey"]);
  const [publicKeyJwk, privateKeyJwk] = await Promise.all([
    crypto.subtle.exportKey("jwk", keyPair.publicKey),
    crypto.subtle.exportKey("jwk", keyPair.privateKey),
  ]);
  await set(DEVICE_KEYPAIR_STORE_KEY, { publicKeyJwk, privateKeyJwk });
  cachedKeyPair = keyPair;
  cachedPublicKeyJwk = publicKeyJwk;
  return { keyPair, publicKeyJwk };
}

export function publicKeyToString(jwk: JsonWebKey): string {
  return JSON.stringify(jwk);
}

async function importPeerPublicKey(publicKeyStr: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("jwk", JSON.parse(publicKeyStr) as JsonWebKey, ECDH_PARAMS, true, []);
}

async function deriveWrappingKey(myPrivateKey: CryptoKey, peerPublicKey: CryptoKey): Promise<CryptoKey> {
  return crypto.subtle.deriveKey(
    { name: "ECDH", public: peerPublicKey },
    myPrivateKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

export async function generateRoomKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
}

/** Wraps a room's AES key specifically for one recipient device's public
 * key — only that device's matching private key can ever unwrap it. */
export async function wrapRoomKeyForDevice(
  roomKey: CryptoKey,
  myPrivateKey: CryptoKey,
  recipientPublicKeyStr: string
): Promise<{ wrappedKey: string; iv: string }> {
  const recipientPublicKey = await importPeerPublicKey(recipientPublicKeyStr);
  const wrappingKey = await deriveWrappingKey(myPrivateKey, recipientPublicKey);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const rawKey = await crypto.subtle.exportKey("raw", roomKey);
  const wrapped = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, wrappingKey, rawKey);
  return { wrappedKey: toBase64(wrapped), iv: toBase64(iv) };
}

/** Reverses wrapRoomKeyForDevice — needs the SENDER's public key (ECDH is
 * symmetric: the same shared secret comes out of either side deriving with
 * the other's public key), which the caller looks up from the room's
 * device roster via the envelope's `fromDeviceId`. */
export async function unwrapRoomKey(
  wrappedKeyB64: string,
  ivB64: string,
  myPrivateKey: CryptoKey,
  senderPublicKeyStr: string
): Promise<CryptoKey> {
  const senderPublicKey = await importPeerPublicKey(senderPublicKeyStr);
  const wrappingKey = await deriveWrappingKey(myPrivateKey, senderPublicKey);
  const rawKey = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64(ivB64) },
    wrappingKey,
    fromBase64(wrappedKeyB64)
  );
  return crypto.subtle.importKey("raw", rawKey, { name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
}

export interface ChatPayload {
  text?: string;
  /** Storage key from POST /chat/attachments — the blob itself is already
   * separately AES-GCM encrypted (see encryptAttachment) with its own
   * one-off key, which travels ONLY inside this already-encrypted payload. */
  attachmentKey?: string;
  attachmentKeyB64?: string;
  attachmentIvB64?: string;
  mimeType?: string;
  fileName?: string;
  /** Voice notes only: a fixed-length array of normalized (0..1) loudness
   * samples captured while recording, so the received bubble can render
   * the same WhatsApp-style bars immediately without decoding audio. */
  waveform?: number[];
  durationSec?: number;
  /** A single link found in the text, resolved client-side only — see
   * linkPreviewCache.ts. Kept inside the encrypted payload so the URL
   * itself, and the fact a preview was fetched, never touch the server in
   * association with this message. */
  linkPreviewUrl?: string;
}

export async function encryptMessage(roomKey: CryptoKey, payload: ChatPayload): Promise<{ ciphertext: string; iv: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(JSON.stringify(payload));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, roomKey, plaintext);
  return { ciphertext: toBase64(encrypted), iv: toBase64(iv) };
}

/** Returns null (never throws) when the given key can't decrypt this
 * message — the normal, expected case for a message from an epoch this
 * device wasn't part of, not a bug to surface loudly. */
export async function decryptMessage(roomKey: CryptoKey, ciphertextB64: string, ivB64: string): Promise<ChatPayload | null> {
  try {
    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: fromBase64(ivB64) },
      roomKey,
      fromBase64(ciphertextB64)
    );
    return JSON.parse(new TextDecoder().decode(decrypted)) as ChatPayload;
  } catch {
    return null;
  }
}

/** A fresh, one-off AES key per attachment — never reused, never wrapped
 * for anyone directly; it only ever travels inside an already-encrypted
 * message payload (see ChatPayload above). */
export async function encryptAttachment(file: File): Promise<{ blob: Blob; keyB64: string; ivB64: string }> {
  const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const buffer = await file.arrayBuffer();
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, buffer);
  const rawKey = await crypto.subtle.exportKey("raw", key);
  return { blob: new Blob([encrypted]), keyB64: toBase64(rawKey), ivB64: toBase64(iv) };
}

export async function decryptAttachment(blob: Blob, keyB64: string, ivB64: string, mimeType?: string): Promise<Blob> {
  const key = await crypto.subtle.importKey("raw", fromBase64(keyB64), { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
  const buffer = await blob.arrayBuffer();
  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromBase64(ivB64) }, key, buffer);
  return new Blob([decrypted], mimeType ? { type: mimeType } : undefined);
}

// Packs an offer/answer into the shortest reasonably-safe string we can put
// in a QR code or ask someone to type by hand. Uses the browser's native
// gzip (CompressionStream) — SDP text is very repetitive and compresses
// well — then base64url so it's safe in a QR payload and a plain text field
// alike. No server involved in any of this by design.
export interface LocalOfferPayload {
  v: 1;
  kind: "offer";
  sdp: string;
  hostId: string;
  hostName: string;
}

export interface LocalAnswerPayload {
  v: 1;
  kind: "answer";
  sdp: string;
  guestId: string;
  guestName: string;
}

export type LocalSignalingPayload = LocalOfferPayload | LocalAnswerPayload;

async function gzip(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new CompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function gunzip(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlToBytes(encoded: string): Uint8Array {
  const base64 = encoded.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(encoded.length / 4) * 4, "=");
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export async function encodeSignalingPayload(payload: LocalSignalingPayload): Promise<string> {
  const json = JSON.stringify(payload);
  const compressed = await gzip(new TextEncoder().encode(json));
  return bytesToBase64Url(compressed);
}

export async function decodeSignalingPayload(encoded: string): Promise<LocalSignalingPayload> {
  const compressed = base64UrlToBytes(encoded.trim());
  const bytes = await gunzip(compressed);
  const json = new TextDecoder().decode(bytes);
  const payload = JSON.parse(json) as LocalSignalingPayload;
  if (payload.v !== 1 || (payload.kind !== "offer" && payload.kind !== "answer")) {
    throw new Error("Not a SyncBlaze local-session code");
  }
  return payload;
}

/** For QR codes we don't need a URL, just the raw code — the in-app scanner
 * is what reads it. Splits into readable chunks purely for the manual-entry
 * display; the encoded value itself is unchanged. */
export function formatForManualDisplay(encoded: string): string {
  return encoded.match(/.{1,48}/g)?.join("\n") ?? encoded;
}

export function randomPeerId(): string {
  return crypto.randomUUID().slice(0, 8);
}

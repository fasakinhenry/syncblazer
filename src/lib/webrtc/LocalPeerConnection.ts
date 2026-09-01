// A WebRTC connection signaled entirely offline via QR code / manual code
// exchange — no server round-trip at any point. This mirrors the wire
// protocol used by the account-based PeerConnection (meta/chunk/done
// messages) so the same transfer UI can render either kind, but the
// connection-establishment shape is different on purpose: no trickle ICE
// (nothing to relay candidates through), so we wait for ICE gathering to
// finish and hand over one complete SDP blob per side instead.
const CHUNK_SIZE = 16 * 1024;
const BUFFERED_AMOUNT_LOW_THRESHOLD = CHUNK_SIZE * 8;
const ICE_GATHERING_TIMEOUT_MS = 4000;

/**
 * A full SDP carries a line for every network candidate the browser found —
 * often several, once you count WiFi, Bluetooth PAN, and virtual adapters.
 * That's most of what makes the QR/manual code long. Offline we have no
 * STUN/TURN configured, so everything gathered is already a same-network
 * "host" candidate; one good one is enough for ICE to connect. This trims
 * the SDP text we actually transmit down to the single best line, safely —
 * it only deletes whole lines from real, browser-generated SDP, it never
 * hand-constructs SDP grammar. The connection's own full candidate set is
 * untouched locally; this only affects what the other side is told.
 */
function trimToBestCandidate(sdp: string): string {
  const lines = sdp.split("\r\n");
  const candidateLines = lines.filter((l) => l.startsWith("a=candidate:"));
  if (candidateLines.length <= 1) return sdp;

  const best =
    candidateLines.find((l) => /\budp\b/i.test(l) && /\btyp host\b/i.test(l)) ??
    candidateLines.find((l) => /\btyp host\b/i.test(l)) ??
    candidateLines[0];

  let kept = false;
  const filtered = lines.filter((line) => {
    if (!line.startsWith("a=candidate:")) return true;
    if (line === best && !kept) {
      kept = true;
      return true;
    }
    return false;
  });
  return filtered.join("\r\n");
}

export type LocalTransferKind = "file" | "image" | "text" | "link";

export interface LocalTransferMeta {
  id: string;
  name: string;
  size: number;
  mimeType?: string;
  kind: LocalTransferKind;
  textContent?: string;
  /** True when this transfer is meant for every peer in the session, not
   * just the one it was sent to directly — the host relays it onward. */
  broadcast?: boolean;
  /** Ephemeral session peer id of whoever originally sent it, so a relayed
   * copy still shows the right sender name instead of "the host". */
  fromPeerId?: string;
  fromPeerName?: string;
}

type LocalControlMessage =
  | { type: "meta"; meta: LocalTransferMeta }
  | { type: "done"; id: string }
  | { type: "cancel"; id: string };

export interface LocalPeerConnectionHandlers {
  onIncomingMeta?: (meta: LocalTransferMeta) => void;
  onProgress?: (id: string, bytesTransferred: number, total: number) => void;
  onFileComplete?: (id: string, blob: Blob, meta: LocalTransferMeta) => void;
  onTextComplete?: (meta: LocalTransferMeta) => void;
  onError?: (message: string) => void;
  onChannelOpen?: () => void;
  onClose?: () => void;
  /** Fires for every raw message this connection receives (a meta/done/cancel
   * JSON string, or a binary chunk) — used by the session host to relay
   * broadcast transfers on to every other connected peer. Non-broadcast
   * traffic is harmless to pass through here too; the orchestrator decides
   * whether to actually relay it. */
  onRawMessage?: (data: string | ArrayBuffer) => void;
}

export class LocalPeerConnection {
  private pc: RTCPeerConnection;
  private channel: RTCDataChannel | null = null;
  private handlers: LocalPeerConnectionHandlers;

  private incomingMeta: LocalTransferMeta | null = null;
  private incomingChunks: ArrayBuffer[] = [];
  private incomingBytes = 0;
  private sendCancelled = new Set<string>();

  constructor(handlers: LocalPeerConnectionHandlers = {}) {
    this.handlers = handlers;
    // No STUN/TURN: those need internet to reach, which this path
    // deliberately assumes it doesn't have. ICE will only surface local
    // host candidates, which is exactly what a same-network connection needs.
    this.pc = new RTCPeerConnection({ iceServers: [] });

    this.pc.onconnectionstatechange = () => {
      if (this.pc.connectionState === "failed" || this.pc.connectionState === "closed") {
        this.handlers.onClose?.();
      }
    };
    this.pc.ondatachannel = (event) => {
      this.channel = event.channel;
      this.wireChannel();
    };
  }

  /** Host side: create an offer and wait for ICE gathering to finish so the
   * returned SDP is "complete" (self-contained, nothing more to exchange). */
  async createOffer(): Promise<string> {
    this.channel = this.pc.createDataChannel("syncblaze-local");
    this.wireChannel();
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    await this.waitForIceGatheringComplete();
    return trimToBestCandidate(this.pc.localDescription!.sdp);
  }

  /** Guest side: consume the host's offer, produce a complete answer. */
  async acceptOffer(offerSdp: string): Promise<string> {
    await this.pc.setRemoteDescription({ type: "offer", sdp: offerSdp });
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);
    await this.waitForIceGatheringComplete();
    return trimToBestCandidate(this.pc.localDescription!.sdp);
  }

  /** Host side: finish the handshake once the guest's answer comes back. */
  async acceptAnswer(answerSdp: string): Promise<void> {
    await this.pc.setRemoteDescription({ type: "answer", sdp: answerSdp });
  }

  /** The host doesn't know who's connecting (name/id) until their answer
   * arrives, so the real handlers get attached here instead of at
   * construction time — safe because they can't fire before this point,
   * nothing arrives over the channel until it's open. */
  setHandlers(handlers: LocalPeerConnectionHandlers) {
    this.handlers = handlers;
  }

  waitForChannelOpen(timeoutMs = 10000): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.channel?.readyState === "open") {
        resolve();
        return;
      }

      let settled = false;
      const cleanup = () => {
        clearTimeout(timeout);
        clearInterval(interval);
        this.pc.removeEventListener("connectionstatechange", onStateChange);
      };
      const succeed = () => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve();
      };
      const fail = (message: string) => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(new Error(message));
      };

      const timeout = setTimeout(() => fail("Connection timed out"), timeoutMs);
      const interval = setInterval(() => {
        if (this.channel?.readyState === "open") succeed();
      }, 150);
      const onStateChange = () => {
        if (this.pc.connectionState === "failed") fail("Connection failed");
      };
      this.pc.addEventListener("connectionstatechange", onStateChange);
    });
  }

  private waitForIceGatheringComplete(): Promise<void> {
    if (this.pc.iceGatheringState === "complete") return Promise.resolve();
    return new Promise((resolve) => {
      const check = () => {
        if (this.pc.iceGatheringState === "complete") {
          this.pc.removeEventListener("icegatheringstatechange", check);
          clearTimeout(timeout);
          resolve();
        }
      };
      // Don't hang forever on an unusual network config — proceed with
      // whatever candidates were found in time rather than blocking the UI.
      const timeout = setTimeout(() => {
        this.pc.removeEventListener("icegatheringstatechange", check);
        resolve();
      }, ICE_GATHERING_TIMEOUT_MS);
      this.pc.addEventListener("icegatheringstatechange", check);
    });
  }

  private wireChannel() {
    if (!this.channel) return;
    this.channel.binaryType = "arraybuffer";
    this.channel.bufferedAmountLowThreshold = BUFFERED_AMOUNT_LOW_THRESHOLD;

    this.channel.onopen = () => this.handlers.onChannelOpen?.();
    this.channel.onclose = () => this.handlers.onClose?.();
    this.channel.onerror = () => this.handlers.onError?.("The local connection dropped.");

    this.channel.onmessage = (event: MessageEvent<string | ArrayBuffer>) => {
      this.handlers.onRawMessage?.(event.data);
      if (typeof event.data === "string") {
        this.handleControlMessage(JSON.parse(event.data) as LocalControlMessage);
      } else {
        this.handleChunk(event.data);
      }
    };
  }

  private handleControlMessage(message: LocalControlMessage) {
    if (message.type === "meta") {
      this.incomingMeta = message.meta;
      this.incomingChunks = [];
      this.incomingBytes = 0;
      this.handlers.onIncomingMeta?.(message.meta);

      if (message.meta.kind === "text" || message.meta.kind === "link") {
        this.handlers.onTextComplete?.(message.meta);
        this.incomingMeta = null;
      }
      return;
    }

    if (message.type === "done" && this.incomingMeta?.id === message.id) {
      const blob = new Blob(this.incomingChunks, { type: this.incomingMeta.mimeType || "application/octet-stream" });
      this.handlers.onFileComplete?.(message.id, blob, this.incomingMeta);
      this.incomingMeta = null;
      this.incomingChunks = [];
      this.incomingBytes = 0;
      return;
    }

    if (message.type === "cancel") {
      this.incomingMeta = null;
      this.incomingChunks = [];
      this.incomingBytes = 0;
    }
  }

  private handleChunk(chunk: ArrayBuffer) {
    if (!this.incomingMeta) return;
    this.incomingChunks.push(chunk);
    this.incomingBytes += chunk.byteLength;
    this.handlers.onProgress?.(this.incomingMeta.id, this.incomingBytes, this.incomingMeta.size);
  }

  /** Send a raw message as-is (used by the session host to relay a
   * broadcast transfer's chunks on to every other connected peer). */
  rawSend(data: string | ArrayBuffer) {
    if (this.channel?.readyState === "open") this.channel.send(data as never);
  }

  sendText(id: string, content: string, kind: "text" | "link", name: string, broadcastMeta?: Partial<LocalTransferMeta>) {
    if (!this.channel || this.channel.readyState !== "open") throw new Error("Not connected");
    const meta: LocalTransferMeta = { id, name, size: content.length, kind, textContent: content, ...broadcastMeta };
    this.channel.send(JSON.stringify({ type: "meta", meta } satisfies LocalControlMessage));
  }

  async sendFile(
    id: string,
    file: File,
    kind: "file" | "image",
    onProgress?: (sent: number, total: number) => void,
    broadcastMeta?: Partial<LocalTransferMeta>
  ) {
    if (!this.channel || this.channel.readyState !== "open") throw new Error("Not connected");
    const channel = this.channel;

    const meta: LocalTransferMeta = { id, name: file.name, size: file.size, mimeType: file.type, kind, ...broadcastMeta };
    channel.send(JSON.stringify({ type: "meta", meta } satisfies LocalControlMessage));

    let offset = 0;
    while (offset < file.size) {
      if (this.sendCancelled.has(id)) {
        this.sendCancelled.delete(id);
        channel.send(JSON.stringify({ type: "cancel", id } satisfies LocalControlMessage));
        return;
      }
      if (channel.bufferedAmount > BUFFERED_AMOUNT_LOW_THRESHOLD) {
        await this.waitForBufferedAmountLow();
      }
      const slice = file.slice(offset, offset + CHUNK_SIZE);
      const buffer = await slice.arrayBuffer();
      channel.send(buffer);
      offset += buffer.byteLength;
      onProgress?.(offset, file.size);
    }

    channel.send(JSON.stringify({ type: "done", id } satisfies LocalControlMessage));
  }

  cancelSend(id: string) {
    this.sendCancelled.add(id);
  }

  private waitForBufferedAmountLow(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.channel) return resolve();
      const handler = () => {
        this.channel?.removeEventListener("bufferedamountlow", handler);
        resolve();
      };
      this.channel.addEventListener("bufferedamountlow", handler);
    });
  }

  close() {
    this.channel?.close();
    this.pc.close();
  }
}

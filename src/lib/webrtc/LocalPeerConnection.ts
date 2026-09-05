// A WebRTC connection signaled entirely offline via QR code / manual code
// exchange — no server round-trip at any point. This mirrors the wire
// protocol used by the account-based PeerConnection (meta/chunk/done
// messages) so the same transfer UI can render either kind, but the
// connection-establishment shape is different on purpose: no trickle ICE
// (nothing to relay candidates through), so we wait for ICE gathering to
// finish and hand over one complete SDP blob per side instead.
const CHUNK_SIZE = 16 * 1024;
const BUFFERED_AMOUNT_LOW_THRESHOLD = CHUNK_SIZE * 8;
// Wait for ICE gathering to genuinely finish rather than guessing off a
// short clock. 4s was cutting gathering off before some networks had found
// their real usable candidate at all — this is the single biggest cause of
// "connects for me, hangs for everyone else." 10s is still bounded so the
// UI never hangs forever on a truly stalled gather.
const ICE_GATHERING_TIMEOUT_MS = 10000;

/**
 * A full SDP carries a line for every network candidate the browser found —
 * often several, once you count WiFi, Bluetooth PAN, and virtual adapters.
 * That's most of what makes the QR/manual code long. Offline we have no
 * STUN/TURN configured, so everything gathered is already a same-network
 * "host" candidate.
 *
 * Trying to cut this down hard (earlier versions capped at 1, then 3)
 * shortened the code but hurt real connectivity: phones and laptops
 * routinely have more than one active interface at a time (WiFi + a virtual
 * adapter, a VPN, etc), and if the few guessed candidates happen to be on
 * the wrong interface, ICE has nothing else to fall back to and the
 * connection genuinely fails on someone else's machine even though it
 * worked on ours. The payload is already gzip+base64url compressed, so a
 * substantially larger candidate budget is still a perfectly scannable QR —
 * this only ever deletes whole lines from real, browser-generated SDP,
 * never hand-constructs SDP grammar. The connection's own full local
 * candidate set is untouched; this only affects what gets told to the
 * other side.
 */
function trimCandidates(sdp: string, maxCandidates = 10): string {
  const lines = sdp.split("\r\n");
  const candidateLines = lines.filter((l) => l.startsWith("a=candidate:"));
  if (candidateLines.length <= maxCandidates) return sdp;

  const isIPv4 = (l: string) => !l.includes("::") && /(\d{1,3}\.){3}\d{1,3}/.test(l);
  const scored = candidateLines
    .map((line, index) => ({
      line,
      // Stable order among ties: UDP + host + IPv4 first, otherwise keep
      // the browser's own original ordering (it already prioritizes).
      score: (/\budp\b/i.test(line) ? 4 : 0) + (/\btyp host\b/i.test(line) ? 2 : 0) + (isIPv4(line) ? 1 : 0) - index * 0.001,
    }))
    .sort((a, b) => b.score - a.score);

  const keep = new Set(scored.slice(0, maxCandidates).map((s) => s.line));
  return lines.filter((line) => !line.startsWith("a=candidate:") || keep.has(line)).join("\r\n");
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
      if (this.pc.connectionState === "closed") {
        this.handlers.onClose?.();
        return;
      }
      if (this.pc.connectionState === "failed") {
        // Same reasoning as waitForChannelOpen: a background tab (very
        // normal mid-handshake here — you look away to go type a code on
        // the other device) can make the browser report "failed" for
        // reasons that have nothing to do with the connection once it's
        // foregrounded again. Give it a few seconds to prove that's real
        // before treating this peer as actually gone.
        setTimeout(() => {
          if (this.pc.connectionState === "failed" || this.pc.connectionState === "closed") {
            this.handlers.onClose?.();
          }
        }, 5000);
      }
    };
    this.pc.ondatachannel = (event) => {
      this.channel = event.channel;
      this.wireChannel();
    };
  }

  /** Host side: create an offer and wait for ICE gathering to finish so the
   * returned SDP is "complete" (self-contained, nothing more to exchange). */
  async createOffer(onProgress?: (candidateCount: number) => void): Promise<string> {
    this.channel = this.pc.createDataChannel("syncblaze-local");
    this.wireChannel();
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    await this.waitForIceGatheringComplete(onProgress);
    return trimCandidates(this.pc.localDescription!.sdp);
  }

  /** Guest side: consume the host's offer, produce a complete answer. */
  async acceptOffer(offerSdp: string, onProgress?: (candidateCount: number) => void): Promise<string> {
    await this.pc.setRemoteDescription({ type: "offer", sdp: offerSdp });
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);
    await this.waitForIceGatheringComplete(onProgress);
    return trimCandidates(this.pc.localDescription!.sdp);
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

  /**
   * Waits for the data channel to open. Deliberately does NOT treat a
   * `connectionState === "failed"` signal as an immediate, permanent
   * give-up: the natural flow here (scan a code on the phone, then look
   * away to go type/scan the reply on the other device) routinely
   * backgrounds the tab for a bit, and mobile browsers can suspend JS
   * timers and briefly disrupt the network state while backgrounded —
   * producing a "failed" reading that has nothing to do with whether the
   * connection actually works once the tab is active again. The timeout
   * is the only thing that gives up here; a visibilitychange listener
   * forces an immediate re-check when the tab comes back to the
   * foreground, so a throttled poll interval doesn't add extra delay on
   * top of however long the person was away.
   */
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
        document.removeEventListener("visibilitychange", onVisible);
      };
      const check = () => {
        if (settled) return;
        if (this.channel?.readyState === "open") {
          settled = true;
          cleanup();
          resolve();
        }
      };

      const timeout = setTimeout(() => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(new Error("Connection timed out"));
      }, timeoutMs);
      const interval = setInterval(check, 150);
      const onVisible = () => {
        if (document.visibilityState === "visible") check();
      };
      document.addEventListener("visibilitychange", onVisible);
    });
  }

  private waitForIceGatheringComplete(onProgress?: (candidateCount: number) => void): Promise<void> {
    if (this.pc.iceGatheringState === "complete") return Promise.resolve();
    return new Promise((resolve) => {
      let candidateCount = 0;
      const onCandidate = (event: RTCPeerConnectionIceEvent) => {
        if (event.candidate) {
          candidateCount += 1;
          onProgress?.(candidateCount);
        }
      };
      const check = () => {
        if (this.pc.iceGatheringState === "complete") {
          cleanup();
          resolve();
        }
      };
      const cleanup = () => {
        this.pc.removeEventListener("icegatheringstatechange", check);
        this.pc.removeEventListener("icecandidate", onCandidate as EventListener);
        clearTimeout(timeout);
      };
      // Don't hang forever on an unusual network config — proceed with
      // whatever candidates were found in time rather than blocking the UI.
      const timeout = setTimeout(() => {
        cleanup();
        resolve();
      }, ICE_GATHERING_TIMEOUT_MS);
      this.pc.addEventListener("icegatheringstatechange", check);
      this.pc.addEventListener("icecandidate", onCandidate as EventListener);
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

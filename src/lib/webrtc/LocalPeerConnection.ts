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
// Same self-healing grace window as the "failed" backgrounded-tab handling
// below, extended to also cover "disconnected" (see TrickleWebRTCPeer.ts,
// which shares this reasoning).
const DISCONNECT_GRACE_MS = 6000;

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

/** Thrown by `sendFile` when the channel drops mid-send. Carries how far the
 * send loop actually got — see TrickleWebRTCPeer.ts's identical class for
 * the full reasoning (the two wire protocols are deliberately kept in sync). */
export class LocalTransferInterruptedError extends Error {
  readonly transferId: string;
  readonly offsetSent: number;

  constructor(transferId: string, offsetSent: number) {
    super("Transfer interrupted");
    this.name = "LocalTransferInterruptedError";
    this.transferId = transferId;
    this.offsetSent = offsetSent;
  }
}

type LocalControlMessage =
  | { type: "meta"; meta: LocalTransferMeta }
  | { type: "done"; id: string }
  | { type: "cancel"; id: string }
  // Receiver -> sender, unsolicited, sent the moment a channel (re)opens if
  // a partial receive for `id` is still held.
  | { type: "resumeOffset"; id: string; bytesReceived: number };

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
  /** The channel died while a receive was in progress. There's no persistent
   * signaling channel here (see the class doc comment) so nothing
   * auto-reconnects — this exists purely so a caller can offer "resume from
   * X%" if the two devices manually re-pair. */
  onReceiveInterrupted?: (meta: LocalTransferMeta, chunks: ArrayBuffer[], bytesReceived: number) => void;
  /** A peer told us how much of a transfer it already has — resume `sendFile`
   * from that offset instead of restarting, if the two devices re-pair. */
  onResumeOffsetReceived?: (id: string, bytesReceived: number) => void;
}

export class LocalPeerConnection {
  private pc: RTCPeerConnection;
  private channel: RTCDataChannel | null = null;
  private handlers: LocalPeerConnectionHandlers;

  private incomingMeta: LocalTransferMeta | null = null;
  private incomingChunks: ArrayBuffer[] = [];
  private incomingBytes = 0;
  private sendCancelled = new Set<string>();
  private sendControllers = new Map<string, AbortController>();
  private disconnectGraceTimer: ReturnType<typeof setTimeout> | null = null;
  private isDead = false;

  constructor(handlers: LocalPeerConnectionHandlers = {}) {
    this.handlers = handlers;
    // No STUN/TURN: those need internet to reach, which this path
    // deliberately assumes it doesn't have. ICE will only surface local
    // host candidates, which is exactly what a same-network connection needs.
    this.pc = new RTCPeerConnection({ iceServers: [] });

    this.pc.onconnectionstatechange = () => {
      const state = this.pc.connectionState;
      if (state === "connected") {
        if (this.disconnectGraceTimer) {
          clearTimeout(this.disconnectGraceTimer);
          this.disconnectGraceTimer = null;
        }
        return;
      }
      if (state === "closed") {
        if (this.disconnectGraceTimer) {
          clearTimeout(this.disconnectGraceTimer);
          this.disconnectGraceTimer = null;
        }
        this.handleLinkDead();
        return;
      }
      if ((state === "disconnected" || state === "failed") && !this.disconnectGraceTimer) {
        // Same reasoning as waitForChannelOpen: a background tab (very
        // normal mid-handshake here — you look away to go type a code on
        // the other device) can make the browser report "disconnected" or
        // "failed" for reasons that have nothing to do with the connection
        // once it's foregrounded again. Give it a few seconds to prove
        // that's real before treating this peer as actually gone.
        this.disconnectGraceTimer = setTimeout(() => {
          this.disconnectGraceTimer = null;
          if (this.pc.connectionState !== "connected") this.handleLinkDead();
        }, DISCONNECT_GRACE_MS);
      }
    };
    this.pc.ondatachannel = (event) => {
      this.channel = event.channel;
      this.wireChannel();
    };
  }

  private handleLinkDead() {
    if (this.isDead) return;
    this.isDead = true;
    for (const controller of this.sendControllers.values()) controller.abort();
    if (this.incomingMeta) {
      this.handlers.onReceiveInterrupted?.(this.incomingMeta, this.incomingChunks, this.incomingBytes);
    }
    this.handlers.onClose?.();
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
    this.channel.onclose = () => this.handleLinkDead();
    this.channel.onerror = () => {
      this.handlers.onError?.("The local connection dropped.");
      this.handleLinkDead();
    };

    this.channel.onmessage = (event: MessageEvent<string | ArrayBuffer>) => {
      this.handlers.onRawMessage?.(event.data);
      if (typeof event.data === "string") {
        this.handleControlMessage(JSON.parse(event.data) as LocalControlMessage);
      } else {
        this.handleChunk(event.data);
      }
    };
  }

  /** Prime a fresh instance with an in-progress receive carried over from a
   * dead connection (see `onReceiveInterrupted`) if the two devices manually
   * re-pair — the resumed sender skips re-sending `meta` and picks up chunk
   * delivery straight from `bytesReceived`. */
  primeResumedReceive(meta: LocalTransferMeta, chunks: ArrayBuffer[], bytesReceived: number) {
    this.incomingMeta = meta;
    this.incomingChunks = chunks;
    this.incomingBytes = bytesReceived;
  }

  /** Tell the other side how much of `id` we already have — sent unsolicited
   * the moment a fresh channel opens if a partial receive is still held. */
  sendResumeOffset(id: string, bytesReceived: number) {
    if (!this.channel || this.channel.readyState !== "open") return;
    this.channel.send(JSON.stringify({ type: "resumeOffset", id, bytesReceived } satisfies LocalControlMessage));
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
      return;
    }

    if (message.type === "resumeOffset") {
      this.handlers.onResumeOffsetReceived?.(message.id, message.bytesReceived);
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

  /** `resumeFromOffset` skips re-sending `meta` (the receiver already has it
   * from the original attempt) and starts the chunked send loop partway
   * through the file instead of from 0. On a mid-send drop, rejects with
   * `LocalTransferInterruptedError` carrying how far the loop actually got —
   * known limitation: a `File` object can't survive a page reload, so this
   * only resumes drops within the same page session, not after a refresh. */
  async sendFile(
    id: string,
    file: File,
    kind: "file" | "image",
    onProgress?: (sent: number, total: number) => void,
    broadcastMeta?: Partial<LocalTransferMeta>,
    resumeFromOffset = 0
  ) {
    if (!this.channel || this.channel.readyState !== "open") throw new Error("Not connected");
    const channel = this.channel;

    const controller = new AbortController();
    this.sendControllers.set(id, controller);

    if (resumeFromOffset === 0) {
      const meta: LocalTransferMeta = { id, name: file.name, size: file.size, mimeType: file.type, kind, ...broadcastMeta };
      channel.send(JSON.stringify({ type: "meta", meta } satisfies LocalControlMessage));
    }

    let offset = resumeFromOffset;
    try {
      while (offset < file.size) {
        if (controller.signal.aborted) throw new LocalTransferInterruptedError(id, offset);
        if (this.sendCancelled.has(id)) {
          this.sendCancelled.delete(id);
          channel.send(JSON.stringify({ type: "cancel", id } satisfies LocalControlMessage));
          return;
        }
        if (channel.bufferedAmount > BUFFERED_AMOUNT_LOW_THRESHOLD) {
          await this.waitForBufferedAmountLow(controller.signal);
          if (controller.signal.aborted) throw new LocalTransferInterruptedError(id, offset);
        }
        const slice = file.slice(offset, offset + CHUNK_SIZE);
        const buffer = await slice.arrayBuffer();
        if (controller.signal.aborted || channel.readyState !== "open") throw new LocalTransferInterruptedError(id, offset);
        channel.send(buffer);
        offset += buffer.byteLength;
        onProgress?.(offset, file.size);
      }

      channel.send(JSON.stringify({ type: "done", id } satisfies LocalControlMessage));
    } finally {
      this.sendControllers.delete(id);
    }
  }

  cancelSend(id: string) {
    this.sendCancelled.add(id);
  }

  private waitForBufferedAmountLow(signal?: AbortSignal): Promise<void> {
    return new Promise((resolve) => {
      if (!this.channel) return resolve();
      const handler = () => {
        this.channel?.removeEventListener("bufferedamountlow", handler);
        signal?.removeEventListener("abort", onAbort);
        resolve();
      };
      const onAbort = () => {
        this.channel?.removeEventListener("bufferedamountlow", handler);
        resolve();
      };
      this.channel.addEventListener("bufferedamountlow", handler);
      signal?.addEventListener("abort", onAbort);
    });
  }

  close() {
    this.channel?.close();
    this.pc.close();
  }
}

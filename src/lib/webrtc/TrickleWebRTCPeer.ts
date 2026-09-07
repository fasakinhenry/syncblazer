// A WebRTC connection signaled over a live channel (Socket.IO to the cloud
// for "Quick Connect", or a raw local WebSocket to the desktop companion
// app for LAN pairing) — real trickle ICE, exchanging candidates as they're
// discovered instead of gathering under a timeout and guessing. This is
// deliberately the same shape as the account-based PeerConnection.ts (which
// proved this pattern in production), generalized so it isn't hardcoded to
// "signal via socket.emit to a deviceId" — the caller supplies a
// `sendSignal` function instead, so the exact same class drives both the
// cloud relay and the LAN relay transports.
const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:openrelay.metered.ca:80" },
  { urls: "turn:openrelay.metered.ca:80", username: "openrelayproject", credential: "openrelayproject" },
  { urls: "turn:openrelay.metered.ca:443", username: "openrelayproject", credential: "openrelayproject" },
  {
    urls: "turn:openrelay.metered.ca:443?transport=tcp",
    username: "openrelayproject",
    credential: "openrelayproject",
  },
];
const CHUNK_SIZE = 16 * 1024;
const BUFFERED_AMOUNT_LOW_THRESHOLD = CHUNK_SIZE * 8;
const CONNECT_TIMEOUT_MS = 20000;
// WebRTC frequently reports "disconnected" for a few seconds and then heals
// on its own (a missed STUN keepalive, a brief Wi-Fi blip) — treating it as
// dead immediately is why drops have felt instant. Give it this long to
// self-heal before treating the link as genuinely gone.
const DISCONNECT_GRACE_MS = 6000;

export type TrickleTransferKind = "file" | "image" | "text" | "link";

export interface TrickleTransferMeta {
  id: string;
  name: string;
  size: number;
  mimeType?: string;
  kind: TrickleTransferKind;
  textContent?: string;
}

/** Thrown by `sendFile` when the channel drops mid-send. Carries how far the
 * send loop actually got so a caller can track it as a pending resume — the
 * real resume point still comes from the receiver's own `resumeOffset`
 * (authoritative, since it reflects what was actually received, not just
 * queued to send), this is only for UI/bookkeeping continuity. */
export class TransferInterruptedError extends Error {
  readonly transferId: string;
  readonly offsetSent: number;

  constructor(transferId: string, offsetSent: number) {
    super("Transfer interrupted");
    this.name = "TransferInterruptedError";
    this.transferId = transferId;
    this.offsetSent = offsetSent;
  }
}

type ControlMessage =
  | { type: "meta"; meta: TrickleTransferMeta }
  | { type: "done"; id: string }
  | { type: "cancel"; id: string }
  // Receiver -> sender, unsolicited, sent the moment a channel (re)opens if
  // a partial receive for `id` is still held.
  | { type: "resumeOffset"; id: string; bytesReceived: number };

export interface TrickleWebRTCPeerHandlers {
  onIncomingMeta?: (meta: TrickleTransferMeta) => void;
  onProgress?: (id: string, bytesTransferred: number, total: number) => void;
  onFileComplete?: (id: string, blob: Blob, meta: TrickleTransferMeta) => void;
  onTextComplete?: (meta: TrickleTransferMeta) => void;
  onError?: (message: string) => void;
  onChannelOpen?: () => void;
  onClose?: () => void;
  /** The channel died while a receive was in progress. `chunks`/`bytesReceived`
   * are handed over so the owning context can hold them (this instance is
   * about to be torn down) and prime a fresh connection to resume later. */
  onReceiveInterrupted?: (meta: TrickleTransferMeta, chunks: ArrayBuffer[], bytesReceived: number) => void;
  /** A peer told us how much of a transfer it already has — the signal to
   * resume `sendFile` from that offset instead of restarting. */
  onResumeOffsetReceived?: (id: string, bytesReceived: number) => void;
}

export type SendSignalFn = (kind: "offer" | "answer" | "ice-candidate", data: unknown) => void;

export class TrickleWebRTCPeer {
  private pc: RTCPeerConnection;
  private channel: RTCDataChannel | null = null;
  private readonly sendSignal: SendSignalFn;
  private handlers: TrickleWebRTCPeerHandlers;
  private pendingIceCandidates: RTCIceCandidateInit[] = [];
  private hasRemoteDescription = false;

  private incomingMeta: TrickleTransferMeta | null = null;
  private incomingChunks: ArrayBuffer[] = [];
  private incomingBytes = 0;
  private sendCancelled = new Set<string>();
  private sendControllers = new Map<string, AbortController>();
  private disconnectGraceTimer: ReturnType<typeof setTimeout> | null = null;
  private isDead = false;

  constructor(sendSignal: SendSignalFn, handlers: TrickleWebRTCPeerHandlers = {}) {
    this.sendSignal = sendSignal;
    this.handlers = handlers;
    this.pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    this.pc.onicecandidate = (event) => {
      if (event.candidate) this.sendSignal("ice-candidate", event.candidate.toJSON());
    };
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
      // "disconnected" and "failed" both frequently self-heal within a few
      // seconds — give the link a grace window before treating it as dead
      // rather than killing the transfer on the first blip.
      if ((state === "disconnected" || state === "failed") && !this.disconnectGraceTimer) {
        this.disconnectGraceTimer = setTimeout(() => {
          this.disconnectGraceTimer = null;
          const stillDown = this.pc.connectionState !== "connected";
          if (stillDown) this.handleLinkDead();
        }, DISCONNECT_GRACE_MS);
      }
    };
    this.pc.ondatachannel = (event) => {
      this.channel = event.channel;
      this.wireChannel();
    };
  }

  /** The channel/link is genuinely gone (not just a transient blip) — hand
   * over any partial receive so the owning context can hold it for a resume,
   * abort any in-flight sends, and notify the caller. Guarded so a deliberate
   * `close()` (leaving the session) and the resulting cascade of close/state
   * events don't fire this more than once. */
  private handleLinkDead() {
    if (this.isDead) return;
    this.isDead = true;
    for (const controller of this.sendControllers.values()) controller.abort();
    if (this.incomingMeta) {
      this.handlers.onReceiveInterrupted?.(this.incomingMeta, this.incomingChunks, this.incomingBytes);
    }
    this.handlers.onClose?.();
  }

  /** The side that discovers/initiates the pairing (the one who scanned, or
   * whoever the app designates as initiator) creates the offer. */
  async connect(): Promise<void> {
    if (this.channel?.readyState === "open") return;

    this.channel = this.pc.createDataChannel("syncblaze-quickpair");
    this.wireChannel();

    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    this.sendSignal("offer", offer);

    await this.waitForChannelOpen();
  }

  /** The other side just waits for the offer to arrive via handleSignal and
   * for the resulting data channel to open — no action needed here beyond
   * setting handlers (already done at construction) and awaiting. */
  waitUntilOpen(): Promise<void> {
    return this.waitForChannelOpen();
  }

  setHandlers(handlers: TrickleWebRTCPeerHandlers) {
    this.handlers = handlers;
  }

  private waitForChannelOpen(): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Connection timed out")), CONNECT_TIMEOUT_MS);
      const check = () => {
        if (this.channel?.readyState === "open") {
          clearTimeout(timeout);
          resolve();
        }
      };
      check();
      const channel = this.channel;
      if (channel) {
        const originalOnOpen = channel.onopen;
        channel.onopen = (e) => {
          originalOnOpen?.call(channel, e);
          clearTimeout(timeout);
          resolve();
        };
      }
    });
  }

  private wireChannel() {
    if (!this.channel) return;
    this.channel.binaryType = "arraybuffer";
    this.channel.bufferedAmountLowThreshold = BUFFERED_AMOUNT_LOW_THRESHOLD;

    this.channel.onopen = () => this.handlers.onChannelOpen?.();
    this.channel.onclose = () => this.handleLinkDead();
    this.channel.onerror = () => {
      this.handlers.onError?.("The connection to the other device dropped.");
      this.handleLinkDead();
    };

    this.channel.onmessage = (event: MessageEvent<string | ArrayBuffer>) => {
      if (typeof event.data === "string") {
        this.handleControlMessage(JSON.parse(event.data) as ControlMessage);
      } else {
        this.handleChunk(event.data);
      }
    };
  }

  /** Prime a fresh instance with an in-progress receive carried over from a
   * dead connection (see `onReceiveInterrupted`) — the resumed sender skips
   * re-sending `meta` and picks up chunk delivery straight from `bytesReceived`. */
  primeResumedReceive(meta: TrickleTransferMeta, chunks: ArrayBuffer[], bytesReceived: number) {
    this.incomingMeta = meta;
    this.incomingChunks = chunks;
    this.incomingBytes = bytesReceived;
  }

  /** Tell the other side how much of `id` we already have — sent unsolicited
   * the moment a fresh channel opens if a partial receive is still held. */
  sendResumeOffset(id: string, bytesReceived: number) {
    if (!this.channel || this.channel.readyState !== "open") return;
    this.channel.send(JSON.stringify({ type: "resumeOffset", id, bytesReceived } satisfies ControlMessage));
  }

  private handleControlMessage(message: ControlMessage) {
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

  sendText(id: string, content: string, kind: "text" | "link", name: string) {
    if (!this.channel || this.channel.readyState !== "open") throw new Error("Not connected");
    const meta: TrickleTransferMeta = { id, name, size: content.length, kind, textContent: content };
    this.channel.send(JSON.stringify({ type: "meta", meta } satisfies ControlMessage));
  }

  /** `resumeFromOffset` skips re-sending `meta` (the receiver already has it
   * from the original attempt) and starts the chunked send loop partway
   * through the file instead of from 0. On a mid-send drop, rejects with
   * `TransferInterruptedError` carrying how far the loop actually got —
   * known limitation: a `File` object can't survive a page reload, so this
   * only resumes drops within the same page session, not after a refresh. */
  async sendFile(
    id: string,
    file: File,
    kind: "file" | "image",
    onProgress?: (sent: number, total: number) => void,
    resumeFromOffset = 0
  ) {
    if (!this.channel || this.channel.readyState !== "open") throw new Error("Not connected");
    const channel = this.channel;

    const controller = new AbortController();
    this.sendControllers.set(id, controller);

    if (resumeFromOffset === 0) {
      const meta: TrickleTransferMeta = { id, name: file.name, size: file.size, mimeType: file.type, kind };
      channel.send(JSON.stringify({ type: "meta", meta } satisfies ControlMessage));
    }

    let offset = resumeFromOffset;
    try {
      while (offset < file.size) {
        if (controller.signal.aborted) throw new TransferInterruptedError(id, offset);
        if (this.sendCancelled.has(id)) {
          this.sendCancelled.delete(id);
          channel.send(JSON.stringify({ type: "cancel", id } satisfies ControlMessage));
          return;
        }
        if (channel.bufferedAmount > BUFFERED_AMOUNT_LOW_THRESHOLD) {
          await this.waitForBufferedAmountLow(controller.signal);
          if (controller.signal.aborted) throw new TransferInterruptedError(id, offset);
        }
        const slice = file.slice(offset, offset + CHUNK_SIZE);
        const buffer = await slice.arrayBuffer();
        if (controller.signal.aborted || channel.readyState !== "open") throw new TransferInterruptedError(id, offset);
        channel.send(buffer);
        offset += buffer.byteLength;
        onProgress?.(offset, file.size);
      }

      channel.send(JSON.stringify({ type: "done", id } satisfies ControlMessage));
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

  /** Feed in a signal relayed by whichever transport is in use. */
  async handleSignal(kind: "offer" | "answer" | "ice-candidate", data: unknown) {
    try {
      if (kind === "offer") {
        await this.pc.setRemoteDescription(new RTCSessionDescription(data as RTCSessionDescriptionInit));
        this.hasRemoteDescription = true;
        await this.flushPendingIceCandidates();

        const answer = await this.pc.createAnswer();
        await this.pc.setLocalDescription(answer);
        this.sendSignal("answer", answer);
      } else if (kind === "answer") {
        await this.pc.setRemoteDescription(new RTCSessionDescription(data as RTCSessionDescriptionInit));
        this.hasRemoteDescription = true;
        await this.flushPendingIceCandidates();
      } else if (kind === "ice-candidate") {
        if (this.hasRemoteDescription) {
          await this.pc.addIceCandidate(new RTCIceCandidate(data as RTCIceCandidateInit));
        } else {
          this.pendingIceCandidates.push(data as RTCIceCandidateInit);
        }
      }
    } catch {
      this.handlers.onError?.("Couldn't establish a direct connection to that device.");
    }
  }

  private async flushPendingIceCandidates() {
    const queued = this.pendingIceCandidates;
    this.pendingIceCandidates = [];
    for (const candidate of queued) {
      await this.pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => undefined);
    }
  }

  close() {
    this.channel?.close();
    this.pc.close();
  }
}

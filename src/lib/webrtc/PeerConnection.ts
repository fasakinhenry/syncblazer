import type { Socket } from "socket.io-client";

const ICE_SERVERS: RTCIceServer[] = [{ urls: "stun:stun.l.google.com:19302" }];
const CHUNK_SIZE = 16 * 1024; // 16KB: safe across browsers for RTCDataChannel
const BUFFERED_AMOUNT_LOW_THRESHOLD = CHUNK_SIZE * 8;
const CONNECT_TIMEOUT_MS = 8000;

export type TransferKind = "file" | "image" | "text" | "link";

export interface TransferMeta {
  id: string;
  name: string;
  size: number;
  mimeType?: string;
  kind: TransferKind;
  textContent?: string;
}

type ControlMessage =
  | { type: "meta"; meta: TransferMeta }
  | { type: "done"; id: string }
  | { type: "cancel"; id: string };

export interface PeerConnectionHandlers {
  onIncomingMeta?: (meta: TransferMeta) => void;
  onProgress?: (id: string, bytesTransferred: number, total: number) => void;
  onFileComplete?: (id: string, blob: Blob, meta: TransferMeta) => void;
  onTextComplete?: (meta: TransferMeta) => void;
  onError?: (message: string) => void;
  onChannelOpen?: () => void;
  onClose?: () => void;
}

/**
 * One WebRTC connection to a single remote device. Signaling (offer/answer/
 * ICE candidates) is relayed through the existing Socket.IO connection; once
 * the data channel opens, file bytes flow directly between browsers and
 * never touch the backend.
 */
export class PeerConnection {
  private pc: RTCPeerConnection;
  private channel: RTCDataChannel | null = null;
  private readonly socket: Socket;
  private readonly remoteDeviceId: string;
  private readonly handlers: PeerConnectionHandlers;
  private pendingIceCandidates: RTCIceCandidateInit[] = [];
  private hasRemoteDescription = false;

  private incomingMeta: TransferMeta | null = null;
  private incomingChunks: ArrayBuffer[] = [];
  private incomingBytes = 0;

  private sendCancelled = new Set<string>();

  constructor(socket: Socket, remoteDeviceId: string, handlers: PeerConnectionHandlers = {}) {
    this.socket = socket;
    this.remoteDeviceId = remoteDeviceId;
    this.handlers = handlers;
    this.pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    this.pc.onicecandidate = (event) => {
      if (event.candidate) this.sendSignal("ice-candidate", event.candidate.toJSON());
    };
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

  private sendSignal(kind: "offer" | "answer" | "ice-candidate", data: unknown) {
    this.socket.emit("signal:send", { targetDeviceId: this.remoteDeviceId, kind, data });
  }

  /** Call on the side initiating the connection (the sender). Safe to call
   * repeatedly — reuses the existing channel instead of renegotiating. */
  async connect(): Promise<void> {
    if (this.channel?.readyState === "open") return;
    if (this.channel && this.channel.readyState === "connecting") {
      await this.waitForChannelOpen();
      return;
    }

    this.channel = this.pc.createDataChannel("syncblaze");
    this.wireChannel();

    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    this.sendSignal("offer", offer);

    await this.waitForChannelOpen();
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
      const originalOnOpen = this.channel?.onopen;
      if (this.channel) {
        this.channel.onopen = (e) => {
          originalOnOpen?.call(this.channel, e);
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
    this.channel.onclose = () => this.handlers.onClose?.();
    this.channel.onerror = () => this.handlers.onError?.("The connection to the other device dropped.");

    this.channel.onmessage = (event: MessageEvent<string | ArrayBuffer>) => {
      if (typeof event.data === "string") {
        this.handleControlMessage(JSON.parse(event.data) as ControlMessage);
      } else {
        this.handleChunk(event.data);
      }
    };
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
    const meta: TransferMeta = { id, name, size: content.length, kind, textContent: content };
    this.channel.send(JSON.stringify({ type: "meta", meta } satisfies ControlMessage));
  }

  async sendFile(id: string, file: File, kind: "file" | "image", onProgress?: (sent: number, total: number) => void) {
    if (!this.channel || this.channel.readyState !== "open") throw new Error("Not connected");
    const channel = this.channel;

    const meta: TransferMeta = { id, name: file.name, size: file.size, mimeType: file.type, kind };
    channel.send(JSON.stringify({ type: "meta", meta } satisfies ControlMessage));

    let offset = 0;
    while (offset < file.size) {
      if (this.sendCancelled.has(id)) {
        this.sendCancelled.delete(id);
        channel.send(JSON.stringify({ type: "cancel", id } satisfies ControlMessage));
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

    channel.send(JSON.stringify({ type: "done", id } satisfies ControlMessage));
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

  /** Feed in a signal relayed from the backend (offer/answer/ice-candidate). */
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

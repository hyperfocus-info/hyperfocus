import { isRecord } from "@hyperfocus/utilities/records";
import { isJsonWireSafe } from "../protocol/messages.ts";

export type PeerGroupPayload = string | ArrayBuffer | Uint8Array | Record<string, unknown>;

export type PeerSendResult =
  | { status: "sent"; bytes: number }
  | { status: "rejected"; reason: "not-open" | "backpressure" | "too-large" | "invalid-payload" | "transport-error" };

export type PeerBroadcastResult = {
  sent: number;
  rejected: number;
};

export type PeerChannel = {
  send(payload: PeerGroupPayload): PeerSendResult;
  onMessage(listener: (payload: PeerGroupPayload, peerId: string) => void): () => void;
};

export type PeerGroupPeer = {
  id: string;
  /** True when this side established the peer connection for a newly joined remote. */
  localInitiated?: boolean;
  reliable: PeerChannel;
  input: PeerChannel;
};

export type SignalingMessage = {
  type: string;
  lobbyId: string;
  from: string;
  to?: string;
  data?: unknown;
};

export type SignalingClient = {
  send(message: SignalingMessage): void;
  onMessage(listener: (message: SignalingMessage) => void): () => void;
  close(): void;
};

export type PeerGroupOptions = {
  lobbyId: string;
  peerId?: string;
  signalingUrl?: string;
  signaling?: SignalingClient;
  iceServers?: RTCIceServer[];
  maxPayloadBytes?: number;
  maxBufferedAmount?: number;
};

export type PeerGroup = {
  id: string;
  lobbyId: string;
  peers(): readonly PeerGroupPeer[];
  broadcastReliable(payload: PeerGroupPayload): PeerBroadcastResult;
  broadcastInput(payload: PeerGroupPayload): PeerBroadcastResult;
  onPeerJoin(listener: (peer: PeerGroupPeer) => void): () => void;
  onPeerLeave(listener: (peerId: string) => void): () => void;
  close(): void;
};

type ChannelPair = {
  reliable?: RTCDataChannel;
  input?: RTCDataChannel;
  localInitiated?: boolean;
};

const signalingTypes = new Set(["join", "peer-joined", "offer", "answer", "candidate", "peer-left"]);
const DEFAULT_MAX_PAYLOAD_BYTES = 1048576;
const DEFAULT_MAX_BUFFERED_AMOUNT = 1048576;
const payloadTextEncoder = new TextEncoder();

export type PeerGroupLimits = {
  maxPayloadBytes: number;
  maxBufferedAmount: number;
};

export function normalizePeerGroupLimits(options: Pick<PeerGroupOptions, "maxPayloadBytes" | "maxBufferedAmount">): PeerGroupLimits {
  const maxPayloadBytes = options.maxPayloadBytes ?? DEFAULT_MAX_PAYLOAD_BYTES;
  const maxBufferedAmount = options.maxBufferedAmount ?? DEFAULT_MAX_BUFFERED_AMOUNT;
  if (!Number.isSafeInteger(maxPayloadBytes) || maxPayloadBytes <= 0) throw new RangeError("peer group maxPayloadBytes must be a positive safe integer");
  if (!Number.isSafeInteger(maxBufferedAmount) || maxBufferedAmount <= 0) throw new RangeError("peer group maxBufferedAmount must be a positive safe integer");
  return { maxPayloadBytes, maxBufferedAmount };
}



function isPeerIdentifier(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 1024;
}

export function isSignalingMessage(value: unknown): value is SignalingMessage {
  if (!isRecord(value) || typeof value.type !== "string" || !signalingTypes.has(value.type)) return false;
  if (!isPeerIdentifier(value.lobbyId) || !isPeerIdentifier(value.from)) return false;
  return value.to === undefined || isPeerIdentifier(value.to);
}

function isSessionDescription(value: unknown, type: "offer" | "answer"): value is RTCSessionDescriptionInit {
  return isRecord(value) && value.type === type && typeof value.sdp === "string";
}

function isIceCandidate(value: unknown): value is RTCIceCandidateInit {
  if (!isRecord(value) || typeof value.candidate !== "string") return false;
  if (value.sdpMid !== undefined && value.sdpMid !== null && typeof value.sdpMid !== "string") return false;
  if (value.sdpMLineIndex !== undefined && value.sdpMLineIndex !== null && !Number.isInteger(value.sdpMLineIndex)) return false;
  if (value.usernameFragment !== undefined && value.usernameFragment !== null && typeof value.usernameFragment !== "string") return false;
  return true;
}

function encodePayload(payload: PeerGroupPayload) {
  if (typeof payload === "string" || payload instanceof ArrayBuffer) return payload;
  if (payload instanceof Uint8Array) return payload;
  if (!isJsonWireSafe(payload)) throw new TypeError("peer payload must be JSON wire-safe");
  const encoded = JSON.stringify(payload);
  if (typeof encoded !== "string") throw new TypeError("peer payload could not be encoded");
  return encoded;
}

function encodedPayloadBytes(payload: string | ArrayBuffer | Uint8Array) {
  if (typeof payload === "string") return payloadTextEncoder.encode(payload).byteLength;
  return payload.byteLength;
}

function decodePayload(payload: unknown): PeerGroupPayload {
  if (payload instanceof ArrayBuffer || payload instanceof Uint8Array) return payload;
  if (typeof payload !== "string") return String(payload);
  try {
    const decoded: unknown = JSON.parse(payload);
    return isRecord(decoded) ? decoded : payload;
  } catch {
    return payload;
  }
}

function createDataChannelFacade(
  getChannel: () => RTCDataChannel | undefined,
  listeners: Set<(payload: PeerGroupPayload, peerId: string) => void>,
  limits: PeerGroupLimits
): PeerChannel {
  return {
    send(payload) {
      const channel = getChannel();
      if (!channel || channel.readyState !== "open") return { status: "rejected", reason: "not-open" };
      let encoded: string | ArrayBuffer | Uint8Array;
      try {
        encoded = encodePayload(payload);
      } catch {
        return { status: "rejected", reason: "invalid-payload" };
      }
      const bytes = encodedPayloadBytes(encoded);
      if (bytes > limits.maxPayloadBytes) return { status: "rejected", reason: "too-large" };
      if (channel.bufferedAmount + bytes > limits.maxBufferedAmount) return { status: "rejected", reason: "backpressure" };
      try {
        if (typeof encoded === "string") channel.send(encoded);
        else if (encoded instanceof ArrayBuffer) channel.send(encoded);
        else channel.send(Uint8Array.from(encoded));
        return { status: "sent", bytes };
      } catch {
        return { status: "rejected", reason: "transport-error" };
      }
    },
    onMessage(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }
  };
}

function notifyChannel(channel: RTCDataChannel, peerId: string, listeners: Set<(payload: PeerGroupPayload, peerId: string) => void>, maxPayloadBytes: number) {
  channel.binaryType = "arraybuffer";
  channel.addEventListener("message", (event) => {
    if ((typeof event.data === "string" || event.data instanceof ArrayBuffer || event.data instanceof Uint8Array)
      && encodedPayloadBytes(event.data) > maxPayloadBytes) return;
    const payload = decodePayload(event.data);
    for (const listener of listeners) {
      try { listener(payload, peerId); }
      catch { /* Independent channel listeners cannot interrupt delivery. */ }
    }
  });
}

function randomPeerId() {
  return `peer-${Math.random().toString(36).slice(2)}`;
}

function broadcast(peers: Iterable<PeerGroupPeer>, channel: "reliable" | "input", payload: PeerGroupPayload): PeerBroadcastResult {
  let sent = 0;
  let rejected = 0;
  for (const peer of peers) {
    if (peer[channel].send(payload).status === "sent") sent += 1;
    else rejected += 1;
  }
  return { sent, rejected };
}

export function createWebSocketSignaling(options: { url: string; lobbyId: string; peerId: string }): Promise<SignalingClient> {
  return new Promise((resolve, reject) => {
    if (!isPeerIdentifier(options.lobbyId) || !isPeerIdentifier(options.peerId)) {
      reject(new Error("signaling lobbyId and peerId must be non-empty strings"));
      return;
    }
    const socket = new WebSocket(options.url);
    const listeners = new Set<(message: SignalingMessage) => void>();
    let settled = false;
    let closed = false;

    function failConnection() {
      if (settled) return;
      settled = true;
      reject(new Error(`could not connect to signaling server: ${options.url}`));
    }

    socket.addEventListener("open", () => {
      if (closed || settled) return;
      try {
        socket.send(JSON.stringify({ type: "join", lobbyId: options.lobbyId, from: options.peerId }));
      } catch {
        failConnection();
        return;
      }
      settled = true;
      resolve({
        send(message) {
          if (!isSignalingMessage(message)) throw new Error("invalid signaling message");
          if (message.lobbyId !== options.lobbyId || message.from !== options.peerId) {
            throw new Error("signaling message identity does not match this client");
          }
          if (closed || socket.readyState !== WebSocket.OPEN) return;
          socket.send(JSON.stringify(message));
        },
        onMessage(listener) {
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
        close() {
          if (closed) return;
          closed = true;
          listeners.clear();
          socket.close();
        }
      });
    });
    socket.addEventListener("message", (event) => {
      let message: unknown;
      try {
        message = JSON.parse(String(event.data));
      } catch {
        return;
      }
      if (!isSignalingMessage(message) || message.lobbyId !== options.lobbyId || (message.to !== undefined && message.to !== options.peerId)) return;
      for (const listener of listeners) {
        try { listener(message); }
        catch { /* Independent signaling listeners cannot interrupt delivery. */ }
      }
    });
    socket.addEventListener("error", failConnection);
    socket.addEventListener("close", () => {
      closed = true;
      listeners.clear();
      failConnection();
    });
  });
}

export async function createPeerGroup(options: PeerGroupOptions): Promise<PeerGroup> {
  if (typeof RTCPeerConnection === "undefined") {
    throw new Error("createPeerGroup requires RTCPeerConnection. Use createMemoryPeerGroup for Bun tests or non-browser mocks.");
  }

  const peerId = options.peerId ?? randomPeerId();
  const channelLimits = normalizePeerGroupLimits(options);
  const { maxPayloadBytes } = channelLimits;
  if (!isPeerIdentifier(options.lobbyId) || !isPeerIdentifier(peerId)) throw new Error("peer group lobbyId and peerId must be non-empty strings");
  const signaling =
    options.signaling ?? (await createWebSocketSignaling({ url: options.signalingUrl ?? "ws://localhost:8787", lobbyId: options.lobbyId, peerId }));
  const connections = new Map<string, RTCPeerConnection>();
  const channels = new Map<string, ChannelPair>();
  const peers = new Map<string, PeerGroupPeer>();
  const joinListeners = new Set<(peer: PeerGroupPeer) => void>();
  const leaveListeners = new Set<(peerId: string) => void>();
  const reliableListeners = new Map<string, Set<(payload: PeerGroupPayload, peerId: string) => void>>();
  const inputListeners = new Map<string, Set<(payload: PeerGroupPayload, peerId: string) => void>>();
  const pendingCandidates = new Map<string, RTCIceCandidateInit[]>();
  let closed = false;

  function getListeners(map: Map<string, Set<(payload: PeerGroupPayload, peerId: string) => void>>, id: string) {
    let listeners = map.get(id);
    if (!listeners) {
      listeners = new Set();
      map.set(id, listeners);
    }
    return listeners;
  }

  function publishPeer(remoteId: string) {
    if (closed) return;
    if (peers.has(remoteId)) return;
    const pair = channels.get(remoteId) ?? {};
    if (!pair.reliable || pair.reliable.readyState !== "open") return;
    const peer = {
      id: remoteId,
      localInitiated: pair.localInitiated,
      reliable: createDataChannelFacade(() => pair.reliable, getListeners(reliableListeners, remoteId), channelLimits),
      input: createDataChannelFacade(() => pair.input, getListeners(inputListeners, remoteId), channelLimits)
    };
    peers.set(remoteId, peer);
    for (const listener of joinListeners) {
      try { listener(peer); }
      catch { /* Independent peer listeners cannot interrupt membership. */ }
    }
  }

  function ensureConnection(remoteId: string, initiator: boolean) {
    if (closed) throw new Error("peer group is closed");
    if (!isPeerIdentifier(remoteId) || remoteId === peerId) throw new Error("invalid remote peer id");
    const existing = connections.get(remoteId);
    if (existing) return existing;

    const connection = new RTCPeerConnection({ iceServers: options.iceServers ?? [{ urls: "stun:stun.l.google.com:19302" }] });
    const pair: ChannelPair = { localInitiated: initiator };
    channels.set(remoteId, pair);
    connections.set(remoteId, connection);

    connection.addEventListener("icecandidate", (event) => {
      if (closed || connections.get(remoteId) !== connection || !event.candidate) return;
      signaling.send({ type: "candidate", lobbyId: options.lobbyId, from: peerId, to: remoteId, data: event.candidate });
    });
    connection.addEventListener("datachannel", (event) => {
      if (event.channel.label === "reliable") {
        pair.reliable = event.channel;
        notifyChannel(event.channel, remoteId, getListeners(reliableListeners, remoteId), maxPayloadBytes);
        event.channel.addEventListener("open", () => publishPeer(remoteId));
      } else if (event.channel.label === "input") {
        pair.input = event.channel;
        notifyChannel(event.channel, remoteId, getListeners(inputListeners, remoteId), maxPayloadBytes);
      }
      publishPeer(remoteId);
    });
    connection.addEventListener("connectionstatechange", () => {
      if (connection.connectionState !== "closed" && connection.connectionState !== "failed") return;
      if (connections.get(remoteId) !== connection) return;
      connections.delete(remoteId);
      channels.delete(remoteId);
      pendingCandidates.delete(remoteId);
      reliableListeners.delete(remoteId);
      inputListeners.delete(remoteId);
      if (peers.delete(remoteId)) {
        for (const listener of leaveListeners) {
          try { listener(remoteId); }
          catch { /* Independent peer listeners cannot interrupt cleanup. */ }
        }
      }
    });

    if (initiator) {
      pair.reliable = connection.createDataChannel("reliable", { ordered: true });
      pair.input = connection.createDataChannel("input", { ordered: true, maxRetransmits: 0 });
      notifyChannel(pair.reliable, remoteId, getListeners(reliableListeners, remoteId), maxPayloadBytes);
      notifyChannel(pair.input, remoteId, getListeners(inputListeners, remoteId), maxPayloadBytes);
      pair.reliable.addEventListener("open", () => publishPeer(remoteId));
      publishPeer(remoteId);
      void connection
        .createOffer()
        .then(async (offer) => {
          await connection.setLocalDescription(offer);
          if (!closed && connections.get(remoteId) === connection) {
            signaling.send({ type: "offer", lobbyId: options.lobbyId, from: peerId, to: remoteId, data: offer });
          }
        })
        .catch(() => connection.close());
    }

    return connection;
  }

  const disposeSignaling = signaling.onMessage((message) => {
    if (closed || !isSignalingMessage(message) || message.lobbyId !== options.lobbyId || message.from === peerId || (message.to && message.to !== peerId)) return;
    void (async () => {
      if (message.type === "peer-joined" || message.type === "join") {
        ensureConnection(message.from, true);
      } else if (message.type === "offer") {
        if (!isSessionDescription(message.data, "offer")) return;
        const existing = connections.get(message.from);
        if (existing && channels.get(message.from)?.localInitiated) return;
        const connection = ensureConnection(message.from, false);
        await connection.setRemoteDescription(message.data);
        for (const candidate of pendingCandidates.get(message.from) ?? []) await connection.addIceCandidate(candidate);
        pendingCandidates.delete(message.from);
        const answer = await connection.createAnswer();
        await connection.setLocalDescription(answer);
        if (!closed && connections.get(message.from) === connection) {
          signaling.send({ type: "answer", lobbyId: options.lobbyId, from: peerId, to: message.from, data: answer });
        }
      } else if (message.type === "answer") {
        if (!isSessionDescription(message.data, "answer") || channels.get(message.from)?.localInitiated !== true) return;
        const connection = connections.get(message.from);
        if (!connection) return;
        await connection.setRemoteDescription(message.data);
        for (const candidate of pendingCandidates.get(message.from) ?? []) await connection.addIceCandidate(candidate);
        pendingCandidates.delete(message.from);
      } else if (message.type === "candidate") {
        if (!isIceCandidate(message.data)) return;
        const connection = connections.get(message.from);
        if (!connection || !connection.remoteDescription) {
          const queued = pendingCandidates.get(message.from) ?? [];
          if (queued.length < 64) queued.push(message.data);
          pendingCandidates.set(message.from, queued);
          return;
        }
        await connection.addIceCandidate(message.data);
      } else if (message.type === "peer-left") {
        connections.get(message.from)?.close();
      }
    })().catch(() => connections.get(message.from)?.close());
  });

  return {
    id: peerId,
    lobbyId: options.lobbyId,
    peers() {
      return [...peers.values()];
    },
    broadcastReliable(payload) {
      return broadcast(peers.values(), "reliable", payload);
    },
    broadcastInput(payload) {
      return broadcast(peers.values(), "input", payload);
    },
    onPeerJoin(listener) {
      joinListeners.add(listener);
      return () => joinListeners.delete(listener);
    },
    onPeerLeave(listener) {
      leaveListeners.add(listener);
      return () => leaveListeners.delete(listener);
    },
    close() {
      if (closed) return;
      closed = true;
      disposeSignaling();
      signaling.close();
      for (const connection of connections.values()) connection.close();
      connections.clear();
      channels.clear();
      peers.clear();
      pendingCandidates.clear();
      reliableListeners.clear();
      inputListeners.clear();
      joinListeners.clear();
      leaveListeners.clear();
    }
  };
}

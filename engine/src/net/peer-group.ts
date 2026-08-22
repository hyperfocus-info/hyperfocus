export type PeerGroupPayload = string | ArrayBuffer | Uint8Array | Record<string, unknown>;

export type PeerChannel = {
  send(payload: PeerGroupPayload): void;
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
};

export type PeerGroup = {
  id: string;
  lobbyId: string;
  peers(): readonly PeerGroupPeer[];
  broadcastReliable(payload: PeerGroupPayload): void;
  broadcastInput(payload: PeerGroupPayload): void;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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
  return JSON.stringify(payload);
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
  listeners: Set<(payload: PeerGroupPayload, peerId: string) => void>
): PeerChannel {
  return {
    send(payload) {
      const channel = getChannel();
      if (!channel || channel.readyState !== "open") return;
      const encoded = encodePayload(payload);
      (channel.send as (data: unknown) => void)(encoded);
    },
    onMessage(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }
  };
}

function notifyChannel(channel: RTCDataChannel, peerId: string, listeners: Set<(payload: PeerGroupPayload, peerId: string) => void>) {
  channel.binaryType = "arraybuffer";
  channel.addEventListener("message", (event) => {
    const payload = decodePayload(event.data);
    for (const listener of listeners) listener(payload, peerId);
  });
}

function randomPeerId() {
  return `peer-${Math.random().toString(36).slice(2)}`;
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
      for (const listener of listeners) listener(message);
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
      reliable: createDataChannelFacade(() => pair.reliable, getListeners(reliableListeners, remoteId)),
      input: createDataChannelFacade(() => pair.input, getListeners(inputListeners, remoteId))
    };
    peers.set(remoteId, peer);
    for (const listener of joinListeners) listener(peer);
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
        notifyChannel(event.channel, remoteId, getListeners(reliableListeners, remoteId));
        event.channel.addEventListener("open", () => publishPeer(remoteId));
      } else if (event.channel.label === "input") {
        pair.input = event.channel;
        notifyChannel(event.channel, remoteId, getListeners(inputListeners, remoteId));
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
        for (const listener of leaveListeners) listener(remoteId);
      }
    });

    if (initiator) {
      pair.reliable = connection.createDataChannel("reliable", { ordered: true });
      pair.input = connection.createDataChannel("input", { ordered: true, maxRetransmits: 0 });
      notifyChannel(pair.reliable, remoteId, getListeners(reliableListeners, remoteId));
      notifyChannel(pair.input, remoteId, getListeners(inputListeners, remoteId));
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
      for (const peer of peers.values()) peer.reliable.send(payload);
    },
    broadcastInput(payload) {
      for (const peer of peers.values()) peer.input.send(payload);
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

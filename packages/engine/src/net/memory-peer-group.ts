import { isRecord } from "@hyperfocus/utilities/records";
import { isJsonWireSafe } from "../protocol/messages.ts";
import { normalizePeerGroupLimits, type PeerChannel, type PeerGroup, type PeerGroupLimits, type PeerGroupPayload, type PeerGroupPeer } from "./peer-group.ts";

const payloadTextEncoder = new TextEncoder();

function createMemoryPeerState(lobbyId: string, id: string, limits: PeerGroupLimits) {
  return {
    lobbyId,
    id,
    peerViews: new Map<string, PeerGroupPeer>(),
    joinListeners: new Set<(peer: PeerGroupPeer) => void>(),
    leaveListeners: new Set<(peerId: string) => void>(),
    reliableListeners: new Map<string, Set<(payload: PeerGroupPayload, peerId: string) => void>>(),
    inputListeners: new Map<string, Set<(payload: PeerGroupPayload, peerId: string) => void>>(),
    limits,
    closed: false
  };
}

type MemoryPeerState = ReturnType<typeof createMemoryPeerState>;

function createMemoryRoom() {
  return { peers: new Map<string, MemoryPeerState>() };
}

const rooms = new Map<string, ReturnType<typeof createMemoryRoom>>();

function roomFor(lobbyId: string) {
  let room = rooms.get(lobbyId);
  if (!room) {
    room = createMemoryRoom();
    rooms.set(lobbyId, room);
  }
  return room;
}



function copyPayload(payload: PeerGroupPayload): PeerGroupPayload {
  if (typeof payload === "object" && !(payload instanceof Uint8Array) && !(payload instanceof ArrayBuffer) && !isJsonWireSafe(payload)) {
    throw new TypeError("memory peer payload must be JSON wire-safe");
  }
  if (typeof structuredClone === "function") return structuredClone(payload);
  if (typeof payload === "string") return payload;
  if (payload instanceof Uint8Array) return payload.slice();
  if (payload instanceof ArrayBuffer) return payload.slice(0);
  const copy: unknown = JSON.parse(JSON.stringify(payload));
  if (!isRecord(copy)) throw new TypeError("memory peer payload did not clone to an object");
  return copy;
}

function createMemoryChannel(send: (payload: PeerGroupPayload) => void, limits: PeerGroupLimits): PeerChannel {
  return {
    send(payload) {
      try {
        const owned = copyPayload(payload);
        const bytes = typeof owned === "string" ? payloadTextEncoder.encode(owned).byteLength
          : owned instanceof ArrayBuffer || owned instanceof Uint8Array ? owned.byteLength
            : payloadTextEncoder.encode(JSON.stringify(owned)).byteLength;
        if (bytes > limits.maxPayloadBytes) return { status: "rejected", reason: "too-large" };
        if (bytes > limits.maxBufferedAmount) return { status: "rejected", reason: "backpressure" };
        send(owned);
        return { status: "sent", bytes };
      } catch {
        return { status: "rejected", reason: "invalid-payload" };
      }
    },
    onMessage() {
      return () => undefined;
    }
  };
}

function listenersFor(
  map: Map<string, Set<(payload: PeerGroupPayload, peerId: string) => void>>,
  peerId: string
) {
  let listeners = map.get(peerId);
  if (!listeners) {
    listeners = new Set();
    map.set(peerId, listeners);
  }
  return listeners;
}

function receive(
  state: MemoryPeerState,
  map: MemoryPeerState["reliableListeners"],
  payload: PeerGroupPayload,
  peerId: string
) {
  if (state.closed || !state.peerViews.has(peerId)) return;
  for (const listener of listenersFor(map, peerId)) {
    try { listener(payload, peerId); }
    catch { /* Independent channel listeners cannot interrupt delivery. */ }
  }
}

function attach(state: MemoryPeerState, remote: MemoryPeerState, localInitiated: boolean) {
  if (state.closed || remote.closed || state.peerViews.has(remote.id)) return;
  const peer = {
    id: remote.id,
    localInitiated,
    reliable: createMemoryChannel((payload) => receive(remote, remote.reliableListeners, payload, state.id), state.limits),
    input: createMemoryChannel((payload) => receive(remote, remote.inputListeners, payload, state.id), state.limits)
  };
  peer.reliable.onMessage = (listener) => {
    const listeners = listenersFor(state.reliableListeners, remote.id);
    listeners.add(listener);
    return () => listeners.delete(listener);
  };
  peer.input.onMessage = (listener) => {
    const listeners = listenersFor(state.inputListeners, remote.id);
    listeners.add(listener);
    return () => listeners.delete(listener);
  };
  state.peerViews.set(remote.id, peer);
  for (const listener of state.joinListeners) {
    try { listener(peer); }
    catch { /* Independent peer listeners cannot interrupt membership. */ }
  }
}

function detach(state: MemoryPeerState, peerId: string) {
  if (!state.peerViews.delete(peerId)) return;
  state.reliableListeners.delete(peerId);
  state.inputListeners.delete(peerId);
  for (const listener of state.leaveListeners) {
    try { listener(peerId); }
    catch { /* Independent peer listeners cannot interrupt cleanup. */ }
  }
}

function close(state: MemoryPeerState) {
  if (state.closed) return;
  state.closed = true;
  const room = rooms.get(state.lobbyId);
  if (room) {
    if (room.peers.get(state.id) === state) room.peers.delete(state.id);
    for (const peer of room.peers.values()) detach(peer, state.id);
    if (room.peers.size === 0) rooms.delete(state.lobbyId);
  }
  state.peerViews.clear();
  state.reliableListeners.clear();
  state.inputListeners.clear();
  state.joinListeners.clear();
  state.leaveListeners.clear();
}

function createMemoryPeerApi(state: MemoryPeerState) {
  return {
    id: state.id,
    lobbyId: state.lobbyId,
    peers: () => [...state.peerViews.values()],
    broadcastReliable(payload: PeerGroupPayload) {
      let sent = 0;
      let rejected = 0;
      for (const peer of state.peerViews.values()) {
        if (peer.reliable.send(payload).status === "sent") sent += 1;
        else rejected += 1;
      }
      return { sent, rejected };
    },
    broadcastInput(payload: PeerGroupPayload) {
      let sent = 0;
      let rejected = 0;
      for (const peer of state.peerViews.values()) {
        if (peer.input.send(payload).status === "sent") sent += 1;
        else rejected += 1;
      }
      return { sent, rejected };
    },
    onPeerJoin(listener: (peer: PeerGroupPeer) => void) {
      if (state.closed) return () => undefined;
      state.joinListeners.add(listener);
      return () => state.joinListeners.delete(listener);
    },
    onPeerLeave(listener: (peerId: string) => void) {
      if (state.closed) return () => undefined;
      state.leaveListeners.add(listener);
      return () => state.leaveListeners.delete(listener);
    },
    close: () => close(state)
  };
}

export type MemoryPeerGroupOptions = {
  lobbyId: string;
  peerId: string;
  maxPayloadBytes?: number;
  maxBufferedAmount?: number;
};

export function createMemoryPeerGroup(options: MemoryPeerGroupOptions): PeerGroup {
  if (typeof options.lobbyId !== "string" || options.lobbyId.length === 0 || typeof options.peerId !== "string" || options.peerId.length === 0) {
    throw new Error("memory peer group lobbyId and peerId must be non-empty strings");
  }
  const limits = normalizePeerGroupLimits(options);
  const room = roomFor(options.lobbyId);
  if (room.peers.has(options.peerId)) throw new Error(`peer id is already joined: ${options.peerId}`);
  const state = createMemoryPeerState(options.lobbyId, options.peerId, limits);
  for (const peer of room.peers.values()) {
    attach(state, peer, false);
    attach(peer, state, true);
  }
  room.peers.set(options.peerId, state);
  return createMemoryPeerApi(state);
}

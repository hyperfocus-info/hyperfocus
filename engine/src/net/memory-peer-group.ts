import type { PeerChannel, PeerGroup, PeerGroupPayload, PeerGroupPeer } from "./peer-group.ts";

type MemoryRoom = {
  peers: Map<string, MemoryPeerGroup>;
};

const rooms = new Map<string, MemoryRoom>();

function roomFor(lobbyId: string) {
  let room = rooms.get(lobbyId);
  if (!room) {
    room = { peers: new Map() };
    rooms.set(lobbyId, room);
  }
  return room;
}

function createMemoryChannel(send: (payload: PeerGroupPayload) => void): PeerChannel {
  return {
    send(payload) {
      let copy: PeerGroupPayload;
      if (typeof structuredClone === "function") copy = structuredClone(payload);
      else if (typeof payload === "string") copy = payload;
      else if (payload instanceof Uint8Array) copy = payload.slice();
      else if (payload instanceof ArrayBuffer) copy = payload.slice(0);
      else copy = JSON.parse(JSON.stringify(payload)) as Record<string, unknown>;
      send(copy);
    },
    onMessage() {
      return () => undefined;
    }
  };
}

class MemoryPeerGroup implements PeerGroup {
  readonly id: string;
  readonly lobbyId: string;
  private peerViews = new Map<string, PeerGroupPeer>();
  private joinListeners = new Set<(peer: PeerGroupPeer) => void>();
  private leaveListeners = new Set<(peerId: string) => void>();
  private reliableListeners = new Map<string, Set<(payload: PeerGroupPayload, peerId: string) => void>>();
  private inputListeners = new Map<string, Set<(payload: PeerGroupPayload, peerId: string) => void>>();
  private closed = false;

  constructor(lobbyId: string, peerId: string) {
    this.lobbyId = lobbyId;
    this.id = peerId;
  }

  attach(remote: MemoryPeerGroup, localInitiated: boolean) {
    if (this.closed || remote.closed) return;
    if (this.peerViews.has(remote.id)) return;
    const peer = {
      id: remote.id,
      localInitiated,
      reliable: createMemoryChannel((payload) => remote.receiveReliable(payload, this.id)),
      input: createMemoryChannel((payload) => remote.receiveInput(payload, this.id))
    };
    peer.reliable.onMessage = (listener) => {
      const listeners = this.listenersFor(this.reliableListeners, remote.id);
      listeners.add(listener);
      return () => listeners.delete(listener);
    };
    peer.input.onMessage = (listener) => {
      const listeners = this.listenersFor(this.inputListeners, remote.id);
      listeners.add(listener);
      return () => listeners.delete(listener);
    };
    this.peerViews.set(remote.id, peer);
    for (const listener of this.joinListeners) listener(peer);
  }

  detach(peerId: string) {
    if (!this.peerViews.delete(peerId)) return;
    this.reliableListeners.delete(peerId);
    this.inputListeners.delete(peerId);
    for (const listener of this.leaveListeners) listener(peerId);
  }

  receiveReliable(payload: PeerGroupPayload, peerId: string) {
    if (this.closed || !this.peerViews.has(peerId)) return;
    for (const listener of this.listenersFor(this.reliableListeners, peerId)) listener(payload, peerId);
  }

  receiveInput(payload: PeerGroupPayload, peerId: string) {
    if (this.closed || !this.peerViews.has(peerId)) return;
    for (const listener of this.listenersFor(this.inputListeners, peerId)) listener(payload, peerId);
  }

  private listenersFor(map: Map<string, Set<(payload: PeerGroupPayload, peerId: string) => void>>, peerId: string) {
    let listeners = map.get(peerId);
    if (!listeners) {
      listeners = new Set();
      map.set(peerId, listeners);
    }
    return listeners;
  }

  peers() {
    return [...this.peerViews.values()];
  }

  broadcastReliable(payload: PeerGroupPayload) {
    for (const peer of this.peerViews.values()) peer.reliable.send(payload);
  }

  broadcastInput(payload: PeerGroupPayload) {
    for (const peer of this.peerViews.values()) peer.input.send(payload);
  }

  onPeerJoin(listener: (peer: PeerGroupPeer) => void) {
    if (this.closed) return () => undefined;
    this.joinListeners.add(listener);
    return () => this.joinListeners.delete(listener);
  }

  onPeerLeave(listener: (peerId: string) => void) {
    if (this.closed) return () => undefined;
    this.leaveListeners.add(listener);
    return () => this.leaveListeners.delete(listener);
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    const room = rooms.get(this.lobbyId);
    if (room) {
      if (room.peers.get(this.id) === this) room.peers.delete(this.id);
      for (const peer of room.peers.values()) peer.detach(this.id);
      if (room.peers.size === 0) rooms.delete(this.lobbyId);
    }
    this.peerViews.clear();
    this.reliableListeners.clear();
    this.inputListeners.clear();
    this.joinListeners.clear();
    this.leaveListeners.clear();
  }
}

export function createMemoryPeerGroup(options: { lobbyId: string; peerId: string }): PeerGroup {
  if (typeof options.lobbyId !== "string" || options.lobbyId.length === 0 || typeof options.peerId !== "string" || options.peerId.length === 0) {
    throw new Error("memory peer group lobbyId and peerId must be non-empty strings");
  }
  const room = roomFor(options.lobbyId);
  if (room.peers.has(options.peerId)) throw new Error(`peer id is already joined: ${options.peerId}`);
  const group = new MemoryPeerGroup(options.lobbyId, options.peerId);
  for (const peer of room.peers.values()) {
    group.attach(peer, false);
    peer.attach(group, true);
  }
  room.peers.set(options.peerId, group);
  return group;
}

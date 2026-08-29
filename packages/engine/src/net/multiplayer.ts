import { createRollbackLoop, type RollbackLoopOptions } from "../runtime/rollback.ts";
import {
  createSharedStore,
  isSharedStorePatch,
  isSharedStoreSnapshot,
  type SharedStoreApi
} from "../sync/shared-store.ts";
import { createMemoryPeerGroup } from "./memory-peer-group.ts";
import { createPeerGroup, type PeerGroup, type PeerGroupOptions, type PeerGroupPeer } from "./peer-group.ts";

export type MultiplayerOptions<TStore extends object> = PeerGroupOptions & {
  initialStore: TStore;
  memory?: boolean;
};

export type MultiplayerSession<TStore extends object> = {
  peerId: string;
  group: PeerGroup;
  store: SharedStoreApi<TStore>;
  createRollbackLoop<TInput, TState>(
    options: Omit<RollbackLoopOptions<TInput, TState>, "peerIds" | "localPeerId">
  ): ReturnType<typeof createRollbackLoop<TInput, TState>>;
  close(): void;
};

export async function createMultiplayer<TStore extends object = Record<string, unknown>>(
  options: MultiplayerOptions<TStore>
): Promise<MultiplayerSession<TStore>> {
  const requestedPeerId = options.peerId ?? `peer-${Math.random().toString(36).slice(2)}`;
  const group = options.memory
    ? createMemoryPeerGroup({ lobbyId: options.lobbyId, peerId: requestedPeerId })
    : await createPeerGroup({ ...options, peerId: requestedPeerId });
  let store: SharedStoreApi<TStore>;
  try {
    store = createSharedStore(options.initialStore, {
      peerId: requestedPeerId,
      onPatch: (patch) => group.broadcastReliable({ type: "store-patch", patch })
    });
  } catch (error) {
    group.close();
    throw error;
  }
  try {
  const peerDisposers = new Map<string, () => void>();
  const failedBootstrapSources = new Set<string>();
  const pendingSyncRequestPeers = new Set<string>();
  let bootstrapSourceId: string | undefined;
  let bootstrapped = true;

  function finishBootstrap() {
    bootstrapped = true;
    failedBootstrapSources.clear();
    for (const peerId of pendingSyncRequestPeers) {
      group.peers().find((peer) => peer.id === peerId)?.reliable.send({ type: "store-snapshot", snapshot: store.$exportSnapshot() });
    }
    pendingSyncRequestPeers.clear();
  }

  function requestBootstrapSnapshot() {
    if (bootstrapped) return;
    const preferred = group
      .peers()
      .filter((peer) => peer.localInitiated === false)
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    const availablePreferred = preferred.filter((peer) => !failedBootstrapSources.has(peer.id));
    const candidates = availablePreferred.length
      ? availablePreferred
      : [...group.peers()]
          .filter((peer) => !failedBootstrapSources.has(peer.id))
          .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    const source = candidates.find((peer) => peer.id === bootstrapSourceId) ?? candidates[0];
    bootstrapSourceId = source?.id;
    if (source) source.reliable.send({ type: "store-sync-request" });
    else if (group.peers().length === 0) finishBootstrap();
  }

  function bindPeer(peer: PeerGroupPeer) {
    peerDisposers.get(peer.id)?.();
    const dispose = peer.reliable.onMessage((payload) => {
      if (typeof payload !== "object" || payload === null) return;
      const type = Reflect.get(payload, "type");
      if (type === "store-patch") {
        const patch = Reflect.get(payload, "patch");
        if (isSharedStorePatch(patch) && patch.peerId === peer.id) store.$applyPatch(patch);
        return;
      }
      if (type === "store-sync-request") {
        if (!bootstrapped) {
          pendingSyncRequestPeers.add(peer.id);
          return;
        }
        peer.reliable.send({ type: "store-snapshot", snapshot: store.$exportSnapshot() });
        return;
      }
      if (type !== "store-snapshot" || bootstrapped || peer.id !== bootstrapSourceId) return;
      const snapshot = Reflect.get(payload, "snapshot");
      if (!isSharedStoreSnapshot(snapshot)) {
        failedBootstrapSources.add(peer.id);
        bootstrapSourceId = undefined;
        requestBootstrapSnapshot();
        return;
      }
      if (!store.$applySnapshot(snapshot)) {
        failedBootstrapSources.add(peer.id);
        bootstrapSourceId = undefined;
        requestBootstrapSnapshot();
        return;
      }
      finishBootstrap();
    });
    peerDisposers.set(peer.id, dispose);
  }

  const disposeJoin = group.onPeerJoin((peer) => {
    bindPeer(peer);
    if (peer.localInitiated === false) {
      failedBootstrapSources.delete(peer.id);
      bootstrapSourceId = peer.id;
      bootstrapped = false;
      requestBootstrapSnapshot();
    }
  });
  const disposeLeave = group.onPeerLeave((peerId) => {
    peerDisposers.get(peerId)?.();
    peerDisposers.delete(peerId);
    pendingSyncRequestPeers.delete(peerId);
    if (!bootstrapped && bootstrapSourceId === peerId) {
      bootstrapSourceId = undefined;
      requestBootstrapSnapshot();
    }
  });
  for (const peer of group.peers()) bindPeer(peer);
  const initialBootstrapPeers = group
    .peers()
    .filter((peer) => peer.localInitiated === false)
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  if (initialBootstrapPeers.length) {
    bootstrapped = false;
    bootstrapSourceId = initialBootstrapPeers[0].id;
    requestBootstrapSnapshot();
  }

  return {
    peerId: group.id,
    group,
    store,
    createRollbackLoop(options) {
      return createRollbackLoop({
        ...options,
        localPeerId: group.id,
        peerIds: () => [group.id, ...group.peers().map((peer) => peer.id).sort()]
      });
    },
    close() {
      disposeJoin();
      disposeLeave();
      for (const dispose of peerDisposers.values()) dispose();
      peerDisposers.clear();
      pendingSyncRequestPeers.clear();
      store.$dispose();
      group.close();
    }
  };
  } catch (error) {
    store.$dispose();
    group.close();
    throw error;
  }
}

export type MeshHostMode = "server" | "electing" | "mesh";
export type MeshHostRole = "server-client" | "candidate" | "temporary-host" | "mesh-peer";

export type MeshHostState = {
  mode: MeshHostMode;
  role: MeshHostRole;
  term: number;
  hostId?: string;
  electionDeadline?: number;
  peers: readonly string[];
};

export type MeshHostAnnouncement = {
  term: number;
  hostId: string;
};

export type MeshHostCoordinatorOptions = {
  localPeerId: string;
  electionDelayMs?: number;
  maxPeers?: number;
  now?: () => number;
  onChange?: (state: MeshHostState) => void;
};

function peerId(value: string) {
  if (typeof value !== "string" || value.length === 0 || value.length > 1_024) throw new Error("mesh peer ids must contain 1-1024 characters");
  return value;
}

function timestamp(value: number) {
  if (!Number.isFinite(value) || value < 0) throw new RangeError("mesh host time must be a non-negative finite number");
  return value;
}

/**
 * Deterministic temporary-host election state. It does not grant authority or
 * verify gameplay results; transports decide how announcements are delivered.
 */
export function createMeshHostCoordinator(options: MeshHostCoordinatorOptions) {
  const localPeerId = peerId(options.localPeerId);
  const electionDelayMs = options.electionDelayMs ?? 250;
  const maxPeers = options.maxPeers ?? 256;
  if (!Number.isFinite(electionDelayMs) || electionDelayMs < 0) throw new RangeError("electionDelayMs must be non-negative and finite");
  if (!Number.isSafeInteger(maxPeers) || maxPeers < 1) throw new RangeError("maxPeers must be a positive safe integer");
  const clock = options.now ?? (() => performance.now());
  let serverConnected = true;
  let term = 0;
  let electionDeadline: number | undefined;
  let hostId: string | undefined;
  let peers = [localPeerId];

  function snapshot(): MeshHostState {
    const mode: MeshHostMode = serverConnected ? "server" : hostId ? "mesh" : "electing";
    const role: MeshHostRole = serverConnected
      ? "server-client"
      : hostId === localPeerId ? "temporary-host" : hostId ? "mesh-peer" : "candidate";
    return { mode, role, term, hostId, electionDeadline, peers: [...peers] };
  }

  function changed() {
    const state = snapshot();
    options.onChange?.(state);
    return state;
  }

  function beginElection(now: number) {
    term += 1;
    hostId = undefined;
    electionDeadline = now + electionDelayMs;
  }

  function elect(now: number) {
    if (serverConnected || hostId || electionDeadline === undefined || now < electionDeadline) return false;
    hostId = peers[0];
    electionDeadline = undefined;
    return true;
  }

  return {
    state: snapshot,
    updatePeers(remotePeerIds: readonly string[], now = clock()) {
      timestamp(now);
      if (!Array.isArray(remotePeerIds)) throw new TypeError("mesh peers must be an array");
      const next = new Set<string>([localPeerId]);
      for (const id of remotePeerIds) next.add(peerId(id));
      if (next.size > maxPeers) throw new RangeError(`mesh peer count exceeds ${maxPeers}`);
      peers = [...next].sort();
      if (!serverConnected && hostId && !next.has(hostId)) beginElection(now);
      elect(now);
      return changed();
    },
    serverDisconnected(now = clock()) {
      timestamp(now);
      if (!serverConnected) return snapshot();
      serverConnected = false;
      beginElection(now);
      elect(now);
      return changed();
    },
    serverReconnected(now = clock()) {
      timestamp(now);
      if (serverConnected) return snapshot();
      serverConnected = true;
      term += 1;
      hostId = undefined;
      electionDeadline = undefined;
      return changed();
    },
    tick(now = clock()) {
      timestamp(now);
      return elect(now) ? changed() : snapshot();
    },
    announcement(): MeshHostAnnouncement | undefined {
      return !serverConnected && hostId ? { term, hostId } : undefined;
    },
    receiveAnnouncement(announcement: MeshHostAnnouncement, now = clock()) {
      timestamp(now);
      if (serverConnected) return false;
      if (!announcement || !Number.isSafeInteger(announcement.term) || announcement.term !== term) return false;
      if (typeof announcement.hostId !== "string" || announcement.hostId.length === 0 || announcement.hostId.length > 1_024) return false;
      const announcedHost = peerId(announcement.hostId);
      // A connected peer can only announce the same winner every participant
      // derives locally; this is convergence metadata, not an authority grant.
      if (announcedHost !== peers[0]) return false;
      term = announcement.term;
      hostId = announcedHost;
      electionDeadline = undefined;
      changed();
      return true;
    }
  };
}

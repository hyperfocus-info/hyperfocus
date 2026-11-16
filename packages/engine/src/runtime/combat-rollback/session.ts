import { createRollbackLoop, type RollbackLoopOptions } from "../rollback.ts";
import { hashRollbackState, type RollbackParticipant } from "./checkpoint.ts";

export type CombatRollbackOptions<Input, Event> = Omit<
  RollbackLoopOptions<Input, unknown>, "getState" | "setState" | "cloneState" | "update" | "peerIds" | "render" | "now" | "maxFrame"
> & {
  /** Match membership is fixed; create a new session when the roster changes. */
  peerIds: readonly string[];
  participants: readonly RollbackParticipant[];
  update: (context: {
    inputs: Record<string, Input>;
    step: number;
    frame: number;
    /** Stable event id within this frame, such as attacker:move:target. */
    emit: (id: string, event: Event) => void;
  }) => void;
  onConfirmedEvent?: (event: { frame: number; id: string; event: Event }) => void;
  onDesync?: (diagnostic: { frame: number; localHash: string; remoteHash: string }) => void;
};

/** Fixed-roster rollback with complete participant checkpoints and confirmed effects. */
export function createCombatRollbackSession<Input, Event = unknown>(options: CombatRollbackOptions<Input, Event>) {
  const peers = [...new Set([...options.peerIds, options.localPeerId])];
  if (peers.some((peer) => !peer)) throw new Error("rollback peers need non-empty ids");
  const participants = [...options.participants];
  if (participants.length === 0 || new Set(participants.map((part) => part.id)).size !== participants.length) {
    throw new Error("rollback needs participants with unique ids");
  }
  const history = options.maxRollbackFrames ?? 120;
  if (!Number.isSafeInteger(history) || history < 1) throw new RangeError("combat rollback needs at least one history frame");
  const events = new Map<number, Map<string, Event>>();
  const hashes = new Map<number, string>();
  let confirmed = -1;
  const loop = createRollbackLoop({
    ...options,
    peerIds: peers,
    getState: () => participants.map((part) => part.checkpoint()),
    // Participant checkpoints already own detached state; their restoration closures stay local.
    cloneState: (state) => state,
    setState: (state) => { for (const checkpoint of state) checkpoint.restore(); },
    update(inputs, step, frame) {
      const frameEvents = new Map<string, Event>();
      events.set(frame, frameEvents);
      options.update({ inputs, step, frame, emit(id, event) {
        if (!id) throw new Error("rollback events need a stable id");
        if (!frameEvents.has(id)) frameEvents.set(id, structuredClone(event));
      } });
      hashes.set(frame, hashRollbackState({
        state: participants.map((part) => ({ id: part.id, state: part.checkpoint().state }))
      }));
    }
  });

  function confirm() {
    while (confirmed + 1 < loop.frame()) {
      const frame = confirmed + 1;
      if (peers.some((peer) => loop.inputBuffer.get(frame, peer)?.predicted !== false)) break;
      confirmed = frame;
      const ready = events.get(frame);
      events.delete(frame);
      for (const [id, event] of ready ?? []) options.onConfirmedEvent?.({ frame, id, event });
    }
    for (const frame of hashes.keys()) {
      if (frame < loop.frame() - history) hashes.delete(frame);
    }
  }

  return {
    /** Drive once per fixed step. Stalls explicitly instead of silently losing unconfirmed history. */
    tick() {
      if (loop.frame() - confirmed > Math.max(1, history)) {
        throw new Error("rollback history exhausted: wait for peer input before advancing");
      }
      loop.tick();
      confirm();
    },
    receiveInput(peerId: string, frame: number, input: Input) {
      if (!Number.isSafeInteger(frame) || frame < 0) throw new RangeError("invalid rollback frame");
      if (!peers.includes(peerId) || peerId === options.localPeerId || frame <= confirmed) return;
      loop.receiveInput(peerId, frame, input);
      confirm();
    },
    frame: loop.frame,
    confirmedFrame: () => confirmed,
    /** Hashes describe state AFTER the named frame; compare only confirmed frames. */
    stateHash(frame: number) { return frame <= confirmed ? hashes.get(frame) : undefined; },
    compareStateHash(remote: { frame: number; hash: string }) {
      const localHash = remote.frame <= confirmed ? hashes.get(remote.frame) : undefined;
      if (localHash === undefined) return "unavailable" as const;
      if (localHash === remote.hash) return "match" as const;
      options.onDesync?.({ frame: remote.frame, localHash, remoteHash: remote.hash });
      return "desync" as const;
    }
  };
}

export { pluginWorkload } from "@hyperfocus/pad-pilot-app/serialization-workload";
import { create, fromBinary, toBinary } from "@bufbuild/protobuf";
import { encodeValue, decodeValue } from "@hyperfocus/serialization";
import { parseServerEventFrame } from "@hyperfocus/ai-core/protocol";
import { combatRoomInputCodec, readCombatRoomInput } from "@hyperfocus/engine/combat/net";
import { createCombatRecording, readCombatRecording } from "@hyperfocus/engine/combat/net";
import { createPortableMemoryPersistenceAdapter, createPortablePersistenceBackup, validatePortablePersistenceSnapshot } from "@hyperfocus/engine/server";
import { encodeReplayArchive, decodeReplayArchive } from "@hyperfocus/touch-of-death/replay";
import { BackupSchema, CombatInputSchema, StreamBatchSchema } from "./generated/candidates_pb";

export type Candidate = { name: string; encode(): Uint8Array; decode(bytes: Uint8Array): unknown };
export type Workload = { name: string; value: unknown; iterations: number; candidates: Candidate[]; limits: string };
const encoder = new TextEncoder(), decoder = new TextDecoder("utf-8", { fatal: true });
const limits = { maxBytes: 67108864, maxNodes: 4000000 };

function baselines<T>(value: T, validate: (value: unknown) => T): Candidate[] {
  return [
    { name: "json", encode: () => encoder.encode(JSON.stringify(validate(value))), decode: bytes => validate(JSON.parse(decoder.decode(bytes))) },
    { name: "dynamic-protobuf", encode: () => encodeValue(validate(value), limits), decode: bytes => validate(decodeValue(bytes, limits)) },
  ];
}

export function inputWorkload(): Workload {
  const value = readCombatRoomInput({ matchId: "match-0123456789", frame: 12345, actions: ["guard", "jab"], direction: { x: 0.5, y: 0, z: -0.5 } });
  return { name: "engine-input", value, iterations: 1000, limits: "Actual bounded input validator and existing binary codec; no live simulation/network timing.", candidates: [
    ...baselines(value, readCombatRoomInput),
    { name: "engine-binary", encode: () => combatRoomInputCodec.encode(value), decode: combatRoomInputCodec.decode },
    { name: "typed-protobuf", encode: () => toBinary(CombatInputSchema, create(CombatInputSchema, readCombatRoomInput(value))),
      decode: bytes => readCombatRoomInput(fromBinary(CombatInputSchema, bytes)) },
  ] };
}

export function replayWorkload(frameCount = 3600): Workload {
  const recording = createCombatRecording({ matchId: "match-0123456789", contentId: "combat-v2:benchmark-content", seed: 123456,
    seats: ["player-a", "player-b"], mode: "training" });
  for (let frame = 0; frame < frameCount; frame++) recording.append({ frames: [0, 1].map(seat => ({
    matchId: "match-0123456789", frame, seat, actions: frame % (seat ? 37 : 43) === 0 ? [seat ? "guard" : "jab"] : [],
    direction: { x: frame % 120 < 60 ? 0.5 : -0.5, y: 0, z: seat ? -0.5 : 0.5 },
  })) });
  const value = recording.snapshot(), validate = (input: unknown) => readCombatRecording({ value: input });
  function compact() {
    const valid = validate(value);
    return { version: valid.version, matchId: valid.matchId, contentId: valid.contentId, seed: valid.seed, seats: valid.seats,
      ...(valid.mode === undefined ? {} : { mode: valid.mode }), frames: valid.frames.map(([a, b]) => ({
        firstActions: a.actions, firstX: a.direction.x, firstZ: a.direction.z,
        secondActions: b.actions, secondX: b.direction.x, secondZ: b.direction.z,
      })) };
  }
  function expand(decoded: { version: number; matchId: string; contentId: string; seed: number; seats: string[];
    mode?: string; frames: ReturnType<typeof compact>["frames"] }) {
    return validate({ ...decoded, frames: decoded.frames.map((frame, index) => [
      { matchId: decoded.matchId, frame: index, seat: 0, actions: frame.firstActions, direction: { x: frame.firstX, y: 0, z: frame.firstZ } },
      { matchId: decoded.matchId, frame: index, seat: 1, actions: frame.secondActions, direction: { x: frame.secondX, y: 0, z: frame.secondZ } },
    ]) });
  }
  return { name: `touch-of-death-replay-${frameCount}`, value, iterations: 3,
    limits: "Deterministic 60 Hz confirmed-input recording through the shipped recording API; synthetic play pattern, no replay rendering timing.",
    candidates: [...baselines(value, validate), {
      name: "typed-protobuf", encode: () => encodeReplayArchive({ value }),
      decode: bytes => decodeReplayArchive({ bytes }).recording,
    }, {
      name: "compact-json", encode: () => encoder.encode(JSON.stringify(compact())),
      decode: bytes => expand(JSON.parse(decoder.decode(bytes))),
    }] };
}

export function streamWorkload(count = 64): Workload {
  const value = Array.from({ length: count }, (_, index) => ({ type: "assistant.chat.delta", requestId: `request-${index}`,
    payload: { assistantId: "assistant-0123456789", sessionId: "session-0123456789", delta: `Stream fragment ${index}. ` } }));
  const validate = (input: unknown) => parseServerEventFrame({ type: "server.events-batch", payload: { events: input } });
  return { name: `harness-stream-${count}`, value: validate(value), iterations: count === 1 ? 1000 : 30,
    limits: "Actual assistant.chat.delta validator; proposed typed batch omits the constant event name; excludes websocket compression/framing and event delivery.",
    candidates: [...baselines(validate(value), validate), {
      name: "typed-protobuf", encode() {
        const events = validate(value).map(event => {
          if (event.type !== "assistant.chat.delta") throw new Error("Unexpected event type");
          return { requestId: event.requestId, ...event.payload };
        });
        return toBinary(StreamBatchSchema, create(StreamBatchSchema, { events }));
      }, decode(bytes) {
        return validate(fromBinary(StreamBatchSchema, bytes).events.map(event => ({ type: "assistant.chat.delta", requestId: event.requestId,
          payload: { assistantId: event.assistantId, sessionId: event.sessionId, delta: event.delta } })));
      },
    }] };
}

export async function backupWorkload(): Promise<Workload> {
  const adapter = createPortableMemoryPersistenceAdapter();
  if (!adapter.appendEvent) throw new Error("Backup fixture requires event persistence");
  for (let i = 0; i < 512; i++) await adapter.savePlayer(`player-${i}`, { level: i % 100, coins: i * 17,
    inventory: Array.from({ length: 8 }, (_, slot) => ({ item: `item-${(i + slot) % 32}`, count: slot + 1 })), biography: "Saved player progress. ".repeat(8) });
  for (let i = 0; i < 64; i++) await adapter.saveRoom(`room-${i}`, { map: `arena-${i % 4}`, tick: i * 100, settings: { maxPlayers: 16, public: true } });
  for (let i = 0; i < 512; i++) await adapter.appendEvent({ type: "reward", playerId: `player-${i}`, amount: i * 17, sequence: i });
  const bytes = await createPortablePersistenceBackup(adapter, { createdAt: 123456 });
  const value = JSON.parse(decoder.decode(bytes));
  const validate = (input: unknown) => {
    if (!input || typeof input !== "object" || !('snapshot' in input) || !('checksum' in input) || typeof input.checksum !== "string"
      || Reflect.get(input, "format") !== "hyperfocus-portable-persistence-backup" || Reflect.get(input, "version") !== 1 || Reflect.get(input, "createdAt") !== 123456) throw new Error("Invalid backup");
    return { format: "hyperfocus-portable-persistence-backup", version: 1, createdAt: 123456,
      checksum: input.checksum, snapshot: validatePortablePersistenceSnapshot(input.snapshot) };
  };
  const valid = validate(value);
  return { name: "sql-logical-backup-512-players", value: valid, iterations: 3,
    limits: "Real portable backup API with deterministic logical rows; checksum retained. Codec timing excludes checksum computation, encryption and database restore. Does not represent raw SQLite page backups.",
    candidates: [...baselines(valid, validate), {
      name: "typed-envelope-protobuf", encode() {
        const envelope = validate(valid);
        return toBinary(BackupSchema, create(BackupSchema, { ...envelope, snapshotVersion: envelope.snapshot.version,
          players: envelope.snapshot.players.map(row => ({ id: row.id, value: encodeValue(row.record) })),
          rooms: envelope.snapshot.rooms.map(row => ({ id: row.id, value: encodeValue(row.snapshot) })), events: envelope.snapshot.events.map(event => encodeValue(event)) }));
      }, decode(bytes) {
        const parsed = fromBinary(BackupSchema, bytes);
        return validate({ ...parsed, snapshot: { version: parsed.snapshotVersion,
          players: parsed.players.map(row => ({ id: row.id, record: decodeValue(row.value) })),
          rooms: parsed.rooms.map(row => ({ id: row.id, snapshot: decodeValue(row.value) })), events: parsed.events.map(event => decodeValue(event)) } });
      },
    }] };
}

import { decodeSnapshot, encodeSnapshot } from "./encode.ts";
import { decodeReplicationFrame, encodeReplicationFrame, type ReplicationFrame, type ReplicationFrameKind } from "./frames.ts";
import type { ReplicationSchema } from "./schema.ts";

export type SnapshotFrameCodecConfig<TSnapshot, TEncoded = TSnapshot> = {
  schema: ReplicationSchema<TEncoded>;
  normalize?: (snapshot: TSnapshot) => TEncoded;
  denormalize?: (encoded: TEncoded) => TSnapshot;
  sequence?: (encoded: TEncoded, snapshot: TSnapshot) => number;
  baseline?: (encoded: TEncoded, snapshot: TSnapshot) => number;
  kind?: ReplicationFrameKind;
};

export type SnapshotFrameCodec<TSnapshot> = {
  encode(snapshot: TSnapshot): Uint8Array;
  decode(message: ArrayBuffer | Uint8Array): TSnapshot;
  decodeFrame(message: ArrayBuffer | Uint8Array): { frame: ReplicationFrame; snapshot: TSnapshot };
};

export function createSnapshotFrameCodec<TSnapshot, TEncoded = TSnapshot>(
  config: SnapshotFrameCodecConfig<TSnapshot, TEncoded>
): SnapshotFrameCodec<TSnapshot> {
  const kind = config.kind ?? "snapshot";
  const normalize = config.normalize ?? ((snapshot: TSnapshot) => snapshot as unknown as TEncoded);
  const denormalize = config.denormalize ?? ((encoded: TEncoded) => encoded as unknown as TSnapshot);

  function bytesFrom(message: ArrayBuffer | Uint8Array) {
    return message instanceof Uint8Array ? message : new Uint8Array(message);
  }

  function decodeFrame(message: ArrayBuffer | Uint8Array) {
    const frame = decodeReplicationFrame(bytesFrom(message));
    if (frame.kind !== kind) throw new Error(`Unsupported snapshot frame kind: ${frame.kind}`);
    return { frame, snapshot: denormalize(decodeSnapshot(config.schema, frame.bytes)) };
  }

  return {
    encode(snapshot) {
      const encoded = normalize(snapshot);
      return encodeReplicationFrame({
        kind,
        sequence: config.sequence?.(encoded, snapshot) ?? 0,
        baseline: config.baseline?.(encoded, snapshot) ?? 0,
        bytes: encodeSnapshot(config.schema, encoded)
      });
    },
    decode(message) {
      return decodeFrame(message).snapshot;
    },
    decodeFrame
  };
}

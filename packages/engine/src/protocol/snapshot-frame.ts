import { decodeSnapshot, encodeSnapshot } from "./encode.ts";
import { decodeReplicationFrame, encodeReplicationFrame, type ReplicationFrame, type ReplicationFrameKind } from "./frames.ts";
import type { ReplicationSchema } from "./schema.ts";

type SnapshotFrameMetadata<TSnapshot, TEncoded> = {
  sequence?: (encoded: TEncoded, snapshot: TSnapshot) => number;
  baseline?: (encoded: TEncoded, snapshot: TSnapshot) => number;
  kind?: ReplicationFrameKind;
};

export type IdentitySnapshotFrameCodecConfig<TSnapshot> = SnapshotFrameMetadata<TSnapshot, TSnapshot> & {
  schema: ReplicationSchema<TSnapshot>;
  normalize?: never;
  denormalize?: never;
};

export type NormalizedSnapshotFrameCodecConfig<TSnapshot, TEncoded> = SnapshotFrameMetadata<TSnapshot, TEncoded> & {
  schema: ReplicationSchema<TEncoded>;
  normalize: (snapshot: TSnapshot) => TEncoded;
  denormalize: (encoded: TEncoded) => TSnapshot;
};

export type SnapshotFrameCodecConfig<TSnapshot, TEncoded = TSnapshot> =
  | IdentitySnapshotFrameCodecConfig<TSnapshot>
  | NormalizedSnapshotFrameCodecConfig<TSnapshot, TEncoded>;

export type SnapshotFrameCodec<TSnapshot> = {
  encode(snapshot: TSnapshot): Uint8Array;
  decode(message: ArrayBuffer | Uint8Array): TSnapshot;
  decodeFrame(message: ArrayBuffer | Uint8Array): { frame: ReplicationFrame; snapshot: TSnapshot };
};

function createEncodedSnapshotFrameCodec<TSnapshot, TEncoded>(
  config: NormalizedSnapshotFrameCodecConfig<TSnapshot, TEncoded>
): SnapshotFrameCodec<TSnapshot> {
  const kind = config.kind ?? "snapshot";

  function bytesFrom(message: ArrayBuffer | Uint8Array) {
    return message instanceof Uint8Array ? message : new Uint8Array(message);
  }

  function decodeFrame(message: ArrayBuffer | Uint8Array) {
    const frame = decodeReplicationFrame(bytesFrom(message));
    if (frame.kind !== kind) throw new Error(`Unsupported snapshot frame kind: ${frame.kind}`);
    return { frame, snapshot: config.denormalize(decodeSnapshot(config.schema, frame.bytes)) };
  }

  return {
    encode(snapshot) {
      const encoded = config.normalize(snapshot);
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

function identity<T>(value: T): T {
  return value;
}

function createIdentitySnapshotFrameCodec<TSnapshot>(
  config: IdentitySnapshotFrameCodecConfig<TSnapshot>
): SnapshotFrameCodec<TSnapshot> {
  return createEncodedSnapshotFrameCodec({
    ...config,
    normalize: identity,
    denormalize: identity
  });
}

function isNormalizedSnapshotFrameConfig<TSnapshot, TEncoded>(
  config: SnapshotFrameCodecConfig<TSnapshot, TEncoded>
): config is NormalizedSnapshotFrameCodecConfig<TSnapshot, TEncoded> {
  return typeof config.normalize === "function" && typeof config.denormalize === "function";
}

export function createSnapshotFrameCodec<TSnapshot>(
  config: IdentitySnapshotFrameCodecConfig<TSnapshot>
): SnapshotFrameCodec<TSnapshot>;
export function createSnapshotFrameCodec<TSnapshot, TEncoded>(
  config: NormalizedSnapshotFrameCodecConfig<TSnapshot, TEncoded>
): SnapshotFrameCodec<TSnapshot>;
export function createSnapshotFrameCodec<TSnapshot, TEncoded>(
  config: SnapshotFrameCodecConfig<TSnapshot, TEncoded>
): SnapshotFrameCodec<TSnapshot> {
  return isNormalizedSnapshotFrameConfig(config)
    ? createEncodedSnapshotFrameCodec(config)
    : createIdentitySnapshotFrameCodec(config);
}

export type StateChecksumId = string | number;

export type StateEntityChecksum<TId extends StateChecksumId = StateChecksumId> = {
  id: TId;
  checksum: number;
};

export type StateChecksumManifest<TId extends StateChecksumId = StateChecksumId> = {
  frame: number;
  root: number;
  entities: readonly StateEntityChecksum<TId>[];
};

export type StateChecksumDiff<TId extends StateChecksumId = StateChecksumId> = {
  matches: boolean;
  changed: TId[];
  localOnly: TId[];
  remoteOnly: TId[];
};

export type StateRepairPatch<TId extends StateChecksumId, TEntity> = {
  frame: number;
  root: number;
  upserts: Array<{ id: TId; entity: TEntity }>;
  removals: TId[];
};

export type StateChecksumHistoryOptions<TEntity, TId extends StateChecksumId> = {
  capacity?: number;
  getId: (entity: TEntity) => TId;
  encodeEntity: (entity: TEntity) => Uint8Array;
  cloneEntity?: (entity: TEntity) => TEntity;
};

type StoredFrame<TEntity, TId extends StateChecksumId> = {
  manifest: StateChecksumManifest<TId>;
  entities: Map<string, { id: TId; entity: TEntity }>;
};

const CRC32_TABLE = new Uint32Array(256);
const checksumTextEncoder = new TextEncoder();
for (let index = 0; index < CRC32_TABLE.length; index += 1) {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) value = (value & 1) !== 0 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  CRC32_TABLE[index] = value >>> 0;
}

function validateFrame(frame: number) {
  if (!Number.isSafeInteger(frame) || frame < 0) throw new RangeError("state checksum frame must be a non-negative safe integer");
}

function idKey(id: StateChecksumId) {
  if (typeof id === "number") {
    if (!Number.isSafeInteger(id)) throw new RangeError("numeric state entity ids must be safe integers");
    return `n:${id}`;
  }
  return `s:${id}`;
}

function validateManifest<TId extends StateChecksumId>(manifest: StateChecksumManifest<TId>, label: string) {
  validateFrame(manifest.frame);
  if (!Number.isSafeInteger(manifest.root) || manifest.root < 0 || manifest.root > 0xffff_ffff) {
    throw new RangeError(`${label} state root must be an unsigned 32-bit integer`);
  }
  const ids = new Set<string>();
  for (const entry of manifest.entities) {
    const key = idKey(entry.id);
    if (ids.has(key)) throw new Error(`${label} state manifest contains duplicate entity id: ${String(entry.id)}`);
    ids.add(key);
    if (!Number.isSafeInteger(entry.checksum) || entry.checksum < 0 || entry.checksum > 0xffff_ffff) {
      throw new RangeError(`${label} entity checksum must be an unsigned 32-bit integer`);
    }
  }
}

function cloneDefault<TEntity>(entity: TEntity) {
  if (typeof structuredClone !== "function") throw new Error("state reconciliation needs cloneEntity when structuredClone is unavailable");
  return structuredClone(entity);
}

function updateCrc(crc: number, bytes: Uint8Array) {
  for (const byte of bytes) crc = CRC32_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  return crc;
}

/** Returns an unsigned CRC-32 suitable for fast desync detection, not authentication. */
export function checksumBytes(bytes: Uint8Array) {
  if (!(bytes instanceof Uint8Array)) throw new TypeError("checksum input must be a Uint8Array");
  return (updateCrc(0xffff_ffff, bytes) ^ 0xffff_ffff) >>> 0;
}

function rootChecksum<TId extends StateChecksumId>(entities: readonly StateEntityChecksum<TId>[]) {
  let crc = 0xffff_ffff;
  for (const entry of entities) {
    crc = updateCrc(crc, checksumTextEncoder.encode(idKey(entry.id)));
    crc = CRC32_TABLE[(crc ^ (entry.checksum & 0xff)) & 0xff]! ^ (crc >>> 8);
    crc = CRC32_TABLE[(crc ^ ((entry.checksum >>> 8) & 0xff)) & 0xff]! ^ (crc >>> 8);
    crc = CRC32_TABLE[(crc ^ ((entry.checksum >>> 16) & 0xff)) & 0xff]! ^ (crc >>> 8);
    crc = CRC32_TABLE[(crc ^ ((entry.checksum >>> 24) & 0xff)) & 0xff]! ^ (crc >>> 8);
  }
  return (crc ^ 0xffff_ffff) >>> 0;
}

export function diffStateChecksums<TId extends StateChecksumId>(
  local: StateChecksumManifest<TId>,
  remote: StateChecksumManifest<TId>
): StateChecksumDiff<TId> {
  validateManifest(local, "local");
  validateManifest(remote, "remote");
  if (local.frame !== remote.frame) throw new Error(`cannot compare state checksums from frames ${local.frame} and ${remote.frame}`);
  const remoteById = new Map(remote.entities.map((entry) => [idKey(entry.id), entry]));
  const localKeys = new Set<string>();
  const changed: TId[] = [];
  const localOnly: TId[] = [];
  for (const entry of local.entities) {
    const key = idKey(entry.id);
    localKeys.add(key);
    const remoteEntry = remoteById.get(key);
    if (!remoteEntry) localOnly.push(entry.id);
    else if (entry.checksum !== remoteEntry.checksum) changed.push(entry.id);
  }
  const remoteOnly = remote.entities.filter((entry) => !localKeys.has(idKey(entry.id))).map((entry) => entry.id);
  return { matches: local.root === remote.root && changed.length === 0 && localOnly.length === 0 && remoteOnly.length === 0, changed, localOnly, remoteOnly };
}

export function applyStateRepairPatch<TId extends StateChecksumId, TEntity>(
  target: Map<TId, TEntity>,
  patch: StateRepairPatch<TId, TEntity>,
  cloneEntity: (entity: TEntity) => TEntity = cloneDefault
) {
  for (const id of patch.removals) target.delete(id);
  for (const entry of patch.upserts) target.set(entry.id, cloneEntity(entry.entity));
}

export function createStateChecksumHistory<TEntity, TId extends StateChecksumId>(
  options: StateChecksumHistoryOptions<TEntity, TId>
) {
  const capacity = options.capacity ?? 120;
  if (!Number.isSafeInteger(capacity) || capacity <= 0) throw new RangeError("state checksum history capacity must be a positive safe integer");
  const cloneEntity = options.cloneEntity ?? cloneDefault<TEntity>;
  const frames = new Map<number, StoredFrame<TEntity, TId>>();

  function record(frame: number, source: Iterable<TEntity>) {
    validateFrame(frame);
    const storedEntities = new Map<string, { id: TId; entity: TEntity }>();
    const checksums: StateEntityChecksum<TId>[] = [];
    for (const entity of source) {
      const id = options.getId(entity);
      const key = idKey(id);
      if (storedEntities.has(key)) throw new Error(`duplicate state entity id: ${String(id)}`);
      const bytes = options.encodeEntity(entity);
      if (!(bytes instanceof Uint8Array)) throw new TypeError("encodeEntity must return a Uint8Array");
      storedEntities.set(key, { id, entity: cloneEntity(entity) });
      checksums.push({ id, checksum: checksumBytes(bytes) });
    }
    checksums.sort((left, right) => idKey(left.id).localeCompare(idKey(right.id)));
    const manifest: StateChecksumManifest<TId> = { frame, root: rootChecksum(checksums), entities: checksums };
    frames.set(frame, { manifest, entities: storedEntities });
    while (frames.size > capacity) frames.delete(frames.keys().next().value as number);
    return manifest;
  }

  return {
    record,
    manifest(frame: number) {
      return frames.get(frame)?.manifest;
    },
    diff(remote: StateChecksumManifest<TId>) {
      const local = frames.get(remote.frame);
      if (!local) return undefined;
      return diffStateChecksums(local.manifest, remote);
    },
    patchFor(remote: StateChecksumManifest<TId>): StateRepairPatch<TId, TEntity> | undefined {
      const local = frames.get(remote.frame);
      if (!local) return undefined;
      const diff = diffStateChecksums(local.manifest, remote);
      const upsertIds = new Set([...diff.changed, ...diff.localOnly].map(idKey));
      const upserts: Array<{ id: TId; entity: TEntity }> = [];
      for (const key of upsertIds) {
        const entry = local.entities.get(key);
        if (entry) upserts.push({ id: entry.id, entity: cloneEntity(entry.entity) });
      }
      return { frame: remote.frame, root: local.manifest.root, upserts, removals: [...diff.remoteOnly] };
    },
    clearBefore(frame: number) {
      validateFrame(frame);
      for (const storedFrame of frames.keys()) if (storedFrame < frame) frames.delete(storedFrame);
    },
    size() {
      return frames.size;
    }
  };
}

import { createSharedCellReplicator, selectVisibleEntityBuckets, selectTransientEffectsForViewer, type AuthoritativePlayer, type RoomContext, type SharedCellReplicationEntity, type RoomReplicationRequest } from "@hyperfocus/engine/server";
import { PREENCODED_SNAPSHOT_BYTES, encodeMultipartReplicationEnvelope, type ReplicationEnvelopeSegment } from "@hyperfocus/engine/protocol";
import { MMO_SKILL_DEMO_SHARED_HOT_DIRTY_FULL, MMO_SKILL_DEMO_SHARED_HOT_DIRTY_POSITION, MMO_SKILL_DEMO_SHARED_HOT_DIRTY_STATE, MMO_SKILL_DEMO_SHARED_HOT_OFFSETS } from "./shared-hot.ts";
import { createMmoSkillDemoSegmentState, encodeMmoSkillDemoSegment, mmoSkillDemoCellKey, mmoSkillDemoEntityIdCode, mmoSkillDemoEntityTypeCode, mmoSkillDemoNeighborCellKeys, mmoSkillDemoStaticEntitySignature, toMmoSkillDemoStaticSegmentEntity, toMmoSkillDemoVolatileSegmentEntity, type MmoSkillDemoSegmentKind } from "./segmented-replication.ts";
import { type HazardEntity, type LootEntity, MMO_SKILL_DEMO_ENTITY_BUCKETS, type MmoSegmentTopLevel, type MmoSkillDemoEntity, type MmoSkillDemoEntityKind, type MmoSkillDemoEntityViews, type MmoSkillDemoInput, type MmoSkillDemoState, type NpcEntity, type PlayerEntity, type PublicCellSegmentCache, type PublicStaticRecord, type ResourceEntity, type StaticAckRecord, type StaticDiscoveryQueueItem, type StaticDiscoveryTelemetry } from "./shared-contracts.ts";
import { MMO_SKILL_DEMO_COARSE_SNAPSHOT_AOI_ENABLED, MMO_SKILL_DEMO_DIRECT_SHARED_SLOTS_ENABLED, MMO_SKILL_DEMO_DIRTY_REPLICATION_ENABLED, MMO_SKILL_DEMO_SHARED_DIRTY_SLAB_ENABLED, MMO_SKILL_DEMO_STATIC_LAZY_ENABLED, type MmoSkillDemoSharedHotRuntime, clearMmoSkillDemoDirtyReplication, dirtyReplicationState, ensureSharedHotEntity, entitiesInState, entitiesOfType, mmoSkillDemoSharedHotSlotForEntity, sharedHotRuntimeByState } from "./shared-entity-registry.ts";
import { projectMmoEntityForViewer, sanitizeEffectForReplication, sanitizeEntityForReplication, sanitizeMmoReplicationSnapshot } from "./shared-replication-projection.ts";
import { type ZoneRuntime } from "./shared-runtime-contracts.ts";

function mmoSegmentTopLevel(state: MmoSkillDemoState, activePlayers: number): MmoSegmentTopLevel {
  return {
    tick: state.tick,
    mapRevision: state.mapRevision,
    roomKind: state.roomKind,
    roomLabel: state.roomLabel,
    activePlayers,
    worldEventId: state.worldEventId,
    worldEventName: state.worldEventName,
    worldEventZoneId: state.worldEventZoneId,
    worldEventPhase: state.worldEventPhase,
    worldEventObjective: state.worldEventObjective,
    worldEventProgress: state.worldEventProgress,
    worldEventGoal: state.worldEventGoal,
    worldEventTimerMs: Math.ceil(Math.max(0, state.worldEventTimerMs) / 1000) * 1000,
    worldEventReward: state.worldEventReward
  };
}

function entitySegmentCellKey(entity: MmoSkillDemoEntity) {
  if (entity.entityType === "hazard" && entity.kind === "line") return mmoSkillDemoCellKey((entity.x + entity.toX) * 0.5, (entity.y + entity.toY) * 0.5);
  return mmoSkillDemoCellKey(entity.x, entity.y);
}

function mutableListBucket<T>(map: Map<string, T[]>, key: string) {
  let bucket = map.get(key);
  if (!bucket) {
    bucket = [];
    map.set(key, bucket);
  }
  return bucket;
}

function sharedHotSlotByteOffset(runtime: MmoSkillDemoSharedHotRuntime, slotIndex: number) {
  return runtime.pool.dataByteOffset + slotIndex * runtime.pool.slotByteSize;
}

function sharedHotCellKeyForSlot(runtime: MmoSkillDemoSharedHotRuntime, view: DataView, slotIndex: number, entity: MmoSkillDemoEntity) {
  const slotOffset = sharedHotSlotByteOffset(runtime, slotIndex);
  const x = view.getFloat32(slotOffset + MMO_SKILL_DEMO_SHARED_HOT_OFFSETS.x, true);
  const y = view.getFloat32(slotOffset + MMO_SKILL_DEMO_SHARED_HOT_OFFSETS.y, true);
  if (entity.entityType === "hazard" && entity.kind === "line") return mmoSkillDemoCellKey((x + entity.toX) * 0.5, (y + entity.toY) * 0.5);
  return mmoSkillDemoCellKey(x, y);
}

function compactPublicCellStaticEntity(entity: ReturnType<typeof toMmoSkillDemoStaticSegmentEntity>) {
  return entity;
}

function addPublicCellSegmentRecord(
  runtime: ZoneRuntime,
  top: MmoSegmentTopLevel,
  staticRecordsByEntity: Map<string, PublicStaticRecord>,
  entity: MmoSkillDemoEntity,
  cellKey: string
) {
  const projected = sanitizeEntityForReplication(projectMmoEntityForViewer(entity, "") ?? entity);
  const staticEntity = compactPublicCellStaticEntity(toMmoSkillDemoStaticSegmentEntity(projected));
  const segmentId = `world-static:${projected.id}`;
  const record: PublicStaticRecord = {
    entityId: projected.id,
    cellKey,
    kind: "world-cell-static",
    signature: mmoSkillDemoStaticEntitySignature(staticEntity),
    segmentId,
    staticEntity
  };
  if (!MMO_SKILL_DEMO_STATIC_LAZY_ENABLED) record.segment = staticSegmentForRecord(top, record);
  runtime.staticSignatureBySegmentId.set(record.segmentId, record.signature);
  staticRecordsByEntity.set(projected.id, record);
}

function buildPublicStaticCellRecords(
  runtime: ZoneRuntime,
  top: MmoSegmentTopLevel,
  staticRecordsByEntity: Map<string, PublicStaticRecord>
) {
  const recordsByCell = new Map<string, PublicStaticRecord[]>();
  for (const record of staticRecordsByEntity.values()) {
    if (record.staticEntity.entityType === "player") continue;
    mutableListBucket(recordsByCell, record.cellKey).push(record);
  }
  const staticRecordsByCell = new Map<string, PublicStaticRecord>();
  for (const [cellKey, records] of recordsByCell) {
    records.sort((a, b) => a.entityId.localeCompare(b.entityId));
    const firstRecord = records[0];
    if (!firstRecord) continue;
    const staticEntities: Record<string, ReturnType<typeof toMmoSkillDemoStaticSegmentEntity>> = {};
    const signatures: string[] = [];
    const entityIds: string[] = [];
    for (const record of records) {
      staticEntities[record.entityId] = record.staticEntity;
      signatures.push(record.signature);
      entityIds.push(record.entityId);
    }
    const segmentId = `world-static-cell:${cellKey}`;
    const cellRecord: PublicStaticRecord = {
      entityId: `cell:${cellKey}`,
      entityIds,
      cellKey,
      kind: "world-cell-static",
      signature: signatures.join("|"),
      segmentId,
      staticEntity: firstRecord.staticEntity,
      staticEntities
    };
    const cacheKey = `${segmentId}:${cellRecord.signature}`;
    let segment = runtime.staticCellSegmentsBySignature.get(cacheKey);
    if (!segment) {
      segment = staticSegmentForRecord(top, cellRecord);
      runtime.staticCellSegmentsBySignature.set(cacheKey, segment);
    }
    cellRecord.segment = segment;
    runtime.staticSignatureBySegmentId.set(segmentId, cellRecord.signature);
    staticRecordsByCell.set(cellKey, cellRecord);
  }
  return staticRecordsByCell;
}

function fillPublicCellSegmentsFromSharedSlots(
  runtime: ZoneRuntime,
  state: MmoSkillDemoState,
  top: MmoSegmentTopLevel,
  publicEntityIdsByCell: Map<string, string[]>,
  volatileHotRefsByCell: Map<string, SharedCellReplicationEntity[]>,
  entityCellById: Map<string, string>,
  entityTypeById: Map<string, MmoSkillDemoEntityKind>,
  staticRecordsByEntity: Map<string, PublicStaticRecord>
) {
  if (!MMO_SKILL_DEMO_DIRECT_SHARED_SLOTS_ENABLED) return false;
  const hotRuntime = sharedHotRuntimeByState.get(state);
  if (!hotRuntime) return false;
  const index = hotRuntime.indices.all;
  if (index.count === 0 && Object.keys(state.entities ?? {}).length > 0) return false;
  const view = new DataView(hotRuntime.pool.buffer);
  for (let position = 0; position < index.count; position += 1) {
    const slotIndex = index.slots[position];
    const id = hotRuntime.entityIdsBySlot[slotIndex];
    const entityType = hotRuntime.entityTypesBySlot[slotIndex];
    const entity = id ? state.entities[id] : undefined;
    if (!id || !entityType || entity?.entityType !== entityType) continue;
    if (entity.entityType === "loot" && entity.ownerId) continue;
    const key = sharedHotCellKeyForSlot(hotRuntime, view, slotIndex, entity);
    entityCellById.set(id, key);
    entityTypeById.set(id, entityType);
    mutableListBucket(publicEntityIdsByCell, key).push(id);
    mutableListBucket(volatileHotRefsByCell, key).push({
      idCode: hotRuntime.entityIdCodesBySlot[slotIndex],
      typeCode: hotRuntime.entityTypeCodesBySlot[slotIndex],
      slotIndex,
      dirtyMask: hotRuntime.dirtyMasksBySlot[slotIndex]
    });
    addPublicCellSegmentRecord(runtime, top, staticRecordsByEntity, entity, key);
  }
  return true;
}

function rebuildPublicCellSegments(runtime: ZoneRuntime, state: MmoSkillDemoState, activePlayers: number, forceVolatileEncode = false) {
  if (runtime.segmentCache?.tick === state.tick && (!forceVolatileEncode || runtime.segmentCache.fullVolatile)) return runtime.segmentCache;
  const previousCache = runtime.segmentCache;
  const top = mmoSegmentTopLevel(state, activePlayers);
  const publicEntityIdsByCell = new Map<string, string[]>();
  const volatileHotRefsByCell = new Map<string, SharedCellReplicationEntity[]>();
  const entityCellById = new Map<string, string>();
  const entityTypeById = new Map<string, MmoSkillDemoEntityKind>();
  const staticRecordsByEntity = new Map<string, PublicStaticRecord>();
  const useSharedDirtySlabs = MMO_SKILL_DEMO_SHARED_DIRTY_SLAB_ENABLED && !forceVolatileEncode && !!previousCache;
  const fullVolatile = forceVolatileEncode || (!useSharedDirtySlabs && (!MMO_SKILL_DEMO_DIRTY_REPLICATION_ENABLED || !previousCache));
  const dirtyState = dirtyReplicationState(state);
  const dirtyCells = new Set<string>();
  const directSharedSlots = fillPublicCellSegmentsFromSharedSlots(
    runtime,
    state,
    top,
    publicEntityIdsByCell,
    volatileHotRefsByCell,
    entityCellById,
    entityTypeById,
    staticRecordsByEntity
  );

  if (!directSharedSlots) {
    for (const sourceEntity of entitiesInState(state)) {
      if (sourceEntity.entityType === "loot" && sourceEntity.ownerId) continue;
      const key = entitySegmentCellKey(sourceEntity);
      entityCellById.set(sourceEntity.id, key);
      entityTypeById.set(sourceEntity.id, sourceEntity.entityType);
      mutableListBucket(publicEntityIdsByCell, key).push(sourceEntity.id);
      let slotIndex = mmoSkillDemoSharedHotSlotForEntity(state, sourceEntity.id);
      if (slotIndex === undefined) {
        ensureSharedHotEntity(state, sourceEntity);
        slotIndex = mmoSkillDemoSharedHotSlotForEntity(state, sourceEntity.id);
      }
      if (slotIndex !== undefined) {
        const hotRuntime = sharedHotRuntimeByState.get(state);
        mutableListBucket(volatileHotRefsByCell, key).push({
          idCode: hotRuntime?.entityIdCodesBySlot[slotIndex] || mmoSkillDemoEntityIdCode(sourceEntity.id),
          typeCode: hotRuntime?.entityTypeCodesBySlot[slotIndex] || mmoSkillDemoEntityTypeCode(sourceEntity.entityType),
          slotIndex,
          dirtyMask: hotRuntime?.dirtyMasksBySlot[slotIndex] ?? MMO_SKILL_DEMO_SHARED_HOT_DIRTY_FULL
        });
      }
      addPublicCellSegmentRecord(runtime, top, staticRecordsByEntity, sourceEntity, key);
    }
  }
  if (!fullVolatile && previousCache && !useSharedDirtySlabs) {
    for (const [id, cellKey] of entityCellById) {
      const previousCell = previousCache.entityCellById.get(id);
      const previousType = previousCache.entityTypeById.get(id);
      if (dirtyState?.volatileEntityIds.has(id) || previousCell !== cellKey || previousType !== entityTypeById.get(id)) {
        dirtyCells.add(cellKey);
        if (previousCell) dirtyCells.add(previousCell);
      }
    }
    for (const id of dirtyState?.removedEntityIds ?? []) {
      const previousCell = previousCache.entityCellById.get(id);
      if (previousCell) dirtyCells.add(previousCell);
    }
  }

  const volatileBuffersByCell = new Map<string, Uint8Array>();
  const fullVolatileBuffersByCell = new Map<string, Uint8Array>();
  const hotPool = sharedHotRuntimeByState.get(state)?.pool;
  const sharedCellReplicator = hotPool ? createSharedCellReplicator<MmoSkillDemoSegmentKind>(hotPool) : undefined;
  const dirtyCellReplicator = hotPool && useSharedDirtySlabs ? createSharedCellReplicator<MmoSkillDemoSegmentKind>(hotPool, {
    fullDirtyMask: MMO_SKILL_DEMO_SHARED_HOT_DIRTY_FULL,
    dirtyRanges: [
      { mask: MMO_SKILL_DEMO_SHARED_HOT_DIRTY_POSITION, offset: MMO_SKILL_DEMO_SHARED_HOT_OFFSETS.x, byteLength: 4 },
      { mask: MMO_SKILL_DEMO_SHARED_HOT_DIRTY_POSITION, offset: MMO_SKILL_DEMO_SHARED_HOT_OFFSETS.y, byteLength: 4 },
      { mask: MMO_SKILL_DEMO_SHARED_HOT_DIRTY_STATE, offset: MMO_SKILL_DEMO_SHARED_HOT_OFFSETS.hp, byteLength: 2 },
      { mask: MMO_SKILL_DEMO_SHARED_HOT_DIRTY_STATE, offset: MMO_SKILL_DEMO_SHARED_HOT_OFFSETS.targetId, byteLength: 4 },
      { mask: MMO_SKILL_DEMO_SHARED_HOT_DIRTY_STATE, offset: MMO_SKILL_DEMO_SHARED_HOT_OFFSETS.action, byteLength: 1 },
      { mask: MMO_SKILL_DEMO_SHARED_HOT_DIRTY_STATE, offset: MMO_SKILL_DEMO_SHARED_HOT_OFFSETS.combatState, byteLength: 1 },
      { mask: MMO_SKILL_DEMO_SHARED_HOT_DIRTY_STATE, offset: MMO_SKILL_DEMO_SHARED_HOT_OFFSETS.statusMask, byteLength: 4 }
    ]
  }) : undefined;
  if (sharedCellReplicator) {
    for (const [key, refs] of volatileHotRefsByCell) {
      const previousBytes = previousCache?.volatileBuffersByCell.get(key);
      const bytes = dirtyCellReplicator
        ? dirtyCellReplicator.encodeCell(refs)
        : !fullVolatile && previousBytes && !dirtyCells.has(key)
          ? previousBytes
          : sharedCellReplicator.encodeCell(refs);
      volatileBuffersByCell.set(key, bytes);
    }
  }
  const staticRecordsByCell = buildPublicStaticCellRecords(runtime, top, staticRecordsByEntity);
  runtime.segmentCache = { tick: state.tick, top, fullVolatile, publicEntityIdsByCell, volatileBuffersByCell, fullVolatileBuffersByCell, volatileHotRefsByCell, sharedCellReplicator, entityCellById, entityTypeById, staticRecordsByEntity, staticRecordsByCell };
  clearMmoSkillDemoDirtyReplication(state);
  return runtime.segmentCache;
}

function fullVolatileBytesForCell(cache: PublicCellSegmentCache, key: string) {
  const cached = cache.fullVolatileBuffersByCell.get(key);
  if (cached) return cached;
  const refs = cache.volatileHotRefsByCell.get(key);
  if (!refs || !cache.sharedCellReplicator) return undefined;
  const bytes = cache.sharedCellReplicator.encodeCell(refs);
  cache.fullVolatileBuffersByCell.set(key, bytes);
  return bytes;
}

const STATIC_DISCOVERY_RECORDS_PER_TICK = 12;

const STATIC_DISCOVERY_CELL_RECORDS_PER_TICK = 9;

const STATIC_ACK_TIMEOUT_MS = 3000;

function staticCursorMap(runtime: ZoneRuntime, playerId: string) {
  let cursors = runtime.staticEntitiesByPlayer.get(playerId);
  if (!cursors) {
    cursors = new Map();
    runtime.staticEntitiesByPlayer.set(playerId, cursors);
  }
  return cursors;
}

function staticQueue(runtime: ZoneRuntime, playerId: string) {
  let queue = runtime.staticDiscoveryQueueByPlayer.get(playerId);
  if (!queue) {
    queue = [];
    runtime.staticDiscoveryQueueByPlayer.set(playerId, queue);
  }
  return queue;
}

function needsStaticDiscovery(runtime: ZoneRuntime, playerId: string, record: Pick<PublicStaticRecord, "entityId" | "signature">, nowMs: number) {
  const cursor = staticCursorMap(runtime, playerId).get(record.entityId);
  if (!cursor) return true;
  if (cursor.signature !== record.signature) return true;
  if (cursor.status === "acked") return false;
  return nowMs - cursor.sentAt >= STATIC_ACK_TIMEOUT_MS;
}

function enqueueStaticDiscovery(runtime: ZoneRuntime, playerId: string, records: readonly PublicStaticRecord[], nowMs: number, tick: number) {
  const queue = staticQueue(runtime, playerId);
  const queued = new Set(queue.map((item) => item.entityId));
  for (const record of records) {
    if (!needsStaticDiscovery(runtime, playerId, record, nowMs) || queued.has(record.entityId)) continue;
    queue.push({ entityId: record.entityId, enqueuedTick: tick });
    queued.add(record.entityId);
  }
}

function recordStaticTtd(runtime: ZoneRuntime, ticks: number) {
  runtime.staticTtdSamples.push(Math.max(0, ticks));
  while (runtime.staticTtdSamples.length > 100) runtime.staticTtdSamples.shift();
}

const STATIC_SEGMENT_TOP: MmoSegmentTopLevel = {
  tick: 0,
  mapRevision: "",
  roomKind: "",
  roomLabel: "",
  activePlayers: 0,
  worldEventId: "",
  worldEventName: "",
  worldEventZoneId: "ashwood",
  worldEventPhase: "",
  worldEventObjective: "",
  worldEventProgress: 0,
  worldEventGoal: 0,
  worldEventTimerMs: 0,
  worldEventReward: ""
};

function staticSegmentForRecord(_top: MmoSegmentTopLevel, record: PublicStaticRecord) {
  return record.segment ?? encodeMmoSkillDemoSegment(record.kind, record.segmentId, createMmoSkillDemoSegmentState(STATIC_SEGMENT_TOP, record.staticEntities ?? { [record.entityId]: record.staticEntity }));
}

function drainStaticDiscovery(
  runtime: ZoneRuntime,
  playerId: string,
  recordsByEntity: Map<string, PublicStaticRecord>,
  fallbackRecordsByEntity: Map<string, PublicStaticRecord>,
  top: MmoSegmentTopLevel,
  nowMs: number,
  tick: number
) {
  const queue = staticQueue(runtime, playerId);
  const segments: ReplicationEnvelopeSegment<MmoSkillDemoSegmentKind>[] = [];
  const nextQueue: StaticDiscoveryQueueItem[] = [];
  const consumed = new Set<string>();
  let cellChunksSent = 0;
  for (const item of queue) {
    const record = recordsByEntity.get(item.entityId) ?? fallbackRecordsByEntity.get(item.entityId);
    if (!record) continue;
    if (!needsStaticDiscovery(runtime, playerId, record, nowMs)) continue;
    const cellChunk = record.entityIds !== undefined;
    const cellChunkAllowed = !cellChunk || cellChunksSent < STATIC_DISCOVERY_CELL_RECORDS_PER_TICK;
    if (segments.length < STATIC_DISCOVERY_RECORDS_PER_TICK && cellChunkAllowed && !consumed.has(item.entityId)) {
      segments.push(staticSegmentForRecord(top, record));
      consumed.add(item.entityId);
      if (cellChunk) cellChunksSent += 1;
      recordStaticTtd(runtime, tick - item.enqueuedTick);
      nextQueue.push(item);
    } else {
      nextQueue.push(item);
    }
  }
  runtime.staticDiscoveryQueueByPlayer.set(playerId, nextQueue);
  return segments;
}

function createPrivateStaticRecord(entity: MmoSkillDemoEntity): PublicStaticRecord {
  const staticEntity = toMmoSkillDemoStaticSegmentEntity(entity);
  return {
    entityId: entity.id,
    cellKey: entitySegmentCellKey(entity),
    kind: "private-static",
    signature: mmoSkillDemoStaticEntitySignature(staticEntity),
    segmentId: `private-static:${entity.id}`,
    staticEntity
  };
}

function staticEntityIdFromSegment(segment: ReplicationEnvelopeSegment) {
  if (segment.kind !== "world-cell-static" && segment.kind !== "private-static") return undefined;
  if (segment.id.startsWith("world-static-cell:")) return `cell:${segment.id.slice("world-static-cell:".length)}`;
  const [, entityId] = segment.id.split(":");
  return entityId;
}

function staticSegmentCellKey(cache: PublicCellSegmentCache, segment: ReplicationEnvelopeSegment) {
  if (segment.kind !== "world-cell-static") return undefined;
  if (segment.id.startsWith("world-static-cell:")) return segment.id.slice("world-static-cell:".length);
  if (!segment.id.startsWith("world-static:")) return undefined;
  return cache.staticRecordsByEntity.get(segment.id.slice("world-static:".length))?.cellKey;
}

function pushFullVolatileRefreshForStaticSegments(
  segments: ReplicationEnvelopeSegment<MmoSkillDemoSegmentKind>[],
  cache: PublicCellSegmentCache,
  staticSegments: readonly ReplicationEnvelopeSegment<MmoSkillDemoSegmentKind>[]
) {
  const refreshed = new Set<string>();
  for (const segment of staticSegments) {
    const cellKey = staticSegmentCellKey(cache, segment);
    if (!cellKey || refreshed.has(cellKey)) continue;
    const bytes = fullVolatileBytesForCell(cache, cellKey) ?? cache.volatileBuffersByCell.get(cellKey);
    if (!bytes) continue;
    segments.push({ id: `cell:${cellKey}:volatile`, kind: "world-cell-volatile", bytes });
    refreshed.add(cellKey);
  }
}

function markStaticSegmentsSent(runtime: ZoneRuntime, playerId: string, sequence: number, segments: readonly ReplicationEnvelopeSegment[] | undefined, nowMs: number) {
  if (!segments?.length) return;
  const cursors = staticCursorMap(runtime, playerId);
  const records: StaticAckRecord[] = [];
  for (const segment of segments) {
    const entityId = staticEntityIdFromSegment(segment);
    if (!entityId) continue;
    const signature = runtime.staticSignatureBySegmentId.get(segment.id) ?? "";
    const previous = cursors.get(entityId);
    const nextSignature = signature || previous?.signature || "";
    cursors.set(entityId, { status: "sent", sentAt: nowMs, signature: nextSignature, sequence });
    records.push({ entityId, signature: nextSignature });
  }
  if (!records.length) return;
  let bySequence = runtime.staticAcksByPlayer.get(playerId);
  if (!bySequence) {
    bySequence = new Map();
    runtime.staticAcksByPlayer.set(playerId, bySequence);
  }
  bySequence.set(sequence, records);
}

function markStaticSegmentsAcked(runtime: ZoneRuntime, playerId: string, sequence: number) {
  const bySequence = runtime.staticAcksByPlayer.get(playerId);
  if (!bySequence) return;
  const cursors = staticCursorMap(runtime, playerId);
  for (const [sentSequence, records] of [...bySequence.entries()]) {
    if (sentSequence > sequence) continue;
    for (const record of records) {
      const cursor = cursors.get(record.entityId);
      if (cursor?.sequence === sentSequence && cursor.signature === record.signature) {
        cursors.set(record.entityId, { ...cursor, status: "acked" });
      }
    }
    bySequence.delete(sentSequence);
  }
}

const SNAPSHOT_COARSE_MAX_ENTITIES = 96;

const SNAPSHOT_COARSE_MAX_HAZARDS = 16;

function rebuildSnapshotCellCache(runtime: ZoneRuntime, state: MmoSkillDemoState) {
  if (runtime.snapshotCellCache?.tick === state.tick) return runtime.snapshotCellCache;
  const publicEntityIdsByCell = new Map<string, string[]>();
  for (const entity of entitiesInState(state)) mutableListBucket(publicEntityIdsByCell, entitySegmentCellKey(entity)).push(entity.id);
  runtime.snapshotCellCache = { tick: state.tick, publicEntityIdsByCell, publicProjectedById: new Map() };
  return runtime.snapshotCellCache;
}

function canCacheSnapshotProjection(entity: MmoSkillDemoEntity) {
  return entity.entityType !== "player" && !(entity.entityType === "loot" && entity.ownerId);
}

function buildCoarseSnapshotForPlayer(ctx: RoomContext<MmoSkillDemoState, MmoSkillDemoInput>, runtime: ZoneRuntime, player: AuthoritativePlayer, actor: PlayerEntity, interestRadius: number) {
  const cache = rebuildSnapshotCellCache(runtime, ctx.state);
  const cellKeys = mmoSkillDemoNeighborCellKeys(actor.x, actor.y);
  const entities: Record<string, MmoSkillDemoEntity> = {};
  const players: Record<string, PlayerEntity> = {};
  const npcs: Record<string, NpcEntity> = {};
  const resources: Record<string, ResourceEntity> = {};
  const loots: Record<string, LootEntity> = {};
  const hazards: Record<string, HazardEntity> = {};
  let count = 0;
  let hazardCount = 0;

  const addProjected = (id: string) => {
    if (entities[id]) return;
    const entity = ctx.state.entities[id];
    if (!entity) return;
    if (id !== player.id && count >= SNAPSHOT_COARSE_MAX_ENTITIES) return;
    if (entity.entityType === "hazard" && hazardCount >= SNAPSHOT_COARSE_MAX_HAZARDS) return;
    let projected = canCacheSnapshotProjection(entity) ? cache.publicProjectedById.get(id) : undefined;
    if (!projected) {
      const next = projectMmoEntityForViewer(entity, player.id);
      if (!next) return;
      projected = sanitizeEntityForReplication(next);
      if (canCacheSnapshotProjection(entity)) cache.publicProjectedById.set(id, projected);
    }
    if (!projected) return;
    entities[id] = projected;
    count += 1;
    if (projected.entityType === "player") players[id] = projected;
    else if (projected.entityType === "npc") npcs[id] = projected;
    else if (projected.entityType === "resource") resources[id] = projected;
    else if (projected.entityType === "loot") loots[id] = projected;
    else if (projected.entityType === "hazard") {
      hazards[id] = projected;
      hazardCount += 1;
    }
  };

  addProjected(player.id);
  for (const key of cellKeys) {
    const ids = cache.publicEntityIdsByCell.get(key);
    if (!ids) continue;
    for (const id of ids) addProjected(id);
  }
  actor.visibleCount = count;
  const snapshot = {
    ...mmoSegmentTopLevel(ctx.state, ctx.players.size),
    effects: selectTransientEffectsForViewer(ctx.state.effects, { x: actor.x, y: actor.y, radius: interestRadius, zoneId: actor.zoneId }, { maxEffects: 64 })
      .map((effect) => sanitizeEffectForReplication(effect)),
    entities,
    players,
    npcs,
    resources,
    loots,
    hazards
  };
  Object.defineProperty(snapshot, PREENCODED_SNAPSHOT_BYTES, {
    enumerable: false,
    value: buildCoarseSnapshotCellBytes(ctx, runtime, player, actor)
  });
  return snapshot;
}

function buildCoarseSnapshotCellBytes(ctx: RoomContext<MmoSkillDemoState, MmoSkillDemoInput>, runtime: ZoneRuntime, player: AuthoritativePlayer, actor: PlayerEntity) {
  const cache = rebuildPublicCellSegments(runtime, ctx.state, ctx.players.size);
  const segments: ReplicationEnvelopeSegment<MmoSkillDemoSegmentKind>[] = [];
  const cellKeys = mmoSkillDemoNeighborCellKeys(actor.x, actor.y);
  for (const key of cellKeys) {
    const volatileBytes = cache.volatileBuffersByCell.get(key);
    if (volatileBytes) segments.push({ id: `cell:${key}:volatile`, kind: "world-cell-volatile", bytes: volatileBytes });
    const record = cache.staticRecordsByCell.get(key);
    if (record?.segment) segments.push(record.segment);
  }
  const actorForViewer = sanitizeEntityForReplication(projectMmoEntityForViewer(actor, player.id) ?? actor);
  segments.push(encodeMmoSkillDemoSegment("private-volatile", `private:${player.id}:volatile`, createMmoSkillDemoSegmentState(cache.top, {
    [actorForViewer.id]: toMmoSkillDemoVolatileSegmentEntity(actorForViewer)
  })));
  return encodeMultipartReplicationEnvelope({ sequence: 0, baseline: 0, segments });
}

function staticDiscoveryTelemetry(runtime: ZoneRuntime, tick: number): StaticDiscoveryTelemetry {
  const queueDepthByClient: Record<string, number> = {};
  let queueDepth = 0;
  let maxBacklogAge = 0;
  for (const [playerId, queue] of runtime.staticDiscoveryQueueByPlayer) {
    queueDepthByClient[playerId] = queue.length;
    queueDepth += queue.length;
    for (const item of queue) maxBacklogAge = Math.max(maxBacklogAge, tick - item.enqueuedTick);
  }
  const avgTTD = runtime.staticTtdSamples.length
    ? runtime.staticTtdSamples.reduce((sum, value) => sum + value, 0) / runtime.staticTtdSamples.length
    : 0;
  return {
    queueDepthByClient,
    queueDepth,
    maxBacklogAge,
    avgTTD,
    samples: runtime.staticTtdSamples.length,
    maxStaticRecordsPerTick: STATIC_DISCOVERY_RECORDS_PER_TICK,
    adaptiveRecommended: queueDepth > 50 || maxBacklogAge > 20
  };
}

function mmoSkillDemoRoomTelemetry(ctx: RoomContext<MmoSkillDemoState, MmoSkillDemoInput>, runtime: ZoneRuntime) {
  const discovery = staticDiscoveryTelemetry(runtime, ctx.state.tick);
  const maxClientQueueDepth = Object.values(discovery.queueDepthByClient).reduce((max, value) => Math.max(max, value), 0);
  const warnings: string[] = [];
  if (maxClientQueueDepth > 50 || discovery.maxBacklogAge > 20) warnings.push("Congestion");
  return {
    replication: {
      discovery: {
        ...discovery,
        maxClientQueueDepth
      },
      adaptive: {
        reduceStaticRecordsHookAvailable: true,
        discoveryBacklogRecommended: discovery.adaptiveRecommended,
        staticDeferral: runtime.replicationAdaptive,
        reason: runtime.replicationAdaptive?.reason || (discovery.adaptiveRecommended ? "Static discovery backlog is above target" : "")
      }
    },
    warnings
  };
}

function entityViewsForSnapshot(entities: Record<string, MmoSkillDemoEntity>): MmoSkillDemoEntityViews {
  const views: MmoSkillDemoEntityViews = { players: {}, npcs: {}, resources: {}, loots: {}, hazards: {} };
  for (const [id, entity] of Object.entries(entities)) {
    if (entity.entityType === "player") views.players[id] = entity;
    else if (entity.entityType === "npc") views.npcs[id] = entity;
    else if (entity.entityType === "resource") views.resources[id] = entity;
    else if (entity.entityType === "loot") views.loots[id] = entity;
    else views.hazards[id] = entity;
  }
  return views;
}

function buildMmoSkillDemoSnapshotForPlayer(ctx: RoomContext<MmoSkillDemoState, MmoSkillDemoInput>, runtime: ZoneRuntime, player: AuthoritativePlayer) {
  const actor = ctx.state.players[player.id];
  if (!actor) return sanitizeMmoReplicationSnapshot(ctx.state);
  const interestRadius = ctx.state.roomKind === "dungeon-instance" ? (actor.activeAbility === "space-rush" ? 1100 : 820) : actor.activeAbility === "space-rush" ? 1100 : 720;
  if (MMO_SKILL_DEMO_COARSE_SNAPSHOT_AOI_ENABLED) return buildCoarseSnapshotForPlayer(ctx, runtime, player, actor, interestRadius);
  const visibility = runtime.grid.computeVisibility(player.id, {
    x: actor.x,
    y: actor.y,
    radius: interestRadius
  });
  const visible = selectVisibleEntityBuckets<MmoSkillDemoEntity, MmoSkillDemoEntityKind>({
    source: ctx.state.entities,
    ids: visibility.visible,
    includeIds: [player.id],
    bucketNames: MMO_SKILL_DEMO_ENTITY_BUCKETS,
    bucketFor: (entity) => entity.entityType,
    project: (entity) => projectMmoEntityForViewer(entity, player.id)
  });
  actor.visibleCount = visible.count;
  const entityViews = entityViewsForSnapshot(visible.entities);
  return sanitizeMmoReplicationSnapshot({
    ...mmoSegmentTopLevel(ctx.state, ctx.players.size),
    effects: selectTransientEffectsForViewer(ctx.state.effects, { x: actor.x, y: actor.y, radius: interestRadius, zoneId: actor.zoneId }, { maxEffects: 64 }),
    entities: visible.entities,
    ...entityViews
  });
}

function buildMmoSkillDemoMultipartReplication(
  ctx: RoomContext<MmoSkillDemoState, MmoSkillDemoInput>,
  runtime: ZoneRuntime,
  player: AuthoritativePlayer,
  request: RoomReplicationRequest<MmoSkillDemoState>
) {
  const actor = ctx.state.players[player.id];
  if (!actor) return buildMmoSkillDemoSnapshotForPlayer(ctx, runtime, player);
  const cache = rebuildPublicCellSegments(runtime, ctx.state, ctx.players.size, request.kind === "snapshot");
  const cellKeys = mmoSkillDemoNeighborCellKeys(actor.x, actor.y);
  const trackVolatileCells = MMO_SKILL_DEMO_SHARED_DIRTY_SLAB_ENABLED;
  let previousVolatileCells: Set<string> | undefined;
  if (trackVolatileCells) {
    previousVolatileCells = runtime.volatileCellsByPlayer.get(player.id);
    if (!previousVolatileCells) {
      previousVolatileCells = new Set();
      runtime.volatileCellsByPlayer.set(player.id, previousVolatileCells);
    }
  }
  const cellKeySet = new Set(cellKeys);
  const segments: ReplicationEnvelopeSegment<MmoSkillDemoSegmentKind>[] = [];
  const privateVolatile: Record<string, ReturnType<typeof toMmoSkillDemoVolatileSegmentEntity>> = {};
  const recordsByEntity = new Map<string, PublicStaticRecord>();
  const publicStaticRecords: PublicStaticRecord[] = [];
  const privateStaticRecords: PublicStaticRecord[] = [];
  const interestRadius = ctx.state.roomKind === "dungeon-instance" ? (actor.activeAbility === "space-rush" ? 1100 : 820) : actor.activeAbility === "space-rush" ? 1100 : 720;

  for (const key of cellKeys) {
    const needsFullVolatile = trackVolatileCells && (request.kind === "snapshot" || !previousVolatileCells?.has(key));
    const volatileBytes = needsFullVolatile && !cache.fullVolatile ? fullVolatileBytesForCell(cache, key) : cache.volatileBuffersByCell.get(key);
    if (volatileBytes) segments.push({ id: `cell:${key}:volatile`, kind: "world-cell-volatile", bytes: volatileBytes });
    const entityIds = cache.publicEntityIdsByCell.get(key);
    if (!entityIds) continue;
    const record = cache.staticRecordsByCell.get(key);
    if (record) {
      publicStaticRecords.push(record);
      recordsByEntity.set(record.entityId, record);
    }
    for (const entityId of entityIds) {
      if (entityId === player.id || cache.entityTypeById.get(entityId) !== "player") continue;
      const playerRecord = cache.staticRecordsByEntity.get(entityId);
      if (playerRecord) {
        publicStaticRecords.push(playerRecord);
        recordsByEntity.set(playerRecord.entityId, playerRecord);
      }
    }
  }
  if (previousVolatileCells) {
    previousVolatileCells.clear();
    for (const key of cellKeys) previousVolatileCells.add(key);
  }

  const actorForViewer = sanitizeEntityForReplication(projectMmoEntityForViewer(actor, player.id) ?? actor);
  actorForViewer.visibleCount = cellKeys.reduce((count, key) => count + (cache.publicEntityIdsByCell.get(key)?.length ?? 0), 0);
  privateVolatile[actorForViewer.id] = toMmoSkillDemoVolatileSegmentEntity(actorForViewer);
  privateStaticRecords.push(createPrivateStaticRecord(actorForViewer));

  for (const entity of entitiesOfType(ctx.state, "loot")) {
    if (entity.entityType !== "loot" || entity.ownerId !== player.id || !cellKeySet.has(entitySegmentCellKey(entity))) continue;
    const projected = sanitizeEntityForReplication(entity);
    privateVolatile[projected.id] = toMmoSkillDemoVolatileSegmentEntity(projected);
    privateStaticRecords.push(createPrivateStaticRecord(projected));
  }

  segments.push(encodeMmoSkillDemoSegment("private-volatile", `private:${player.id}:volatile`, createMmoSkillDemoSegmentState(cache.top, privateVolatile)));
  for (const record of privateStaticRecords) {
    runtime.staticSignatureBySegmentId.set(record.segmentId, record.signature);
    recordsByEntity.set(record.entityId, record);
  }
  enqueueStaticDiscovery(runtime, player.id, privateStaticRecords, request.now, ctx.state.tick);
  enqueueStaticDiscovery(runtime, player.id, publicStaticRecords, request.now, ctx.state.tick);

  const effects = selectTransientEffectsForViewer(ctx.state.effects, { x: actor.x, y: actor.y, radius: interestRadius, zoneId: actor.zoneId }, { maxEffects: 64 })
    .map((effect) => sanitizeEffectForReplication(effect));
  segments.push(encodeMmoSkillDemoSegment("transient", `transient:${ctx.state.tick}`, createMmoSkillDemoSegmentState(cache.top, {}, effects)));
  const staticSegments = drainStaticDiscovery(runtime, player.id, recordsByEntity, cache.staticRecordsByEntity, cache.top, request.now, ctx.state.tick);
  segments.push(...staticSegments);
  pushFullVolatileRefreshForStaticSegments(segments, cache, staticSegments);

  return {
    state: ctx.state,
    segments
  };
}

export {
  SNAPSHOT_COARSE_MAX_ENTITIES,
  SNAPSHOT_COARSE_MAX_HAZARDS,
  STATIC_ACK_TIMEOUT_MS,
  STATIC_DISCOVERY_CELL_RECORDS_PER_TICK,
  STATIC_DISCOVERY_RECORDS_PER_TICK,
  STATIC_SEGMENT_TOP,
  addPublicCellSegmentRecord,
  buildCoarseSnapshotCellBytes,
  buildCoarseSnapshotForPlayer,
  buildMmoSkillDemoMultipartReplication,
  buildMmoSkillDemoSnapshotForPlayer,
  buildPublicStaticCellRecords,
  canCacheSnapshotProjection,
  compactPublicCellStaticEntity,
  createPrivateStaticRecord,
  drainStaticDiscovery,
  enqueueStaticDiscovery,
  entitySegmentCellKey,
  fillPublicCellSegmentsFromSharedSlots,
  fullVolatileBytesForCell,
  markStaticSegmentsAcked,
  markStaticSegmentsSent,
  mmoSegmentTopLevel,
  mmoSkillDemoRoomTelemetry,
  mutableListBucket,
  needsStaticDiscovery,
  pushFullVolatileRefreshForStaticSegments,
  rebuildPublicCellSegments,
  rebuildSnapshotCellCache,
  recordStaticTtd,
  sharedHotCellKeyForSlot,
  sharedHotSlotByteOffset,
  staticCursorMap,
  staticDiscoveryTelemetry,
  staticEntityIdFromSegment,
  staticQueue,
  staticSegmentCellKey,
  staticSegmentForRecord
};

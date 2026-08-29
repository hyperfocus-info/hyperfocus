import { type CollisionKernel } from "@hyperfocus/engine";
import { type InterestEntity, type InterestIndex, type SpatialHashIndex, type RoomReplicationTelemetry } from "@hyperfocus/engine/server";
import { type ReplicationEnvelopeSegment } from "@hyperfocus/engine/protocol";
import { type MmoSkillDemoSegmentKind } from "./segmented-replication.ts";
import { type HazardEntity, type LogicSpatialEntity, type LootEntity, type NpcEntity, type PlayerStaticEntityCursor, type PublicCellSegmentCache, type RuntimeInput, type SnapshotCellCache, type StaticAckRecord, type StaticDiscoveryQueueItem } from "./shared-contracts.ts";

type ZoneRuntime = {
  grid: InterestIndex;
  interestIds: Set<string>;
  nextInterestIds: Set<string>;
  interestCache: Map<string, InterestEntity>;
  interestScratch: InterestEntity;
  logicHash: SpatialHashIndex<LogicSpatialEntity>;
  logicIds: Set<string>;
  nextLogicIds: Set<string>;
  logicScratch: LogicSpatialEntity[];
  segmentCache?: PublicCellSegmentCache;
  snapshotCellCache?: SnapshotCellCache;
  staticEntitiesByPlayer: Map<string, Map<string, PlayerStaticEntityCursor>>;
  staticDiscoveryQueueByPlayer: Map<string, StaticDiscoveryQueueItem[]>;
  staticAcksByPlayer: Map<string, Map<number, StaticAckRecord[]>>;
  staticSignatureBySegmentId: Map<string, string>;
  staticCellSegmentsBySignature: Map<string, ReplicationEnvelopeSegment<MmoSkillDemoSegmentKind>>;
  volatileCellsByPlayer: Map<string, Set<string>>;
  staticTtdSamples: number[];
  replicationAdaptive?: RoomReplicationTelemetry["adaptive"];
  inputs: Map<string, RuntimeInput>;
  kernel: Promise<CollisionKernel>;
};

const updateNpcScratch: NpcEntity[] = [];

const updateHazardScratch: HazardEntity[] = [];

const updateLootScratch: LootEntity[] = [];

export {
  updateHazardScratch,
  updateLootScratch,
  updateNpcScratch
};

export type {
  ZoneRuntime
};

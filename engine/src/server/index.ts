export { createAuthoritativeServer, type AuthoritativeServer, type AuthoritativeServerOptions } from "./server.ts";
export { createMemoryAccountBackend, type AccountBackend, type AccountRecord } from "./accounts.ts";
export { createServerClock, type ServerClock, type ServerClockBacklogPolicy, type ServerClockOptions, type ServerClockStats, type ServerClockTick } from "./clock.ts";
export { createSqlitePersistenceAdapter, type SqlitePersistenceAdapterOptions } from "./database.ts";
export { createFleetManager, type FleetManager, type FleetNode, type FleetPlacement } from "./fleet.ts";
export {
  createHttpCapacityActuator,
  createDeploymentControlPlaneHandler,
  createHttpKeyManager,
  createHttpPersistenceAdapter,
  createHttpRegionCoordinator,
  createHttpSessionReplayStore,
  createRegionalAutoscaler,
  validateOnCallRoster,
  type DeploymentFetch,
  type DeploymentControlPlaneOptions,
  type DeploymentHttpOptions,
  type DeploymentKeyRing,
  type OnCallOperator,
  type OnCallRoster,
  type RegionalCapacitySample,
  type RegionalScaleDecision,
  type RegionalScalingPolicy,
  type RegionCoordinatorBackend,
} from "./deployment.ts";
export { createRoomType, createZoneType } from "./room-type.ts";
export { createAuthoritativeRoom, type AuthoritativeRoom } from "./room.ts";
export { createInterestGrid, type InterestGridOptions, type InterestIndex, type InterestEntity, type VisibilityResult } from "./interest-grid.ts";
export {
  createMmo1000Preset,
  createMmoInterestGrid,
  type MmoAdmissionSelection,
  type MmoAdmissionOptions,
  type MmoScalePreset
} from "./scaling.ts";
export { createPresenceIndex, type PresenceIndex } from "./presence-index.ts";
export { createServerPhysicsWorld, type PhysicsBody, type PhysicsContact, type ServerPhysicsWorld } from "./physics.ts";
export {
  SignedSessionAuthority,
  createEncryptedPortablePersistenceBackup,
  createGracefulDrainController,
  createPortableMemoryPersistenceAdapter,
  createPortablePersistenceBackup,
  createServerOperations,
  decryptPortableBackup,
  encryptPortableBackup,
  restoreEncryptedPortablePersistenceBackup,
  restorePortablePersistenceBackup,
  type BackupEncryptionKey,
  type EncryptedBackupOptions,
  type GracefulDrainController,
  type GracefulDrainState,
  type GracefulShutdownEvidence,
  type IssueSessionOptions,
  type PortableJson,
  type PortablePersistenceAdapter,
  type PortablePersistenceBackupOptions,
  type PortablePersistenceLimits,
  type PortablePersistenceSnapshot,
  type ServerOperations,
  type ServerOperationsHealth,
  type ServerOperationsOptions,
  type SessionSigningKey,
  type SessionReplayConsumeResult,
  type SessionReplayStore,
  type SignedSessionAuthorityOptions,
  type SignedSessionIdentity,
} from "./operations.ts";
export {
  createSpatialHash,
  type SpatialHashCell,
  type SpatialHashEntity,
  type SpatialHashId,
  type SpatialHashIndex,
  type SpatialHashMutation,
  type SpatialHashOptions,
  type SpatialHashQuery
} from "./spatial-hash.ts";
export {
  createEntityReplicator,
  createSharedCellReplicator,
  createSharedEntityReplicationSegment,
  SHARED_CELL_SLAB_HEADER_BYTES,
  SHARED_CELL_SLAB_RECORD_BYTES,
  SHARED_CELL_SLAB_VERSION,
  applyReplicationDelta,
  type EntityReplicator,
  type EntityReplicatorOptions,
  type ReplicationMetrics,
  type ReplicationMetricsSample,
  type ReplicationPacket,
  type SharedCellReplicationEntity,
  type SharedCellReplicator,
  type SharedCellReplicatorOptions,
  type SharedReplicationEnvelopeSegment,
  type SharedReplicationSegmentSource
} from "./replicator.ts";
export {
  selectVisibleEntityBuckets,
  type VisibleEntityBucketOptions,
  type VisibleEntityBucketResult
} from "./visibility-snapshot.ts";
export {
  selectTransientEffectsForViewer,
  spawnTransientEffect,
  transientEffectSchemaFields,
  updateTransientEffects,
  type CompactTransientEffect,
  type TransientEffectSelectOptions,
  type TransientEffectSpawn,
  type TransientEffectTarget
} from "./transient-effects.ts";
export { createPersistenceAdapter } from "./persistence.ts";
export {
  createMmoGameplayServices,
  type ChatMessage,
  type EconomyAccount,
  type GuildRecord,
  type InventoryItem,
  type MmoGameplayServices,
  type ModerationAction
} from "./services.ts";
export {
  createDurableMmoServices,
  createDurableServiceAuthAdapter,
  createDurableServiceBackup,
  createMemoryDurableServiceStore,
  restoreDurableServiceBackup,
  validateDurableStoreRecord,
  type DurableAuditRecord,
  type DurableBalance,
  type DurableChatMessage,
  type DurableGuild,
  type DurableGuildMember,
  type DurableInventoryItem,
  type DurableJson,
  type DurableMmoServiceOptions,
  type DurableMmoServices,
  type DurableModerationAction,
  type DurablePage,
  type DurableServiceStore,
  type DurableServiceTransaction,
  type DurableStoreRecord,
  type DurableStoreScan,
  type MatchmakingTicket,
} from "./durable-services.ts";
export {
  createSqliteDurableServiceStore,
  type SqliteDurableServiceStoreOptions,
} from "./durable-services-sqlite.ts";
export { createDevAuthAdapter } from "./auth.ts";
export { createServerMetrics, type ServerMetricKind, type ServerMetricSummary, type ServerMetrics, type ServerMetricsDiagnostics, type ServerMetricsOptions } from "./metrics.ts";
export {
  createHttpShardHandoffTransport,
  createShardRouter,
  type ShardHandoffFetch,
  type ShardHandoffRequest,
  type ShardHandoffResult,
  type ShardHandoffTransport,
  type ShardRouter,
  type ShardRouterOptions,
  type ShardZone
} from "./shard-router.ts";
export {
  createWorkerRoomEvent,
  createWorkerRoomHost,
  createWorkerRoomInlineUrl,
  WORKER_ROOM_ENTRY_SCRIPT,
  type WorkerRoomEvent,
  type WorkerRoomHost,
  type WorkerRoomHostOptions,
  type WorkerRoomMessageEvent,
  type WorkerRoomWorkerConstructor,
  type WorkerRoomWorkerLike,
  type WorkerRoomWorkerOptions
} from "./worker-room.ts";
export {
  createWorldRouter,
  type WorldRouter,
  type WorldRouterRoom,
  type WorldTransferResult
} from "./router.ts";
export { createWebSocketAuthoritativeServer } from "./transport/websocket.ts";
export {
  createWebTransportMessageAdapter,
  createWebTransportWelcome,
  type WebTransportLikeDatagrams,
  type WebTransportLikeSession,
  type WebTransportMessageAdapter
} from "./transport/webtransport.ts";
export type {
  AuthAdapter,
  AuthResult,
  AuthoritativePlayer,
  JoinDecision,
  MetricsSink,
  PersistenceAdapter,
  RoomContext,
  RoomReplicationKind,
  RoomReplicationOptions,
  RoomReplicationPayload,
  RoomReplicationReceipt,
  RoomReplicationRequest,
  RoomReplicationAdaptiveTelemetry,
  RoomReplicationTelemetry,
  RoomTelemetry,
  RoomType,
  ServerLogger
} from "./types.ts";

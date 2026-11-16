export { createAuthoritativeServer, type AuthoritativeServer, type AuthoritativeServerOptions, type JoinRoomResult } from "./server.ts";
export { createMemoryAccountBackend, type AccountBackend, type AccountRecord } from "./services/accounts.ts";
export { createServerClock, type ServerClock, type ServerClockBacklogPolicy, type ServerClockOptions, type ServerClockStats, type ServerClockTick } from "./core/clock.ts";
export { createSqlitePersistenceAdapter, type SqlitePersistenceAdapter, type SqlitePersistenceAdapterOptions } from "./services/database.ts";
export { createFleetManager, type FleetManager, type FleetNode, type FleetPlacement } from "./routing/fleet.ts";
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
} from "./operations/deployment.ts";
export { createProjectedRoomType, createRoomType, createZoneType } from "./core/room-type.ts";
export { createAuthoritativeRoom, type AuthoritativeRoom } from "./core/room.ts";
export { createInterestGrid, type InterestGridOptions, type InterestIndex, type InterestEntity, type VisibilityResult } from "./interest-grid.ts";
export {
  createMmo1000Preset,
  createMmoInterestGrid,
  type MmoAdmissionSelection,
  type MmoAdmissionOptions,
  type MmoScalePreset
} from "./replication/scaling.ts";
export { createPresenceIndex, type PresenceIndex } from "./core/presence-index.ts";
export { createServerPhysicsWorld, type PhysicsBody, type PhysicsContact, type ServerPhysicsWorld } from "./core/physics.ts";
export {
  SignedSessionAuthority,
  createSignedSessionAuthority,
  createEncryptedPortablePersistenceBackup,
  createGracefulDrainController,
  createPortableMemoryPersistenceAdapter,
  createPortablePersistenceBackup,
  createServerOperations,
  decryptPortableBackup,
  encryptPortableBackup,
  normalizePortablePersistenceRecord,
  restoreEncryptedPortablePersistenceBackup,
  restorePortablePersistenceBackup,
  validatePortablePersistenceSnapshot,
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
} from "./operations/operations.ts";
export {
  createSpatialHash,
  type SpatialHashCell,
  type SpatialHashEntity,
  type SpatialHashId,
  type SpatialHashIndex,
  type SpatialHashMutation,
  type SpatialHashOptions,
  type SpatialHashQuery
} from "./replication/spatial-hash.ts";
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
} from "./replication/replicator.ts";
export {
  selectVisibleEntityBuckets,
  type VisibleEntityBucketOptions,
  type VisibleEntityBucketResult
} from "./replication/visibility-snapshot.ts";
export {
  selectTransientEffectsForViewer,
  spawnTransientEffect,
  transientEffectSchemaFields,
  updateTransientEffects,
  type CompactTransientEffect,
  type TransientEffectSelectOptions,
  type TransientEffectSpawn,
  type TransientEffectTarget
} from "./replication/transient-effects.ts";
export { createPersistenceAdapter } from "./services/persistence.ts";
export {
  createMmoGameplayServices,
  type ChatMessage,
  type EconomyAccount,
  type GuildRecord,
  type InventoryItem,
  type MmoGameplayServices,
  type ModerationAction
} from "./services/services.ts";
export {
  createDurableMmoServices,
  createDurableServiceAuthAdapter,
  createDurableServiceBackup,
  createMemoryDurableServiceStore,
  restoreDurableServiceBackup,
  validateDurableServiceRecords,
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
} from "./services/durable-services.ts";
export {
  createSqliteDurableServiceStore,
  type SqliteDurableServiceStoreOptions,
} from "./services/durable-services-sqlite.ts";
export { createDevAuthAdapter } from "./core/auth.ts";
export { createServerMetrics, type ServerMetricKind, type ServerMetricSummary, type ServerMetrics, type ServerMetricsDiagnostics, type ServerMetricsOptions } from "./operations/metrics.ts";
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
} from "./routing/shard-router.ts";
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
} from "./routing/worker-room.ts";
export {
  createWorldRouter,
  type WorldRouter,
  type WorldRouterRoom,
  type WorldTransferResult
} from "./routing/router.ts";
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
  RoomBroadcast,
  RoomBroadcastDurability,
  RoomBroadcastOptions,
  RoomReplicationKind,
  RoomReplicationOptions,
  RoomReplicationPayload,
  RoomReplicationReceipt,
  RoomReplicationRequest,
  RoomReplicationAdaptiveTelemetry,
  RoomReplicationTelemetry,
  RoomTelemetry,
  RoomType,
  RoomTypeDefinition,
  ServerLogger
} from "./core/types.ts";
export { createCombatRelayRoom, type ConfirmedCombatFrames } from './combat-room/room.ts';

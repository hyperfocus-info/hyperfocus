export { createObjectPool } from "./runtime/object-pool.ts";
export { createFrameWorkPolicy, type FrameWorkJob } from './runtime/frame-work-policy.ts';
export { createSimulationBatch, type SimulationTrial, type SimulationTrialOutcome } from './runtime/simulation-batch.ts';
export {
  createRetainedCursor,
  type RetainedCursor,
  type RetainedCursorOptions,
  type RetainedCursorOverflow,
  type RetainedCursorView
} from "./runtime/retained-cursor.ts";
export { createStage, type StageEntity, type StageOptions } from "./runtime/stage.ts";
export { addFlags, createBitEnum, createFlags, displayFlags, hasAllFlags, hasAnyFlag, hasFlag, subtractFlags } from "./core/flags.ts";
export { createSeedableRandom, deriveSeed, hashSeed, type SeedableRandom, type SeedableRandomSnapshot, type SeedPathPart } from "./core/random.ts";
export { truncateUtf8, utf8ByteLength } from "./core/text.ts";
export {
  createSharedMemoryPool,
  defineSharedSchema,
  sharedEntityBytes,
  SharedMemoryPool,
  SHARED_CACHE_LINE_BYTE_SIZE,
  SHARED_MEMORY_HEADER_BYTES,
  SHARED_MEMORY_HEADER_BYTE_SIZE,
  type SharedEntity,
  type SharedEntityByteRead,
  type SharedEntityHandle,
  type SharedFieldValue,
  type SharedFieldType,
  type SharedFieldColumn,
  type SharedMemoryConsistentRead,
  type SharedMemoryPoolOptions,
  type SharedMemoryReadOptions,
  type SharedPrimitiveFieldType,
  type SharedSchema,
  type SharedSchemaDefinition,
  type SharedSchemaField
} from "./core/schema.ts";
export {
  clamp,
  rectsOverlap,
  testOverlapRect,
  testOverlapCircle,
  pointInRect,
  circleRectOverlap,
  findNearestRadiusCandidate,
  forEachRadiusCandidate,
  vecDistance,
  vecAngle,
  vecNormalize,
  queryRadiusCandidates,
  rayIntersectMap,
  rayIntersectRect,
  type CircleLike,
  type RadiusCandidateEntity,
  type RadiusCandidateHit,
  type RadiusCandidatePoint,
  type RadiusCandidateQueryOptions,
  type RadiusCandidateVisit,
  type RayBox,
  type RectLike,
  type Vec2
} from "./math/collision.ts";
export {
  aabbsOverlap,
  createAabb,
  createCollisionBroadphase,
  normalizeAabb,
  type CollisionAabb,
  type CollisionBroadphaseEntry,
  type CollisionBroadphaseId,
  type CollisionBroadphaseOptions,
  type CollisionBroadphasePair,
  type CollisionBroadphasePairVisitor,
  type CollisionBroadphaseStrategy
} from "./math/broadphase.ts";
export {
  createFixedGridSpatialIndex,
  type FixedGridSpatialIndex,
  type FixedGridSpatialIndexOptions,
  type FixedGridSpatialItem,
  type FixedGridSpatialQuery
} from "./math/fixed-grid.ts";
export { gridKey, inBounds, sameCell, opposite } from "./math/grid.ts";

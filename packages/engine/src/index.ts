export {
  createAnimationClip,
  createAnimationPlayer,
  createAtlasClip,
  animationApiProfileNames,
  animationApiProfiles,
  type AnimationApiExposure,
  type AnimationApiProfile,
  type AnimationApiProfileName,
  type AnimationApiProof,
  type AnimationApiStatus,
  type AnimationClip,
  type AnimationFrameRef,
  type AnimationPlaybackOptions,
  type AnimationPlayer,
  type AnimationState,
  type AtlasClip,
  type AtlasClipOptions
} from "./animation.ts";
export {
  createFixedStepDriver,
  createFixedStepLoop,
  type FixedStepAdvanceOptions,
  type FixedStepAdvanceResult,
  type FixedStepDriverOptions,
  type FixedStepFrame,
  type FixedStepLoopOptions
} from "./runtime/loop.ts";
export { createBrowserApp, type BrowserApp, type BrowserAppContext, type BrowserAppOptions } from "./runtime/browser-app.ts";
export {
  createFrameMetrics,
  type FrameMetrics,
  type FrameMetricsOptions,
  type FrameMetricsSnapshot,
  type LongFrameRecord,
  type MetricSummary
} from "./runtime/frame-metrics.ts";
export { createObjectPool, type ObjectPoolSnapshot } from "./runtime/object-pool.ts";
export { createStage, type StageEntity, type StageSnapshot } from "./runtime/stage.ts";
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
  createTextureAtlas,
  createTexturePackerAtlas,
  parseTexturePackerAtlas,
  atlasApiProfileNames,
  atlasApiProfiles,
  type AtlasApiExposure,
  type AtlasApiProfile,
  type AtlasApiProfileName,
  type AtlasApiProof,
  type AtlasApiStatus,
  type AtlasFrame,
  type TextureAtlas,
  type TextureAtlasFrame,
  type TextureAtlasMetadata,
  type TextureAtlasOptions,
  type TextureAtlasJson,
  type TexturePackerAtlas,
  type TexturePackerAtlasFrame,
  type TexturePackerAtlasMetadata,
  type TexturePackerAtlasOptions,
  type TexturePackerAtlasJson,
  type TexturePackerFrameData,
  type TexturePackerFrameRecord,
  type TexturePackerMeta,
  type TexturePackerPivot,
  type TexturePackerRect,
  type TexturePackerSize
} from "./atlas.ts";
export {
  createAtlasAnimation,
  type AtlasAnimation,
  type AtlasAnimationFrame,
  type AtlasAnimationFrameRef,
  type AtlasAnimationOptions
} from "./canvas/animation.ts";
export {
  createKeyboardActions,
  type KeyboardActionOptions,
  type KeyboardBindings,
  type KeyboardState
} from "./input/keyboard.ts";
export {
  GAMEPAD_AXIS_DEADZONE,
  createGamepadActionFrameMapper,
  createGamepadSession,
  createGamepadPoller,
  updateGamepads,
  getGamepads,
  getGamepad,
  isGamepadButtonDown,
  isGamepadButtonPressed,
  isGamepadButtonReleased,
  getGamepadAxis,
  type GamepadActionButtonBinding,
  type GamepadActionButtonLike,
  type GamepadActionFrame,
  type GamepadActionFrameMapper,
  type GamepadActionFrameMapperConfig,
  type GamepadActionFrameOptions,
  type GamepadActionGamepadLike,
  type GamepadActionVector,
  type GamepadPollerOptions,
  type GamepadSessionOptions,
  type GamepadSessionSnapshot
} from "./input/gamepad.ts";
export {
  canvasPointFromClient,
  createPointerInput,
  createTouchClusterTracker,
  type CanvasPoint,
  type TouchClusterPoint,
  type TouchClusterSnapshot
} from "./input/pointer.ts";
export { createCanvasObjectEvents } from "./input/delegation.ts";
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
  type CollisionBroadphasePairVisitor
} from "./math/broadphase.ts";
export {
  createFixedGridSpatialIndex,
  type FixedGridSpatialIndex,
  type FixedGridSpatialIndexOptions,
  type FixedGridSpatialItem,
  type FixedGridSpatialQuery
} from "./math/fixed-grid.ts";
export { gridKey, inBounds, sameCell, opposite } from "./math/grid.ts";
export {
  createCollisionKernel,
  resolveCollisionKernelWasmUrl,
  testCircleRectOverlap,
  type CollisionKernel,
  type CollisionKernelBackend,
  type CollisionKernelFallbackDiagnostic,
  type CollisionKernelFallbackReason,
  type CollisionKernelOptions,
  type CollisionKernelWasmUrlOptions,
  type ResidentCircleRectBatch
} from "./wasm/collision-kernel.ts";
export {
  type CircleRectBatch,
  type MovementBatch,
  type RangeFilterBatch,
  type RectRectBatch,
  type RotationBatch
} from "./types.ts";
export {
  createCamera,
  type Camera,
  type CameraBounds,
  type CameraOptions,
  type CameraState,
  type CameraTarget,
  type FollowOptions,
  type Point
} from "./canvas/camera.ts";
export {
  init,
  requireCanvas2dContext,
  type CanvasContextType,
  type InitApp,
  type InitOptions,
  type ScaleMode
} from "./canvas/bootstrap.ts";
export {
  drawCircle,
  drawLine,
  drawPolygon,
  drawPolygonFlat,
  drawRect,
  drawSprite,
  drawSpriteBatch,
  drawSpriteSlice,
  createSpriteBatchFrames,
  getSprite,
  popTransform,
  pushTransform,
  registerSprite,
  setDrawContext,
  unregisterSprite,
  type Anchor,
  type LineOptions,
  type SpriteAsset,
  type SpriteBatchEntry,
  type SpriteBatchFrame,
  type SpriteBatchFrameGridOptions,
  type SpriteBatchFrames,
  type SpriteBatchOptions,
  type SpriteBatchResult,
  type SpriteOptions,
  type SpriteSliceOptions,
  type StrokeFillOptions,
  type TransformOptions
} from "./canvas/drawing.ts";
export {
  drawText,
  loadFont,
  measureText,
  registerFont,
  textReady,
  type FontOptions,
  type TextOptions
} from "./canvas/text.ts";
export {
  createPostProcessStack,
  srgbByteToLinearByte,
  linearByteToSrgbByte,
  getPostProcessEffectCost,
  summarizePostProcessCost,
  checkPostProcessBudget,
  postProcessApiProfileNames,
  postProcessApiProfiles,
  postProcessCosts,
  grayscale,
  invert,
  brightness,
  contrast,
  sepia,
  threshold,
  tint,
  posterize,
  gamma,
  colorGrading,
  filmGrain,
  digitalNoise,
  retroDithering,
  vignette,
  screenShake,
  crtScanlines,
  colorLut,
  type PostProcessBudget,
  type PostProcessBudgetReport,
  type PostProcessContext,
  type PostProcessApiProfile,
  type PostProcessApiProfileName,
  type PostProcessApiProof,
  type PostProcessApiPromotion,
  type PostProcessApiStatus,
  type PostProcessApiExposure,
  type PostProcessCostTier,
  type PostProcessEffect,
  type PostProcessEffectCost,
  type PostProcessStack,
  type PostProcessStackOptions
} from "./canvas/post-processing.ts";
export {
  createTileset,
  type TileDefinition,
  type TileId,
  type TileMetadataInput,
  type TileSourceRect,
  type Tileset,
  type TilesetImage,
  type TilesetOptions
} from "./map/tileset.ts";
export {
  createTileMap,
  getTileAt,
  tileToWorld,
  worldToTile,
  type CompactTileLegend,
  type CompactTileRow,
  type TileAnchor,
  type TileLayer,
  type TileLayerSpec,
  type TileMap,
  type TileMapCell,
  type TileMapMarker,
  type TileMapOptions,
  type TileValue
} from "./map/tile-map.ts";
export {
  generateTileMap,
  seededRandom,
  type GenerateTileMapOptions,
  type SeededRandom,
  type TileMapAnchorSpec,
  type TileMapChunkGrid,
  type TileMapGeneratorRule
} from "./map/generator.ts";
export {
  createStaticRectCollisionIndex,
  extractCollisionRects,
  type CollisionExtractionOptions,
  type StaticRectCollisionIndex,
  type StaticRectCollisionIndexOptions,
  type StaticRectCollisionIndexStrategy,
  type StaticRectCollisionTest,
  type TileCollisionPredicate
} from "./map/collision.ts";
export { renderTileLayer, type RenderTileLayerOptions, type RenderTileLayerResult } from "./map/render.ts";
export {
  GameMap,
  createGameMap,
  type GameMapDrawData,
  type GameMapMode,
  type GameMapShape,
  type GameMapState,
  type MapBorderStyle,
  type MapCompassCorner,
  type MapCompassOptions,
  type MapLegendItem,
  type MapLegendLayout,
  type MapLegendStyle,
  type MapMarker,
  type MapOptions,
  type MapPointerInputState,
  type MapRoute,
  type MapRouteGradient,
  type MapWorldBounds,
  type ZoneLabel
} from "./map/game-map.ts";
export {
  buildRegionAnchorSpecs,
  buildRegionNpcMarkers,
  buildRegionTiles,
  createRegionConfig,
  regionMapHeight,
  regionMapWidth,
  resolveRegionAnchors,
  resolveRegionNpcs,
  zoneForRegionTile,
  type RegionAnchorFootprint,
  type RegionAnchorStamp,
  type RegionAnchorConfig,
  type RegionChunkGrid,
  type RegionConfig,
  type RegionCoastSpec,
  type RegionChunkScatter,
  type RegionChunkScatterContext,
  type RegionNpcManifestEntry,
  type RegionPoint,
  type RegionPointGroup,
  type RegionPortConfig,
  type RegionQuestManifestEntry,
  type RegionRiverSpec,
  type RegionTileBuildContext,
  type RegionTileIds,
  type RegionTilePlan,
  type RegionZoneConfig,
  type RegionZoneContext,
  type RegionZoneRule,
  type ResolvedRegionAnchor,
  type ResolvedRegionNpc
} from "./map/regions.ts";

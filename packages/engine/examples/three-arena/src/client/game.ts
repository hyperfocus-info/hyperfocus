import {


  CAMERA_AIM_DISTANCE
} from "./constants.ts";
import { state, arenaAudioRuntime, audio } from "./arena-state.ts";
export { state, arenaAudioRuntime, audio };
import type { ArenaLights, ArenaState, ArenaAudio } from "./arena-state.ts";
export type { ArenaLights, ArenaState, ArenaAudio };
import type { SlowFrame, TelemetrySample, SampleStats, PositiveSampleStats, BrowserPerformance } from "./telemetry-types.ts";
export type { SlowFrame, TelemetrySample, SampleStats, PositiveSampleStats, BrowserPerformance };
import { gamepadState, menuFocus } from "./input-context.ts";
export { gamepadState, menuFocus };
import type { ArenaGamepadState, FocusItem, MenuDirection, MenuMove } from "./input-context.ts";
export type { ArenaGamepadState, FocusItem, MenuDirection, MenuMove };
import { isEnemySceneItem } from "./runtime-types.ts";
export { isEnemySceneItem };
import type { RenderableObject, ProceduralPosePart, ProceduralPose, ArenaAnimationClip, ProceduralMode, ActorAnimationState, ActorVisual, WorldActor, Player, EnemyHealthBar, Enemy, BulletBase, OrdinaryBullet, BoomerangBullet, HomingBullet, CombatBullet, WeaponZoneKind, WeaponZoneSpec, WeaponZone, Pickup, SceneSpark, SceneEffect, IndicatorRuntime, RadialIndicator, DashIndicator, AttackIndicator, RadialIndicatorSpec, DashIndicatorSpec, AttackIndicatorSpec, ActiveHazard, CircleCollider, BoxCollider, PropCollider, PropCollisionItem, TraversalTool, TraversalToolType, TraversalHeightDelta, TraversalSpawn, TerrainGradient, WorldDelta, WorldPoint, PlayerJumpStats, WeaponAim, EnemyTarget, AreaWeaponDamageOptions, WeaponDamageOptions, PlayerDamageOptions, RemoteWeaponProgression, RemotePassiveProgression, RemotePlayer, ProgressionStats, Actor, LevelChoiceState, ClassLevelNotice, InstanceBatch, PickupInstanceBatch, ArenaRagdoll, GroundTilePatch, TerrainPlatformCell, ParticlePool, EffectKind, EffectOptions, BatchedParticle, SparkOptions, WorldPosition3D, SynthCueKind, SynthCueOptions, ToneOptions, NoiseOptions, FloatingTextOptions, SceneListItem, ActorAssets, IndicatorMesh, VisualIndicators, BenchStress, CameraRigSnapshot } from "./runtime-types.ts";
export type { RenderableObject, ProceduralPosePart, ProceduralPose, ArenaAnimationClip, ProceduralMode, ActorAnimationState, ActorVisual, WorldActor, Player, EnemyHealthBar, Enemy, BulletBase, OrdinaryBullet, BoomerangBullet, HomingBullet, CombatBullet, WeaponZoneKind, WeaponZoneSpec, WeaponZone, Pickup, SceneSpark, SceneEffect, IndicatorRuntime, RadialIndicator, DashIndicator, AttackIndicator, RadialIndicatorSpec, DashIndicatorSpec, AttackIndicatorSpec, ActiveHazard, CircleCollider, BoxCollider, PropCollider, PropCollisionItem, TraversalTool, TraversalToolType, TraversalHeightDelta, TraversalSpawn, TerrainGradient, WorldDelta, WorldPoint, PlayerJumpStats, WeaponAim, EnemyTarget, AreaWeaponDamageOptions, WeaponDamageOptions, PlayerDamageOptions, RemoteWeaponProgression, RemotePassiveProgression, RemotePlayer, ProgressionStats, Actor, LevelChoiceState, ClassLevelNotice, InstanceBatch, PickupInstanceBatch, ArenaRagdoll, GroundTilePatch, TerrainPlatformCell, ParticlePool, EffectKind, EffectOptions, BatchedParticle, SparkOptions, WorldPosition3D, SynthCueKind, SynthCueOptions, ToneOptions, NoiseOptions, FloatingTextOptions, SceneListItem, ActorAssets, IndicatorMesh, VisualIndicators, BenchStress, CameraRigSnapshot };
import { GAMEPAD_BUTTON, MOVE_DEADZONE, AIM_DEADZONE, gamepadSession, MANUAL_AIM_PRIORITY_SECONDS, CONTROL_HINTS, WAVE_BANNER_SUBTITLES } from "./input-constants.ts";
export { GAMEPAD_BUTTON, MOVE_DEADZONE, AIM_DEADZONE, gamepadSession, MANUAL_AIM_PRIORITY_SECONDS, CONTROL_HINTS, WAVE_BANNER_SUBTITLES };
import { texturePaths, ARCHITECT_UI_ROOT, CLASS_WEAPON_ICON_BY_ID, WEAPON_ICON_BY_ID, EVOLUTION_ICON_BY_WEAPON_ID, PASSIVE_ICON_BY_ID, animatedCharacterPaths, modelPaths, weaponModelPaths, weaponVisualProfiles, pickupModelPaths, universalAnimationPaths, UNIVERSAL_ANIMATION_RETARGET_FPS, UNIVERSAL_ANIMATION_CLIP_ALIASES, PROCEDURAL_ACTION_ANIMATION_NAMES, KENNEY_TO_UNIVERSAL_BONE_NAMES } from "./asset-catalog.ts";
export { texturePaths, ARCHITECT_UI_ROOT, CLASS_WEAPON_ICON_BY_ID, WEAPON_ICON_BY_ID, EVOLUTION_ICON_BY_WEAPON_ID, PASSIVE_ICON_BY_ID, animatedCharacterPaths, modelPaths, weaponModelPaths, weaponVisualProfiles, pickupModelPaths, universalAnimationPaths, UNIVERSAL_ANIMATION_RETARGET_FPS, UNIVERSAL_ANIMATION_CLIP_ALIASES, PROCEDURAL_ACTION_ANIMATION_NAMES, KENNEY_TO_UNIVERSAL_BONE_NAMES };
import type { WeaponVisualProfile } from "./asset-catalog.ts";
export type { WeaponVisualProfile };
import { data, WORLD_SIZE, WORLD_HALF_SIZE, toroidalWorld, weaponsById, passiveItemsById, playerClasses, playerClassesById, DEFAULT_CLASS_ID, CLASS_LEVEL_STORAGE_KEY, CLASS_LOADOUT_STORAGE_KEY, SETTINGS_STORAGE_KEY, DEFAULT_CLASS_LEVEL, MAX_LOADOUT_PASSIVES, DEFAULT_SETTINGS, POWERUP_DROP_MULTIPLIER, XP_DROP_CHANCE, RUN_STAT_DEFINITIONS, PASSIVE_TEAMWORK_EFFECTS } from "./content-runtime.ts";
export { data, WORLD_SIZE, WORLD_HALF_SIZE, toroidalWorld, weaponsById, passiveItemsById, playerClasses, playerClassesById, DEFAULT_CLASS_ID, CLASS_LEVEL_STORAGE_KEY, CLASS_LOADOUT_STORAGE_KEY, SETTINGS_STORAGE_KEY, DEFAULT_CLASS_LEVEL, MAX_LOADOUT_PASSIVES, DEFAULT_SETTINGS, POWERUP_DROP_MULTIPLIER, XP_DROP_CHANCE, RUN_STAT_DEFINITIONS, PASSIVE_TEAMWORK_EFFECTS };
import type { Settings, SettingKey, NumericSettingKey, ClassLoadout, ResolvedClassLoadout, ClassLoadouts, RunStatDefinition } from "./content-runtime.ts";
export type { Settings, SettingKey, NumericSettingKey, ClassLoadout, ResolvedClassLoadout, ClassLoadouts, RunStatDefinition };
import type { StringCategories, ProgressionBonus, PassiveTeamworkEffect, LevelChoiceBase, WeaponLevelChoice, PassiveLevelChoice, EvolutionLevelChoice, StatLevelChoice, HealLevelChoice, LevelChoice, WeaponEvolution, RawWeaponBase, RawWeaponDefinition, WeaponDefinition, WeaponRuntime, DamageWeapon, EnemyDefinition, RawEnemyDefinition, WaveDefinition, RawWaveDefinition, HazardDefinition, RawHazardDefinition, ArenaPropDefinition, PassiveDefinition, ClassUnlock, PlayerClassDefinition, ArenaData } from "./content-types.ts";
export type { StringCategories, ProgressionBonus, PassiveTeamworkEffect, LevelChoiceBase, WeaponLevelChoice, PassiveLevelChoice, EvolutionLevelChoice, StatLevelChoice, HealLevelChoice, LevelChoice, WeaponEvolution, RawWeaponBase, RawWeaponDefinition, WeaponDefinition, WeaponRuntime, DamageWeapon, EnemyDefinition, RawEnemyDefinition, WaveDefinition, RawWaveDefinition, HazardDefinition, RawHazardDefinition, ArenaPropDefinition, PassiveDefinition, ClassUnlock, PlayerClassDefinition, ArenaData };
import { ui } from "./user-interface.ts";
export { ui };
import { pointer } from "./runtime-context.ts";
import { bootUi, bootSmoother, bootSnapshot, bootContext, bootLoop, localThreeModules, bootLoader, bootRenderer, threeView } from "./boot-context.ts";
export { bootUi, bootSmoother, bootSnapshot, bootContext, bootLoop, localThreeModules, bootLoader, bootRenderer, threeView };
import type { ThreeNamespace, FbxLoaderModule, GltfLoaderModule, SkeletonUtilsModule, LocalThreeModules } from "./boot-context.ts";
export type { ThreeNamespace, FbxLoaderModule, GltfLoaderModule, SkeletonUtilsModule, LocalThreeModules };
import { requireActivePlayer } from "./bench-state.ts";
export { requireActivePlayer };
import { loadNetworkModule, connectLobby, handleLobbyMessage, updateStartRoomButton, renderRoomList, bindSettingsControls, isNumericSettingKey, isSettingKey, updateSettingFromControl, settingRange, renderSettingsControls, setSettingsInput, setSettingsToggle, settingReadback, openPauseMenu, resumeRunFromPause, openPauseSettings, closePauseSettings, openPauseConfirm, closePauseConfirm, returnToMainMenuFromPause, renderPauseUi, focusPauseElement, waveCopyKey, waveBannerSubtitle } from "./lobby-and-settings.ts";
export { loadNetworkModule, connectLobby, handleLobbyMessage, updateStartRoomButton, renderRoomList, bindSettingsControls, isNumericSettingKey, isSettingKey, updateSettingFromControl, settingRange, renderSettingsControls, setSettingsInput, setSettingsToggle, settingReadback, openPauseMenu, resumeRunFromPause, openPauseSettings, closePauseSettings, openPauseConfirm, closePauseConfirm, returnToMainMenuFromPause, renderPauseUi, focusPauseElement, waveCopyKey, waveBannerSubtitle };
import { setupInput, setupMenu, setupMinimap, pollGamepad, clearGamepadState, registerGamepad, handleMenuGamepadNavigation, menuTargets, setMenuFocus, moveMenuFocus, activateMenuFocus, clearControllerFocus, isMenuVisible, isPauseVisible, isFocusSurfaceVisible, focusItems, mainMenuFocusItems, pauseFocusItems, levelChoiceFocusItems, addFocusItem, isFocusElementAvailable, currentFocusItem, focusMenuElement, nearestHorizontalFocusItem, nearestVerticalFocusItem, adjustFocusedSetting, setInputMode, updateControllerStatus, updateControlHint, updateControllerAim, resetCameraState, resolveCameraOffset, dampCameraRigState, dampingAmount, shortestAngleDelta, readCameraRigSnapshot, orbitCameraFromMouse } from "./input-and-menu.ts";
export { setupInput, setupMenu, setupMinimap, pollGamepad, clearGamepadState, registerGamepad, handleMenuGamepadNavigation, menuTargets, setMenuFocus, moveMenuFocus, activateMenuFocus, clearControllerFocus, isMenuVisible, isPauseVisible, isFocusSurfaceVisible, focusItems, mainMenuFocusItems, pauseFocusItems, levelChoiceFocusItems, addFocusItem, isFocusElementAvailable, currentFocusItem, focusMenuElement, nearestHorizontalFocusItem, nearestVerticalFocusItem, adjustFocusedSetting, setInputMode, updateControllerStatus, updateControlHint, updateControllerAim, resetCameraState, resolveCameraOffset, dampCameraRigState, dampingAmount, shortestAngleDelta, readCameraRigSnapshot, orbitCameraFromMouse };
import { setupTextures, setupActorAssets, loadFbx, renameClip, selectSourceAnimationClip, normalizeSourceClipName, isSourcePoseClip, markClipSource, loadRetargetedUniversalAnimations, findSkinnedMesh, rewriteRetargetedClipTracks } from "./actor-assets.ts";
export { setupTextures, setupActorAssets, loadFbx, renameClip, selectSourceAnimationClip, normalizeSourceClipName, isSourcePoseClip, markClipSource, loadRetargetedUniversalAnimations, findSkinnedMesh, rewriteRetargetedClipTracks };
import { setupScene, setupVisualIndicators, resetVisualIndicators, clearAllyRings, updateVisualIndicators, updateAllyRadiusRings, updateAimVisuals, updateTargetLockVisual, updateCooldownRings, updateMagnetFieldRing, updateOffscreenEnemyArrows, createGroundRing, createTargetLockVisual, createAimConeVisual, createOffscreenArrowVisual, createIndicatorMaterial } from "./scene-setup.ts";
export { setupScene, setupVisualIndicators, resetVisualIndicators, clearAllyRings, updateVisualIndicators, updateAllyRadiusRings, updateAimVisuals, updateTargetLockVisual, updateCooldownRings, updateMagnetFieldRing, updateOffscreenEnemyArrows, createGroundRing, createTargetLockVisual, createAimConeVisual, createOffscreenArrowVisual, createIndicatorMaterial };
import { init, withBootTaskContext, reportBootProgress, bootErrorLabel } from "./bootstrap.ts";
export { init, withBootTaskContext, reportBootProgress, bootErrorLabel };
import { runBenchWalkSimulation, runBenchStress } from "./bench-runtime.ts";
export { runBenchWalkSimulation, runBenchStress };
import { getDamageWedgeGeometry, getLineEffectMaterial } from "./effects-materials.ts";
export { getDamageWedgeGeometry, getLineEffectMaterial };
import { loadOptionalModels, beginOptionalModelUpgrade, continueOptionalModelUpgrade, warmSceneShaders, loadFirstModel, loadModel, loadFbxModel, prepareImportedModel, bakeStaticPropLodSources, bakeStaticPropGeometryLods, simplifyStaticPropGeometry, waitForIdleBakeSlice, normalizeLargeImportedProp, loadUniversalAnimationMetadata, makeBillboard, createPickupVisual, createWeaponDropVisual, addPickupAura, refreshDynamicAssetVisuals, updatePlayerWeaponVisual } from "./model-assets.ts";
export { loadOptionalModels, beginOptionalModelUpgrade, continueOptionalModelUpgrade, warmSceneShaders, loadFirstModel, loadModel, loadFbxModel, prepareImportedModel, bakeStaticPropLodSources, bakeStaticPropGeometryLods, simplifyStaticPropGeometry, waitForIdleBakeSlice, normalizeLargeImportedProp, loadUniversalAnimationMetadata, makeBillboard, createPickupVisual, createWeaponDropVisual, addPickupAura, refreshDynamicAssetVisuals, updatePlayerWeaponVisual };
import { updateNetwork, networkPlayerEntries, progressionItemIdentity, progressionItemLevel, normalizeRemoteWeapons, normalizeRemotePassives, applyNetworkSnapshot, clearRemotePlayers, updateCamera, applyGamepadCameraOrbit, updateCameraObstacles, updateCameraOccluderFade, resolveCameraObstacleRadius, pointSegmentDistanceSquared, setPropOccluderOpacity, preparePropOccluderMaterials, preparePropOccluderMaterial, setAimFromCamera } from "./network-and-camera.ts";
export { updateNetwork, networkPlayerEntries, progressionItemIdentity, progressionItemLevel, normalizeRemoteWeapons, normalizeRemotePassives, applyNetworkSnapshot, clearRemotePlayers, updateCamera, applyGamepadCameraOrbit, updateCameraObstacles, updateCameraOccluderFade, resolveCameraObstacleRadius, pointSegmentDistanceSquared, setPropOccluderOpacity, preparePropOccluderMaterials, preparePropOccluderMaterial, setAimFromCamera };
import { updateGame, updateWave, updateBossSpawns, resolveBossType, updatePlayer, resolvePlayerTerrainMotion, transferVerticalMomentumIntoWallRun, slideActorDownSlope, killUphillMomentum, capActorHorizontalSpeed, spawnSlopeDust, resolveGroundActorTerrainMotion, updatePlayerMomentum, playerMomentumMaxSpeed, capPlayerMomentum, dampPlayerMomentum, updateMomentumDust, updatePlayerAnimationState, syncPlayerEngineMotion, syncActorBaseAnimationState, resolvePlayerAnimationState, shouldPreserveLockedPlayerAnimation, playerJumpStats, playerJumpVelocity, playerGravity, attemptPlayerJump, updatePlayerJumpPhysics, playerClearsGroundHits, spawnJumpDustBurst, spawnAirPuff, spawnAirborneTrail } from "./player-update.ts";
export { updateGame, updateWave, updateBossSpawns, resolveBossType, updatePlayer, resolvePlayerTerrainMotion, transferVerticalMomentumIntoWallRun, slideActorDownSlope, killUphillMomentum, capActorHorizontalSpeed, spawnSlopeDust, resolveGroundActorTerrainMotion, updatePlayerMomentum, playerMomentumMaxSpeed, capPlayerMomentum, dampPlayerMomentum, updateMomentumDust, updatePlayerAnimationState, syncPlayerEngineMotion, syncActorBaseAnimationState, resolvePlayerAnimationState, shouldPreserveLockedPlayerAnimation, playerJumpStats, playerJumpVelocity, playerGravity, attemptPlayerJump, updatePlayerJumpPhysics, playerClearsGroundHits, spawnJumpDustBurst, spawnAirPuff, spawnAirborneTrail };
import { normalizeRunSeed, resetRunRandom, runRandom, startGame, requestRunPointerLock, pauseToMenu, resetRun, spawnOpeningPack, spawnOpeningLoot } from "./run-lifecycle.ts";
export { normalizeRunSeed, resetRunRandom, runRandom, startGame, requestRunPointerLock, pauseToMenu, resetRun, spawnOpeningPack, spawnOpeningLoot };
import { setupPlayer, createActorVisual, findActorHandAnchor, setActorPosition, setActorFacing, updatePlayerFacing, setActorOpacity, setActorDamageFlash, applyDamageFlashToMaterial, playActorAnimation, resolveAnimationSource, resolveProceduralAnimationSource, createProceduralPose, getPosePart, resetPosePart, addPoseRotation, clearProceduralPoseOverlay, applyProceduralPose, applyProceduralOverlay, updateActorAnimation } from "./actor-animation.ts";
export { setupPlayer, createActorVisual, findActorHandAnchor, setActorPosition, setActorFacing, updatePlayerFacing, setActorOpacity, setActorDamageFlash, applyDamageFlashToMaterial, playActorAnimation, resolveAnimationSource, resolveProceduralAnimationSource, createProceduralPose, getPosePart, resetPosePart, addPoseRotation, clearProceduralPoseOverlay, applyProceduralPose, applyProceduralOverlay, updateActorAnimation };
import { createSlowFrameList, telemetry, createTelemetryPhaseScratch, measureTelemetryPhase } from "./telemetry-core.ts";
export { createSlowFrameList, telemetry, createTelemetryPhaseScratch, measureTelemetryPhase };
import { architectUiAsset, weaponIconPath, passiveIconPath, classSigilPath, classPassiveDeckPath, choiceVisual, isRecord, hasArenaAnimationMetadata, forEachObjectMaterial, cachedGeometry, cachedMeshBasicMaterial, cachedMeshStandardMaterial, cachedLineBasicMaterial, isArenaPropDefinition, readStorageRecord, writeStorageJson, settingNumber, readSettings, saveSettings, createInitialClassLevels, createInitialClassLoadouts, saveClassLevels, saveClassLoadouts, flattenWeaponUnlockFallback, normalizeUnlockList, classWeaponUnlocks, classPassiveUnlocks, classUnlocks, displayNameForUnlock } from "./content-ui.ts";
export { architectUiAsset, weaponIconPath, passiveIconPath, classSigilPath, classPassiveDeckPath, choiceVisual, isRecord, hasArenaAnimationMetadata, forEachObjectMaterial, cachedGeometry, cachedMeshBasicMaterial, cachedMeshStandardMaterial, cachedLineBasicMaterial, isArenaPropDefinition, readStorageRecord, writeStorageJson, settingNumber, readSettings, saveSettings, createInitialClassLevels, createInitialClassLoadouts, saveClassLevels, saveClassLoadouts, flattenWeaponUnlockFallback, normalizeUnlockList, classWeaponUnlocks, classPassiveUnlocks, classUnlocks, displayNameForUnlock };
import { requireLocalThreeModules, runtimeThreeModules, isCompleteThreeNamespace, isEngineThreeModule, requireEngineThreeModule, requireCompleteThreeNamespace, THREE, requireRuntimeInstance, bootState, requiredHtmlElement, requiredButton, requiredInput, requiredCanvas } from "./boot-and-dom.ts";
export { requireLocalThreeModules, runtimeThreeModules, isCompleteThreeNamespace, isEngineThreeModule, requireEngineThreeModule, requireCompleteThreeNamespace, THREE, requireRuntimeInstance, bootState, requiredHtmlElement, requiredButton, requiredInput, requiredCanvas };
import type { RuntimeConstructor } from "./boot-and-dom.ts";
export type { RuntimeConstructor };
import { updateHud, toast, pulseShake, round, roundToStep, clamp, clamp01, onResize, defaultWsUrl } from "./hud.ts";
export { updateHud, toast, pulseShake, round, roundToStep, clamp, clamp01, onResize, defaultWsUrl };
import { resetTelemetrySamples, findPlatformLandingProbe, runPlatformLandingProbe, readHeapBytes, recordSlowFrame, skippedFramesFromGap, buildPhaseTelemetrySnapshot, metricStats, positiveMetricStats, formatMs, formatFps } from "./telemetry-stats.ts";
export { resetTelemetrySamples, findPlatformLandingProbe, runPlatformLandingProbe, readHeapBytes, recordSlowFrame, skippedFramesFromGap, buildPhaseTelemetrySnapshot, metricStats, positiveMetricStats, formatMs, formatFps };
import { recordTelemetry, updateTelemetryPanel, playerEngineMotionSnapshot, getTelemetrySnapshot } from "./telemetry.ts";
export { recordTelemetry, updateTelemetryPanel, playerEngineMotionSnapshot, getTelemetrySnapshot };
import { updateMinimap } from "./minimap.ts";
export { updateMinimap };
import { updatePointerWorld, setAimWorld, syncReticleToAimWorld, positionReticle, loadFirstTexture, solidTexture, createPickupSpriteTexture, drawMagnetPickupSprite, drawXpPickupSprite, drawHealPickupSprite, drawWeaponPickupSprite, drawRoundRect, clearList, removeFromList } from "./pointer-and-textures.ts";
export { updatePointerWorld, setAimWorld, syncReticleToAimWorld, positionReticle, loadFirstTexture, solidTexture, createPickupSpriteTexture, drawMagnetPickupSprite, drawXpPickupSprite, drawHealPickupSprite, drawWeaponPickupSprite, drawRoundRect, clearList, removeFromList };
import { getConeGeometry, getRingGeometry, rebuildEnemySpatialGrid, markEnemySpatialDirty, queryLiveEnemies, nearestEnemy, nearestPlayer, angleTo, distanceSquared, getWorldSize, getWorldCenter, wrapWorld, wrapEntity, worldAxisDelta, worldDeltaInto, worldDelta, worldDistanceSquared, renderPosition, renderPositionInto, weightedPick } from "./world-math.ts";
export { getConeGeometry, getRingGeometry, rebuildEnemySpatialGrid, markEnemySpatialDirty, queryLiveEnemies, nearestEnemy, nearestPlayer, angleTo, distanceSquared, getWorldSize, getWorldCenter, wrapWorld, wrapEntity, worldAxisDelta, worldDeltaInto, worldDelta, worldDistanceSquared, renderPosition, renderPositionInto, weightedPick };
import { getBulletGeometry, getBulletTrailGeometry, getSparkGeometry, getBulletMaterial, getTrailMaterial, getSparkMaterial, getEffectMaterial, getEffectGeometry } from "./render-cache.ts";
export { getBulletGeometry, getBulletTrailGeometry, getSparkGeometry, getBulletMaterial, getTrailMaterial, getSparkMaterial, getEffectMaterial, getEffectGeometry };
import { pulseOverlay, showCenterBanner, spawnFloatingText, shouldSuppressNonCriticalReward, isHighCombatPressure, updateFloatingTexts, clearFloatingTexts, actorFloatingTextHeight, pickupFloatingTextHeight, registerComboKill, updateCombo, updateComboReadout } from "./reward-feedback.ts";
export { pulseOverlay, showCenterBanner, spawnFloatingText, shouldSuppressNonCriticalReward, isHighCombatPressure, updateFloatingTexts, clearFloatingTexts, actorFloatingTextHeight, pickupFloatingTextHeight, registerComboKill, updateCombo, updateComboReadout };
import { ensureAudio, currentAudioMix, applyAudioSettings, createNoiseBuffer, updateAudio, scheduleMusicBeat, playSynthCue, scheduleTone, scheduleNoise } from "./audio.ts";
export { ensureAudio, currentAudioMix, applyAudioSettings, createNoiseBuffer, updateAudio, scheduleMusicBeat, playSynthCue, scheduleTone, scheduleNoise };
import { getBatchedParticlePool, clearBatchedParticles, spawnBatchedEffect, addBatchedParticle, updateBatchedParticles, removeBatchedParticle, spawnEffect, spawnSceneEffect, particlesForEffect, createSparks, setEffectOpacity, spawnPulseRing, spawnBeamPreview, spawnDamageDirectionWedge } from "./particles.ts";
export { getBatchedParticlePool, clearBatchedParticles, spawnBatchedEffect, addBatchedParticle, updateBatchedParticles, removeBatchedParticle, spawnEffect, spawnSceneEffect, particlesForEffect, createSparks, setEffectOpacity, spawnPulseRing, spawnBeamPreview, spawnDamageDirectionWedge };
import { getPlayerWeaponHandPosition, getPlayerWeaponMuzzlePosition, projectileYAt, createWeaponVisual, getWeaponVisualProfile, cloneCachedModel, createProjectileVisual } from "./weapon-visuals.ts";
export { getPlayerWeaponHandPosition, getPlayerWeaponMuzzlePosition, projectileYAt, createWeaponVisual, getWeaponVisualProfile, cloneCachedModel, createProjectileVisual };
import { addHazard, addFallbackProp, addPropGlow, updatePropGlows, revealLazyProps, resetLazyProps, revealAllPendingProps, getLazyPropHeading, materializeProp, addModelPropClone, attachStaticPropLodGeometries, resolvePropScale, configurePropCollision, resolvePropCollider, resetPropCollisionIndex, resetPropVisibilityIndex, rebuildPropVisibilityBsp, updateStaticPropVisibility, updateStaticPropVisibilityByScan, showStaticProp, updateStaticPropLod, setPropVisible, registerPropCollisionItem, resolvePropCollisionRadius, rebuildPropCollisionGrid, queryPropCollisionItems, resolvePropCollisions, actorOverlapsPropY, resolveCirclePropCollision, resolveBoxPropCollision, updateWrappedStaticVisuals } from "./props.ts";
export { addHazard, addFallbackProp, addPropGlow, updatePropGlows, revealLazyProps, resetLazyProps, revealAllPendingProps, getLazyPropHeading, materializeProp, addModelPropClone, attachStaticPropLodGeometries, resolvePropScale, configurePropCollision, resolvePropCollider, resetPropCollisionIndex, resetPropVisibilityIndex, rebuildPropVisibilityBsp, updateStaticPropVisibility, updateStaticPropVisibilityByScan, showStaticProp, updateStaticPropLod, setPropVisible, registerPropCollisionItem, resolvePropCollisionRadius, rebuildPropCollisionGrid, queryPropCollisionItems, resolvePropCollisions, actorOverlapsPropY, resolveCirclePropCollision, resolveBoxPropCollision, updateWrappedStaticVisuals };
import { fireWeapon, spawnEnemy, pickEnemySkin, resolveEnemyTouchDamage, resolveEnemySpawnRank, enemyRankWeight, getEnemyDamageTable, powerupDropChance, xpDropChance, killEnemy, spawnEnemyRagdoll, getRagdollMaterial, resolveWeaponDropPayload, maxDropsOnGround, pickupTtlSeconds, trimPickupOverflowForSpawn, spawnPickup, collectPickup, damagePlayer, focusRetryAction, applyPlayerDamageKnockback } from "./spawn-and-damage.ts";
export { fireWeapon, spawnEnemy, pickEnemySkin, resolveEnemyTouchDamage, resolveEnemySpawnRank, enemyRankWeight, getEnemyDamageTable, powerupDropChance, xpDropChance, killEnemy, spawnEnemyRagdoll, getRagdollMaterial, resolveWeaponDropPayload, maxDropsOnGround, pickupTtlSeconds, trimPickupOverflowForSpawn, spawnPickup, collectPickup, damagePlayer, focusRetryAction, applyPlayerDamageKnockback };
import { updateEnemies, updateEnemyAnimation, resetEnemyBillboardBatches, commitEnemyBillboardBatches, queueEnemyBillboardBatch, getEnemyBillboardBatch, updateEnemyHealthBar, ensureEnemyHealthBar, removeEnemyHealthBar, getHealthBarGeometry, getHealthBarBackMaterial, getHealthBarFillMaterial, resetPickupBatches, commitPickupBatches, queuePickupBatch, getPickupBatch, pickupY, updateBullets, bulletOverlapsEnemyY, applyProjectileSplashDamage, updateSpecialBulletMotion, updatePickups, activatePickupMagnet, pullPickupTowardPlayer, updateMagnetPullVisual, updatePickupLightPool, updateEffects, updateSceneEffects, updateRagdolls, updateBossAttacks, resolveBossAttackKind, spawnBossSlam, spawnBossNova, spawnBossDash, addAttackIndicator, updateAttackIndicators, attackHitsPlayer, updateHazards } from "./combat-entities.ts";
export { updateEnemies, updateEnemyAnimation, resetEnemyBillboardBatches, commitEnemyBillboardBatches, queueEnemyBillboardBatch, getEnemyBillboardBatch, updateEnemyHealthBar, ensureEnemyHealthBar, removeEnemyHealthBar, getHealthBarGeometry, getHealthBarBackMaterial, getHealthBarFillMaterial, resetPickupBatches, commitPickupBatches, queuePickupBatch, getPickupBatch, pickupY, updateBullets, bulletOverlapsEnemyY, applyProjectileSplashDamage, updateSpecialBulletMotion, updatePickups, activatePickupMagnet, pullPickupTowardPlayer, updateMagnetPullVisual, updatePickupLightPool, updateEffects, updateSceneEffects, updateRagdolls, updateBossAttacks, resolveBossAttackKind, spawnBossSlam, spawnBossNova, spawnBossDash, addAttackIndicator, updateAttackIndicators, attackHitsPlayer, updateHazards };
import { updateWeapons, resolveWeaponAim, isManualAimActive, markManualAim, selectWeaponTarget, densestEnemyCluster, lowestHealthEnemy, countCombatObjects, addCombatBullet, fireSpecialWeapon, fireLanternAura, spawnOrbitFlames, firePlaguePools, selectClusterTargets, insertScoredEnemy, fireCoffinBoomerang, createBoomerangVisual, fireBatSwarm, createBatProjectileVisual, fireFuneralBell, fireReaperSweep, updateWeaponZones, addWeaponZone, applyAreaWeaponDamage, areaOverlapsEnemyY, applyWeaponDamage, spawnSweepVisual, normalizeAngle } from "./combat-weapons.ts";
export { updateWeapons, resolveWeaponAim, isManualAimActive, markManualAim, selectWeaponTarget, densestEnemyCluster, lowestHealthEnemy, countCombatObjects, addCombatBullet, fireSpecialWeapon, fireLanternAura, spawnOrbitFlames, firePlaguePools, selectClusterTargets, insertScoredEnemy, fireCoffinBoomerang, createBoomerangVisual, fireBatSwarm, createBatProjectileVisual, fireFuneralBell, fireReaperSweep, updateWeaponZones, addWeaponZone, applyAreaWeaponDamage, areaOverlapsEnemyY, applyWeaponDamage, spawnSweepVisual, normalizeAngle };
import { setupArena, addLoopGroundCopies, addLoopBoundary, addGroundTileField, updateGroundTilePatch, tileJitter, terrainSeed, terrainBaseHeightAt, terrainPlatformCellAt, terrainPlatformHeightAt, terrainHeightAt, actorGroundHeight, actorFeetY, actorVerticalHeight, verticalRangesOverlap, actorsOverlapY, terrainGradientAt, smoothstep01, addTraversalTools, buildTraversalToolSpawns, largestHeightDeltaAround, selectSeparatedTraversalSpawns, traversalToolColor, createTraversalToolVisual, updateTraversalTools, updateTraversalToolVisuals, updateTraversalToolVisual, traversalToolYOffset, traversalToolRotationSpeed, activateTraversalTool, traversalToolLabel } from "./terrain.ts";
export { setupArena, addLoopGroundCopies, addLoopBoundary, addGroundTileField, updateGroundTilePatch, tileJitter, terrainSeed, terrainBaseHeightAt, terrainPlatformCellAt, terrainPlatformHeightAt, terrainHeightAt, actorGroundHeight, actorFeetY, actorVerticalHeight, verticalRangesOverlap, actorsOverlapY, terrainGradientAt, smoothstep01, addTraversalTools, buildTraversalToolSpawns, largestHeightDeltaAround, selectSeparatedTraversalSpawns, traversalToolColor, createTraversalToolVisual, updateTraversalTools, updateTraversalToolVisuals, updateTraversalToolVisual, traversalToolYOffset, traversalToolRotationSpeed, activateTraversalTool, traversalToolLabel };
import { choicePayoffLines, selectedLevelChoiceIndex, selectedLevelChoice, selectLevelChoice, setLevelChoiceActionButton, updateLevelChoiceControls, rerollLevelChoices, banishSelectedLevelChoice, applyLevelChoice, renderClassPicker, renderLoadoutConfig, renderLoadoutOptionGrid, toggleLoadoutPanel, focusLoadoutOption, focusSelectedLoadoutOption, selectPlayerClass } from "./progression-ui.ts";
export { choicePayoffLines, selectedLevelChoiceIndex, selectedLevelChoice, selectLevelChoice, setLevelChoiceActionButton, updateLevelChoiceControls, rerollLevelChoices, banishSelectedLevelChoice, applyLevelChoice, renderClassPicker, renderLoadoutConfig, renderLoadoutOptionGrid, toggleLoadoutPanel, focusLoadoutOption, focusSelectedLoadoutOption, selectPlayerClass };
import { grantXp, openNextLevelChoice, closeLevelChoice, levelChoiceCount, levelChoiceCharge, levelChoiceKey, rollStatAmount, createRolledStatChoice, rollChestStatReward, passiveTeamworkEffectIds, addPassiveTeamworkEffect, rollPassiveTeamworkEffect, buildLevelUpChoices, choiceScore, createWeaponChoice, createPassiveChoice, createPassiveTeamworkChoice, createEvolutionChoice, createStatChoice, createHealChoice, canEvolveWeapon, describeWeaponBonus, describePassiveBonus, describeGenericBonus, percentDelta, formatPercentPoints, formatLevel, renderLevelChoices } from "./progression-choices.ts";
export { grantXp, openNextLevelChoice, closeLevelChoice, levelChoiceCount, levelChoiceCharge, levelChoiceKey, rollStatAmount, createRolledStatChoice, rollChestStatReward, passiveTeamworkEffectIds, addPassiveTeamworkEffect, rollPassiveTeamworkEffect, buildLevelUpChoices, choiceScore, createWeaponChoice, createPassiveChoice, createPassiveTeamworkChoice, createEvolutionChoice, createStatChoice, createHealChoice, canEvolveWeapon, describeWeaponBonus, describePassiveBonus, describeGenericBonus, percentDelta, formatPercentPoints, formatLevel, renderLevelChoices };
import { getWeaponLevel, setWeaponLevel, addWeaponToLoadout, addPassiveToLoadout, applyClassLoadout, getMaxWeaponSlots, getMaxPassiveSlots, getPassiveLevel, passiveTimerReady, updatePassiveEffects, passiveWeapon, triggerBlackGarlicAura, updateGraveBootTrail, triggerSilverRosaryMark, triggerTempoChime, triggerBloodHourglassDeathBloom, unlockedWeaponPool, unlockedPassivePool, getWeaponRuntime, applySpecialWeaponRuntimeDefaults, applyWeaponLevelBonus, damageTypeMultiplier, applyEvolutionRuntime, getPickupCollectRadius } from "./progression-runtime.ts";
export { getWeaponLevel, setWeaponLevel, addWeaponToLoadout, addPassiveToLoadout, applyClassLoadout, getMaxWeaponSlots, getMaxPassiveSlots, getPassiveLevel, passiveTimerReady, updatePassiveEffects, passiveWeapon, triggerBlackGarlicAura, updateGraveBootTrail, triggerSilverRosaryMark, triggerTempoChime, triggerBloodHourglassDeathBloom, unlockedWeaponPool, unlockedPassivePool, getWeaponRuntime, applySpecialWeaponRuntimeDefaults, applyWeaponLevelBonus, damageTypeMultiplier, applyEvolutionRuntime, getPickupCollectRadius };
import { normalizeArenaData, resolveWeaponKnockback, expandArenaProps, wrapValue, selectedClass, selectedClassLevel, classLevelFor, classMaxUnlockLevel, classNextUnlocks, classUnlocksAtLevel, classUnlockedWeaponIds, classUnlockedPassiveIds, isClassUnlockAvailable, firstUnlockedId, normalizeLoadoutPassiveIds, configuredLoadoutForClass, setConfiguredLoadout, advanceSelectedClassLevel, classUnlockNoticeText, xpForLevel, createProgressionStats, PROGRESSION_STAT_KEYS, isProgressionStatKey, applyProgressionBonus, applyScaledProgressionBonus, nearbyAllyCount, passiveTeamworkScale, applyPassiveTeamworkEffects, resolveProgressionStats, applyProgressionStats } from "./progression-data.ts";
export { normalizeArenaData, resolveWeaponKnockback, expandArenaProps, wrapValue, selectedClass, selectedClassLevel, classLevelFor, classMaxUnlockLevel, classNextUnlocks, classUnlocksAtLevel, classUnlockedWeaponIds, classUnlockedPassiveIds, isClassUnlockAvailable, firstUnlockedId, normalizeLoadoutPassiveIds, configuredLoadoutForClass, setConfiguredLoadout, advanceSelectedClassLevel, classUnlockNoticeText, xpForLevel, createProgressionStats, PROGRESSION_STAT_KEYS, isProgressionStatKey, applyProgressionBonus, applyScaledProgressionBonus, nearbyAllyCount, passiveTeamworkScale, applyPassiveTeamworkEffects, resolveProgressionStats, applyProgressionStats };
import type { ClassUnlockKind } from "./progression-data.ts";
export type { ClassUnlockKind };

export { renderer, scene, camera, raycaster, groundPlane, gltfLoader, fbxLoader, modelTextureOverride, networkModule, networkClient, networkClock, lobbyRoomStatus, minimapCtx, hudClock, lastWeaponHudKey, lastPassiveHudKey, cameraRig, cameraRigSnapshot, floatingTextLayer, cameraYaw, cameraPitch, cameraDistance, desiredCameraYaw, desiredCameraPitch, desiredCameraDistance, cameraBlocked, centerBannerTimeout, toastTimeout, renderContext, networkContext, cameraContext, hudContext, setCenterBannerTimeout, setToastTimeout, keys, remotePlayers, cameraObstacleBuffer, tempVec, tempCameraTarget, tempCameraOffset, tempCameraDesired, tempCameraWorldSize, tempPointerNdc, tempMatrix, tempQuaternion, tempScale, tempColor, tempRenderPosition, tempRenderPositionB, tempWorldDelta, clusterTargetScratch, pointer, playerMotionPosition, playerMotionResolvedDelta, playerMotionDesiredVelocity, playerMotionFacing, playerMotionAimTarget, playerMotionGroundNormal, lastReticleX, lastReticleY, setLastReticlePosition, setLastWeaponHudKey, setLastPassiveHudKey } from "./runtime-context.ts";

import { bindRuntimePorts } from "./runtime-ports.ts";
import * as actorAnimationPort from "./actor-animation.ts";
import * as actorAssetsPort from "./actor-assets.ts";
import * as audioPort from "./audio.ts";
import * as bootstrapPort from "./bootstrap.ts";
import * as combatEntitiesPort from "./combat-entities.ts";
import * as combatWeaponsPort from "./combat-weapons.ts";
import * as contentUiPort from "./content-ui.ts";
import * as effectsMaterialsPort from "./effects-materials.ts";
import * as frameLoopPort from "./frame-loop.ts";
import * as hudPort from "./hud.ts";
import * as inputAndMenuPort from "./input-and-menu.ts";
import * as lobbyAndSettingsPort from "./lobby-and-settings.ts";
import * as minimapPort from "./minimap.ts";
import * as modelAssetsPort from "./model-assets.ts";
import * as networkAndCameraPort from "./network-and-camera.ts";
import * as particlesPort from "./particles.ts";
import * as playerUpdatePort from "./player-update.ts";
import * as pointerAndTexturesPort from "./pointer-and-textures.ts";
import * as progressionChoicesPort from "./progression-choices.ts";
import * as progressionDataPort from "./progression-data.ts";
import * as progressionRuntimePort from "./progression-runtime.ts";
import * as progressionUiPort from "./progression-ui.ts";
import * as propsPort from "./props.ts";
import * as renderCachePort from "./render-cache.ts";
import * as rewardFeedbackPort from "./reward-feedback.ts";
import * as runLifecyclePort from "./run-lifecycle.ts";
import * as sceneSetupPort from "./scene-setup.ts";
import * as spawnAndDamagePort from "./spawn-and-damage.ts";
import * as telemetryStatsPort from "./telemetry-stats.ts";
import * as telemetryPort from "./telemetry.ts";
import * as terrainPort from "./terrain.ts";
import * as weaponVisualsPort from "./weapon-visuals.ts";
import * as worldMathPort from "./world-math.ts";

bindRuntimePorts({
  actorAnimation: actorAnimationPort,
  actorAssets: actorAssetsPort,
  audio: audioPort,
  bootstrap: bootstrapPort,
  combatEntities: combatEntitiesPort,
  combatWeapons: combatWeaponsPort,
  contentUi: contentUiPort,
  effectsMaterials: effectsMaterialsPort,
  frameLoop: frameLoopPort,
  hud: hudPort,
  inputAndMenu: inputAndMenuPort,
  lobbyAndSettings: lobbyAndSettingsPort,
  minimap: minimapPort,
  modelAssets: modelAssetsPort,
  networkAndCamera: networkAndCameraPort,
  particles: particlesPort,
  playerUpdate: playerUpdatePort,
  pointerAndTextures: pointerAndTexturesPort,
  progressionChoices: progressionChoicesPort,
  progressionData: progressionDataPort,
  progressionRuntime: progressionRuntimePort,
  progressionUi: progressionUiPort,
  props: propsPort,
  renderCache: renderCachePort,
  rewardFeedback: rewardFeedbackPort,
  runLifecycle: runLifecyclePort,
  sceneSetup: sceneSetupPort,
  spawnAndDamage: spawnAndDamagePort,
  telemetryStats: telemetryStatsPort,
  telemetry: telemetryPort,
  terrain: terrainPort,
  weaponVisuals: weaponVisualsPort,
  worldMath: worldMathPort,
});

let clientStarted = false;

export function startThreeArenaClient(): void {
  if (clientStarted) return;
  clientStarted = true;
  window.addEventListener("pagehide", () => { void arenaAudioRuntime.dispose(); }, { once: true });
  void init().catch((error) => {
    console.error("Three Arena boot failed", error);
    bootContext.snapshot = {
      ...bootSnapshot,
      status: "failed",
      label: "Loading failed",
      activeLabel: bootErrorLabel(error),
      actualProgress: 1,
      visibleProgress: 1,
      error,
      updatedAt: performance.now()
    };
    bootUi.render(bootSnapshot);
    bootLoop.stop();
  });
}

export { arenaFrameDriver, tick } from "./frame-loop.ts";

export type ArenaGlobals = typeof globalThis & {
  __threeArenaTelemetrySnapshot?: unknown;
  __threeArenaBenchStress?: unknown;
  __threeArenaBenchResetTelemetry?: unknown;
  __threeArenaBenchWalkSimulation?: unknown;
  __threeArenaDebug?: unknown;
};

declare global {
  var __threeArenaTelemetrySnapshot: unknown;
  var __threeArenaBenchStress: unknown;
  var __threeArenaBenchResetTelemetry: unknown;
  var __threeArenaBenchWalkSimulation: unknown;
  var __threeArenaDebug: unknown;
}

export const arenaGlobals = globalThis;
arenaGlobals.__threeArenaTelemetrySnapshot = getTelemetrySnapshot;
arenaGlobals.__threeArenaBenchStress = runBenchStress;
arenaGlobals.__threeArenaBenchResetTelemetry = resetTelemetrySamples;
arenaGlobals.__threeArenaBenchWalkSimulation = runBenchWalkSimulation;
arenaGlobals.__threeArenaDebug = {
  start: () => {
    if (!state.running) startGame(false);
    return getTelemetrySnapshot();
  },
  restart: () => {
    startGame(false);
    return getTelemetrySnapshot();
  },
  gameOver: () => {
    if (!state.running) startGame(false);
    damagePlayer(Number.MAX_SAFE_INTEGER);
    return getTelemetrySnapshot();
  },
  spawnPickup: (kind: Pickup["kind"] = "magnet", distance = 7) => {
    if (!state.running) startGame(false);
    const player = requireActivePlayer();
    const angle = state.time * 1.7;
    spawnPickup(kind, player.x + Math.cos(angle) * distance, player.z + Math.sin(angle) * distance);
    return getTelemetrySnapshot();
  },
  activateMagnet: (count = 12) => {
    if (!state.running) startGame(false);
    const player = requireActivePlayer();
    for (let i = 0; i < count; i += 1) {
      const angle = i * 2.399963229728653;
      const radius = 10 + (i % 5) * 3;
      spawnPickup(i % 6 === 0 ? "heal" : "xp", player.x + Math.cos(angle) * radius, player.z + Math.sin(angle) * radius);
    }
    activatePickupMagnet();
    return getTelemetrySnapshot();
  },
  levelChoice: () => {
    if (!state.running && !state.levelChoice) startGame(false);
    grantXp(state.nextXp - state.xp);
    return {
      level: state.level,
      choices: state.levelChoice?.choices?.map((choice) => ({ kind: choice.kind, title: choice.title, badge: choice.badge })) ?? [],
      snapshot: getTelemetrySnapshot()
    };
  },
  chooseLevel: (index = 0) => {
    applyLevelChoice(index);
    return getTelemetrySnapshot();
  },
  damageTable: getEnemyDamageTable,
  spawnEnemy: (typeId = Object.keys(data.enemies)[0] ?? "shambler", options: { boss?: boolean } = {}) => {
    if (!state.running) startGame(false);
    const enemy = spawnEnemy(typeId, options);
    return { typeId, touch: enemy.touch, rank: resolveEnemySpawnRank(typeId), snapshot: getTelemetrySnapshot() };
  },
  fire: (weaponId: string | undefined = state.activeWeaponId ?? state.weaponSlots[0], angle = 0) => {
    if (!state.running) startGame(false);
    const player = requireActivePlayer();
    const weapon = getWeaponRuntime(weaponId) ?? getWeaponRuntime(state.activeWeaponId ?? state.weaponSlots[0]);
    if (!weapon) return null;
    state.activeWeaponId = weapon.id;
    updatePlayerWeaponVisual(angle);
    const hand = getPlayerWeaponHandPosition(angle);
    const handPosition = { x: round(hand.x), y: round(hand.y), z: round(hand.z) };
    const muzzle = getPlayerWeaponMuzzlePosition(angle);
    const bulletCountBefore = state.bullets.length;
    fireWeapon(weapon, angle);
    const bullet = state.bullets.length > bulletCountBefore ? state.bullets[state.bullets.length - 1] : null;
    return {
      weaponId: weapon.id,
      hand: handPosition,
      muzzle: { x: round(muzzle.x), y: round(muzzle.y), z: round(muzzle.z) },
      bullet: bullet ? { x: round(bullet.x), y: round(bullet.y ?? 0), z: round(bullet.z) } : null,
      player: { x: round(player.x), y: round(player.jumpY), z: round(player.z) }
    };
  },
  aimAt: (angle = 0, seconds = MANUAL_AIM_PRIORITY_SECONDS) => {
    if (!state.running) startGame(false);
    const player = requireActivePlayer();
    setAimWorld(player.x + Math.cos(angle) * CAMERA_AIM_DISTANCE, player.z + Math.sin(angle) * CAMERA_AIM_DISTANCE);
    markManualAim(seconds);
    syncReticleToAimWorld();
    return {
      angle: round(angle),
      manualAimUntil: round(pointer.manualAimUntil),
      active: isManualAimActive()
    };
  },
  aimResolution: (weaponId: string | undefined = state.activeWeaponId ?? state.weaponSlots[0]) => {
    if (!state.running) startGame(false);
    const player = requireActivePlayer();
    const weapon = getWeaponRuntime(weaponId) ?? getWeaponRuntime(state.activeWeaponId ?? state.weaponSlots[0]);
    if (!weapon) return null;
    const resolved = resolveWeaponAim(weapon, player);
    return {
      weaponId: weapon.id,
      mode: resolved.mode,
      angle: round(resolved.angle),
      manualAimActive: isManualAimActive(),
      target: resolved.target ? {
        typeId: "typeId" in resolved.target && typeof resolved.target.typeId === "string" ? resolved.target.typeId : null,
        x: round(resolved.target.x),
        z: round(resolved.target.z)
      } : null
    };
  },
  propBounds: () => state.props.map((prop) => {
    prop.updateMatrixWorld?.(true);
    const box = new THREE.Box3().setFromObject(prop);
    const size = box.getSize(new THREE.Vector3());
    return {
      model: prop.userData?.model ?? null,
      max: round(Math.max(size.x, size.y, size.z)),
      x: round(size.x),
      y: round(size.y),
      z: round(size.z),
      importScale: prop.userData?.importScale ?? null
    };
  }).sort((a, b) => b.max - a.max).slice(0, 12),
  traversalTools: () => state.traversalTools.map((tool) => ({
    type: tool.type,
    x: round(tool.x),
    z: round(tool.z),
    y: round(terrainHeightAt(tool.x, tool.z)),
    targetY: round(terrainHeightAt(tool.targetX ?? tool.x, tool.targetZ ?? tool.z)),
    cooldown: round(tool.cooldown ?? 0)
  })),
  terrainAt: (x = state.player?.x ?? 0, z = state.player?.z ?? 0) => {
    const gradient = terrainGradientAt(x, z);
    return {
      x: round(x),
      z: round(z),
      y: round(terrainHeightAt(x, z)),
      slopeRatio: round(gradient.ratio),
      slopeDegrees: round(gradient.angle * 180 / Math.PI)
    };
  },
  jump: () => {
    if (!state.running) startGame(false);
    attemptPlayerJump();
    return getTelemetrySnapshot();
  },
  probeEngineMotionAim: (pitchRadians = Math.PI * 0.4) => {
    const player = requireActivePlayer();
    if (!player.engineMotion) return null;
    return playerEngineMotionSnapshot(player.engineMotion.probeAim(pitchRadians));
  },
  probeEngineMotionRecoil: () => {
    const player = requireActivePlayer();
    if (!player.engineMotion) return null;
    const before = playerEngineMotionSnapshot(player.engineMotion.snapshot());
    player.engineMotionRecoilSource = "engine-motion";
    const after = playerEngineMotionSnapshot(player.engineMotion.recoil());
    return { before, after };
  },
  platformLandingProbe: runPlatformLandingProbe,
  settings: () => ({ ...state.settings }),
  setSettings: (patch: Partial<Settings> = {}) => {
    for (const [key, value] of Object.entries(patch)) {
      if (!isSettingKey(key)) continue;
      if (key === "invertY" || key === "muted") state.settings[key] = Boolean(value);
      else if (isNumericSettingKey(key)) {
        const [min, max] = settingRange(key);
        state.settings[key] = clamp(Number(value), min, max);
      }
    }
    renderSettingsControls();
    applyAudioSettings();
    saveSettings();
    return { ...state.settings };
  },
  audioGains: () => ({
    master: arenaAudioRuntime.graph.master?.gain.value ?? null,
    music: arenaAudioRuntime.graph.music?.gain.value ?? null,
    sfx: arenaAudioRuntime.graph.sfx?.gain.value ?? null
  }),
  snapshot: getTelemetrySnapshot
};

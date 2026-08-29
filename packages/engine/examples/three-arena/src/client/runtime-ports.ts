export type RuntimePorts = {
  actorAnimation: Pick<typeof import("./actor-animation.ts"), "applyProceduralPose" | "clearProceduralPoseOverlay" | "createActorVisual" | "playActorAnimation" | "resolveAnimationSource" | "setActorDamageFlash" | "setActorFacing" | "setActorOpacity" | "setActorPosition" | "setupPlayer" | "updateActorAnimation" | "updatePlayerFacing">;
  actorAssets: Pick<typeof import("./actor-assets.ts"), "findSkinnedMesh" | "setupActorAssets" | "setupTextures">;
  audio: Pick<typeof import("./audio.ts"), "applyAudioSettings" | "ensureAudio" | "playSynthCue" | "updateAudio">;
  bootstrap: Pick<typeof import("./bootstrap.ts"), "bootErrorLabel" | "reportBootProgress">;
  combatEntities: Pick<typeof import("./combat-entities.ts"), "activatePickupMagnet" | "commitEnemyBillboardBatches" | "commitPickupBatches" | "queueEnemyBillboardBatch" | "queuePickupBatch" | "removeEnemyHealthBar" | "resetEnemyBillboardBatches" | "resetPickupBatches" | "updateAttackIndicators" | "updateBossAttacks" | "updateBullets" | "updateEffects" | "updateEnemies" | "updateEnemyHealthBar" | "updateHazards" | "updatePickups" | "updateRagdolls">;
  combatWeapons: Pick<typeof import("./combat-weapons.ts"), "addCombatBullet" | "addWeaponZone" | "applyAreaWeaponDamage" | "applyWeaponDamage" | "fireSpecialWeapon" | "lowestHealthEnemy" | "markManualAim" | "updateWeaponZones" | "updateWeapons">;
  contentUi: Pick<typeof import("./content-ui.ts"), "cachedGeometry" | "cachedLineBasicMaterial" | "cachedMeshBasicMaterial" | "cachedMeshStandardMaterial" | "choiceVisual" | "classPassiveDeckPath" | "classPassiveUnlocks" | "classSigilPath" | "classUnlocks" | "classWeaponUnlocks" | "displayNameForUnlock" | "forEachObjectMaterial" | "hasArenaAnimationMetadata" | "isArenaPropDefinition" | "isRecord" | "passiveIconPath" | "saveClassLevels" | "saveClassLoadouts" | "saveSettings" | "weaponIconPath">;
  effectsMaterials: Pick<typeof import("./effects-materials.ts"), "getDamageWedgeGeometry" | "getLineEffectMaterial">;
  frameLoop: Pick<typeof import("./frame-loop.ts"), "tick">;
  hud: Pick<typeof import("./hud.ts"), "clamp" | "clamp01" | "defaultWsUrl" | "onResize" | "pulseShake" | "round" | "roundToStep" | "toast" | "updateHud">;
  inputAndMenu: Pick<typeof import("./input-and-menu.ts"), "clearControllerFocus" | "dampCameraRigState" | "focusMenuElement" | "isFocusElementAvailable" | "menuTargets" | "pollGamepad" | "readCameraRigSnapshot" | "resetCameraState" | "resolveCameraOffset" | "setInputMode" | "setMenuFocus" | "setupInput" | "setupMenu" | "setupMinimap" | "shortestAngleDelta" | "updateControlHint">;
  lobbyAndSettings: Pick<typeof import("./lobby-and-settings.ts"), "bindSettingsControls" | "closePauseConfirm" | "closePauseSettings" | "connectLobby" | "focusPauseElement" | "loadNetworkModule" | "openPauseConfirm" | "openPauseMenu" | "openPauseSettings" | "renderPauseUi" | "resumeRunFromPause" | "returnToMainMenuFromPause" | "waveBannerSubtitle">;
  minimap: Pick<typeof import("./minimap.ts"), "updateMinimap">;
  modelAssets: Pick<typeof import("./model-assets.ts"), "continueOptionalModelUpgrade" | "createPickupVisual" | "loadOptionalModels" | "makeBillboard" | "updatePlayerWeaponVisual">;
  networkAndCamera: Pick<typeof import("./network-and-camera.ts"), "applyNetworkSnapshot" | "clearRemotePlayers" | "preparePropOccluderMaterials" | "setAimFromCamera" | "updateCamera" | "updateNetwork">;
  particles: Pick<typeof import("./particles.ts"), "addBatchedParticle" | "clearBatchedParticles" | "setEffectOpacity" | "spawnBeamPreview" | "spawnDamageDirectionWedge" | "spawnEffect" | "spawnPulseRing" | "updateBatchedParticles">;
  playerUpdate: Pick<typeof import("./player-update.ts"), "attemptPlayerJump" | "capActorHorizontalSpeed" | "playerClearsGroundHits" | "playerGravity" | "playerJumpStats" | "playerJumpVelocity" | "playerMomentumMaxSpeed" | "resolveGroundActorTerrainMotion" | "resolvePlayerTerrainMotion" | "syncActorBaseAnimationState" | "updateGame">;
  pointerAndTextures: Pick<typeof import("./pointer-and-textures.ts"), "clearList" | "createPickupSpriteTexture" | "loadFirstTexture" | "positionReticle" | "removeFromList" | "setAimWorld" | "solidTexture" | "syncReticleToAimWorld" | "updatePointerWorld">;
  progressionChoices: Pick<typeof import("./progression-choices.ts"), "addPassiveTeamworkEffect" | "buildLevelUpChoices" | "closeLevelChoice" | "formatPercentPoints" | "grantXp" | "levelChoiceCharge" | "levelChoiceCount" | "levelChoiceKey" | "openNextLevelChoice" | "passiveTeamworkEffectIds" | "percentDelta" | "renderLevelChoices" | "rollChestStatReward">;
  progressionData: Pick<typeof import("./progression-data.ts"), "advanceSelectedClassLevel" | "applyProgressionStats" | "classLevelFor" | "classMaxUnlockLevel" | "classNextUnlocks" | "classUnlockNoticeText" | "classUnlockedPassiveIds" | "classUnlockedWeaponIds" | "configuredLoadoutForClass" | "resolveProgressionStats" | "selectedClass" | "selectedClassLevel" | "setConfiguredLoadout" | "xpForLevel">;
  progressionRuntime: Pick<typeof import("./progression-runtime.ts"), "addPassiveToLoadout" | "addWeaponToLoadout" | "applyClassLoadout" | "getPickupCollectRadius" | "getWeaponLevel" | "getWeaponRuntime" | "passiveWeapon" | "triggerBloodHourglassDeathBloom" | "updatePassiveEffects">;
  progressionUi: Pick<typeof import("./progression-ui.ts"), "applyLevelChoice" | "banishSelectedLevelChoice" | "choicePayoffLines" | "focusLoadoutOption" | "renderClassPicker" | "renderLoadoutConfig" | "rerollLevelChoices" | "selectLevelChoice" | "toggleLoadoutPanel" | "updateLevelChoiceControls">;
  props: Pick<typeof import("./props.ts"), "addHazard" | "materializeProp" | "resetLazyProps" | "resetPropCollisionIndex" | "resetPropVisibilityIndex" | "resolvePropCollisions" | "revealAllPendingProps" | "revealLazyProps" | "updatePropGlows" | "updateWrappedStaticVisuals">;
  renderCache: Pick<typeof import("./render-cache.ts"), "getBulletGeometry" | "getBulletMaterial" | "getBulletTrailGeometry" | "getEffectGeometry" | "getEffectMaterial" | "getSparkGeometry" | "getSparkMaterial" | "getTrailMaterial">;
  rewardFeedback: Pick<typeof import("./reward-feedback.ts"), "actorFloatingTextHeight" | "clearFloatingTexts" | "pickupFloatingTextHeight" | "pulseOverlay" | "registerComboKill" | "showCenterBanner" | "spawnFloatingText" | "updateCombo" | "updateComboReadout" | "updateFloatingTexts">;
  runLifecycle: Pick<typeof import("./run-lifecycle.ts"), "requestRunPointerLock" | "runRandom" | "startGame">;
  sceneSetup: Pick<typeof import("./scene-setup.ts"), "clearAllyRings" | "createIndicatorMaterial" | "resetVisualIndicators" | "setupScene" | "updateVisualIndicators">;
  spawnAndDamage: Pick<typeof import("./spawn-and-damage.ts"), "collectPickup" | "damagePlayer" | "fireWeapon" | "getEnemyDamageTable" | "killEnemy" | "resolveEnemySpawnRank" | "spawnEnemy" | "spawnPickup">;
  telemetryStats: Pick<typeof import("./telemetry-stats.ts"), "buildPhaseTelemetrySnapshot" | "formatFps" | "formatMs" | "metricStats" | "positiveMetricStats" | "readHeapBytes" | "recordSlowFrame" | "resetTelemetrySamples" | "skippedFramesFromGap">;
  telemetry: Pick<typeof import("./telemetry.ts"), "getTelemetrySnapshot" | "recordTelemetry">;
  terrain: Pick<typeof import("./terrain.ts"), "actorFeetY" | "actorGroundHeight" | "actorVerticalHeight" | "actorsOverlapY" | "setupArena" | "terrainBaseHeightAt" | "terrainGradientAt" | "terrainHeightAt" | "terrainPlatformCellAt" | "terrainSeed" | "updateGroundTilePatch" | "updateTraversalToolVisuals" | "updateTraversalTools" | "verticalRangesOverlap">;
  weaponVisuals: Pick<typeof import("./weapon-visuals.ts"), "cloneCachedModel" | "createProjectileVisual" | "createWeaponVisual" | "getPlayerWeaponHandPosition" | "getPlayerWeaponMuzzlePosition" | "projectileYAt">;
  worldMath: Pick<typeof import("./world-math.ts"), "angleTo" | "distanceSquared" | "getConeGeometry" | "getRingGeometry" | "getWorldCenter" | "getWorldSize" | "markEnemySpatialDirty" | "nearestEnemy" | "nearestPlayer" | "queryLiveEnemies" | "rebuildEnemySpatialGrid" | "renderPosition" | "renderPositionInto" | "weightedPick" | "worldAxisDelta" | "worldDelta" | "worldDeltaInto" | "worldDistanceSquared" | "wrapEntity" | "wrapWorld">;
};

let runtimePorts: RuntimePorts | null = null;

export function bindRuntimePorts(ports: RuntimePorts): void {
  if (runtimePorts) throw new Error("Three Arena runtime ports were already bound.");
  runtimePorts = ports;
}

export function runtimeCallback<
  Domain extends keyof RuntimePorts,
  Key extends keyof RuntimePorts[Domain],
>(domain: Domain, key: Key): RuntimePorts[Domain][Key];
export function runtimeCallback(domain: keyof RuntimePorts, key: PropertyKey) {
  return (...args: unknown[]) => {
    if (!runtimePorts) throw new Error(`Three Arena runtime callback used before composition: ${String(domain)}.${String(key)}`);
    const callback: unknown = Reflect.get(runtimePorts[domain], key);
    if (typeof callback !== "function") throw new Error(`Three Arena runtime callback is not callable: ${String(domain)}.${String(key)}`);
    return Reflect.apply(callback, undefined, args);
  };
}

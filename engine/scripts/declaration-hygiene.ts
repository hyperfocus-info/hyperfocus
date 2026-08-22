export const cameraPublicSignatures = [
  "pan(dx: number, dy: number): Camera;",
  "centerOn(point: Point, amount?: number): Camera;",
  "follow(target: CameraTarget | null, followOptions?: FollowOptions): Camera;",
  "clearFollow(): Camera;",
  "zoomTo(value: number, anchor?: Point): Camera;",
  "zoomBy(factor: number, anchor?: Point): Camera;",
  "setViewport(width: number, height: number): Camera;",
  "setBounds(nextBounds: CameraBounds | null): Camera;",
  "export declare function createCamera(options: CameraOptions): Camera;",
] as const;

export const cameraRootExports = ["createCamera", "Camera", "CameraOptions", "CameraState"] as const;

export const rootBrowserSubpathOnlyValueExports = {
  mmo: [
    "createMmoCombatModule",
    "useMmoConsumable",
    "createMmoEntityCollectionBridge",
    "createMmoEntityRegistry",
    "createMmoInterestSnapshotter",
    "createMmoPersistenceBridge",
    "createMmoGameplayKit",
    "createMmoRoomType",
    "createMmoWorld",
    "createMmoClient",
    "createEntityInterpolator",
    "createInputMapper",
    "createMmoInventoryOps",
    "addMmoId",
    "hasMmoId",
    "parseMmoIdSet",
    "removeMmoId",
    "createMmoOccupancyTester",
    "moveMmoCircle",
    "rectAroundPoint",
    "teleportMmoEntityToTile",
    "findMmoEntityNearAim",
    "findNearestMmoEntity",
    "pointSegmentDistance",
  ],
  render: [
    "drawRenderable",
    "createRenderStage",
    "createTileCacheRenderer",
    "createActorRenderer",
    "createHudRenderer",
    "createEffectQueue",
    "truncateText",
    "wrapText",
    "createBarDrawCall",
    "createLabelDrawCall",
    "createInteractionOutlineDrawCall",
    "createTextBlockDrawCall",
    "createThreeRender3D",
    "createBarIndicator",
    "createBeamPreviewIndicator",
    "createConePreviewIndicator",
    "createGroundArcIndicator",
    "createGroundRingIndicator",
    "createProjectileTrailIndicator",
    "createRadialIndicator",
    "createStatusBadgeIndicator",
    "createThreeIndicatorMaterial",
  ],
  physics: [
    "createKinematicCharacter3D",
    "collidersOverlap3D",
    "submersionRatio",
    "applyOverTime",
    "rubberBand",
  ],
} as const;

export function assertNoElidedAnyDeclarationSource(source: string, label: string) {
  if (source.includes("/*elided*/ any")) {
    throw new Error(`declaration emit leaked elided any in ${label}`);
  }
}

export function assertCameraDeclarationSource(source: string, label: string) {
  assertNoElidedAnyDeclarationSource(source, label);

  if (source.includes("any")) {
    throw new Error(`${label} must not expose any in the public camera surface`);
  }

  for (const signature of cameraPublicSignatures) {
    if (!source.includes(signature)) {
      throw new Error(`${label} lost public camera signature: ${signature}`);
    }
  }
}

export function assertCameraRootExportsSource(source: string, label: string) {
  for (const exportName of cameraRootExports) {
    if (!source.includes(exportName)) {
      throw new Error(`${label} lost public camera export: ${exportName}`);
    }
  }
}

export function assertRootBrowserSubpathOnlyDeclarationsSource(source: string, label: string) {
  if (/from\s+["']\.\/(?:mmo|physics)\//.test(source) || /from\s+["']\.\/render\/(?:index|3d)(?:\.js)?["']/.test(source)) {
    throw new Error(`${label} must not re-export mmo/render/physics internals from root/browser declarations`);
  }

  for (const [subpath, exportNames] of Object.entries(rootBrowserSubpathOnlyValueExports)) {
    for (const exportName of exportNames) {
      const leakedValue = new RegExp(`\\b${exportName}\\b`).test(source);
      if (leakedValue) throw new Error(`${label} leaked ${exportName}; keep it inside @hyperfocus/engine/${subpath}`);
    }
  }
}

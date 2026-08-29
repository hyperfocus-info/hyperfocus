import { cpSync, existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { $ } from "bun";
import { readPackedFilePaths, readTarballFilename } from "../smoke/json-boundaries.ts";
import { rootBrowserSubpathOnlyValueExports } from "../declaration-hygiene.ts";
import {
  assert,
  bunCommand,
  expectedBrowserPackageFiles,
  expectedPackageFiles,
  findAncestorTool,
  npmCommand,
  rootDir,
} from "./core.ts";

const packDir = mkdtempSync(join(tmpdir(), "catalog-engine-pack-"));
try {
  const packOutput = await $`${npmCommand} pack --dry-run --json --pack-destination ${packDir}`.cwd(rootDir).text();
  const packedFiles = new Set(readPackedFilePaths(packOutput));

  for (const path of expectedBrowserPackageFiles) {
    assert(packedFiles.has(path), `package tarball would omit reachable browser artifact ${path}`);
  }

  for (const path of [
    "package.json",
    "browser/engine.js",
    "dist/src/index.d.ts",
    "dist/core.js",
    "dist/src/core.d.ts",
    "dist/wasm-runtime.js",
    "dist/src/wasm/index.d.ts",
    "dist/experimental.js",
    "dist/src/experimental/index.d.ts",
    "dist/net.js",
    "dist/src/net/index.d.ts",
    "dist/protocol.js",
    "dist/src/protocol/index.d.ts",
    "dist/server.js",
    "dist/src/server/index.d.ts",
    "dist/mmo.js",
    "dist/src/mmo/index.d.ts",
    "dist/render.js",
    "dist/src/render/index.d.ts",
    "dist/render-3d.js",
    "dist/src/render/3d.d.ts",
    "dist/render-3d-core.js",
    "dist/src/render/3d-core.d.ts",
    "dist/render-3d-scene.js",
    "dist/src/render/3d-scene.d.ts",
    "dist/render-3d-webgl2.js",
    "dist/src/render/3d-webgl2.d.ts",
    "dist/physics-3d.js",
    "dist/src/physics/3d.d.ts",
    "dist/physics-2d.js",
    "dist/src/physics/2d.d.ts",
    "dist/physics-rigid-3d.js",
    "dist/src/physics/rigid-3d.d.ts",
    "dist/motion.js",
    "dist/src/motion/index.d.ts",
    "dist/motion-three.js",
    "dist/src/motion/three.d.ts",
    "dist/migrations.js",
    "dist/src/migrations/index.d.ts",
    "dist/project.js",
    "dist/src/project/index.d.ts",
    "dist/project-runtime-2d.js",
    "dist/src/project/runtime-2d.d.ts",
    "dist/project-runtime-timeline-2d.js",
    "dist/src/project/runtime-timeline-2d.d.ts",
    "dist/project-runtime-navigation-2d.js",
    "dist/src/project/runtime-navigation-2d.d.ts",
    "dist/project-runtime-save-2d.js",
    "dist/src/project/runtime-save-2d.d.ts",
    "dist/project-runtime-story-2d.js",
    "dist/src/project/runtime-story-2d.d.ts",
    "dist/project-runtime-3d.js",
    "dist/src/project/runtime-3d.d.ts",
    "dist/project-filesystem.js",
    "dist/src/project/filesystem.d.ts",
    "dist/project-neutral-export.js",
    "dist/src/project/neutral-export.d.ts",
    "dist/navigation.js",
    "dist/src/navigation/index.d.ts",
    "dist/content.js",
    "dist/src/content/index.d.ts",
    "dist/save.js",
    "dist/src/save/index.d.ts",
    "dist/save-browser.js",
    "dist/src/save/browser.d.ts",
    "dist/audio.js",
    "dist/src/audio/index.d.ts",
    "dist/effects.js",
    "dist/src/effects/index.d.ts",
    "dist/ui.js",
    "dist/src/ui/index.d.ts",
    "dist/ui-core.js",
    "dist/src/ui/core.d.ts",
    "dist/assets/loader.js",
    "dist/src/assets/loader.d.ts",
    "dist/assets/gltf-static.js",
    "dist/src/assets/gltf-static.d.ts",
    "dist/assets/gltf-skin-animation.js",
    "dist/src/assets/gltf-skin-animation.d.ts",
    "dist/assets/templates.js",
    "dist/src/assets/templates/index.d.ts",
    "dist/post-processing-prototype.js",
    "dist/src/canvas/post-processing-prototype.d.ts",
    "docs/architectural-resilience-matrix.md",
    "docs/schema/editor-project-v2.schema.json",
    "docs/licensing-model.md",
    "wasm/collision-kernel.wasm",
    "wasm/collision-kernel.wasm.d.ts",
    "wasm/collision-kernel.scalar.wasm",
    "wasm/collision-kernel.simd.wasm",
    "readme.md",
    "third-party-notices.md",
  ]) {
    assert(packedFiles.has(path), `package tarball would omit ${path}`);
  }

  const allowedPackedFiles = new Set([
    "package.json",
    ...expectedBrowserPackageFiles,
    ...expectedPackageFiles.filter((path) => path !== "dist/src/"),
  ]);
  const unexpectedPackedFiles = [...packedFiles].filter(
    (path) =>
      !allowedPackedFiles.has(path) &&
      !(path.startsWith("dist/src/") && (path.endsWith(".d.ts") || path.endsWith(".d.ts.map"))),
  );
  assert(
    unexpectedPackedFiles.length === 0,
    [
      "package tarball contains files outside the public artifact allowlist:",
      ...unexpectedPackedFiles.map((path) => `- ${path}`),
    ].join("\n"),
  );

  const consumerDir = mkdtempSync(join(tmpdir(), "catalog-engine-consumer-"));
  try {
    const tarballOutput = await $`${npmCommand} pack --json --pack-destination ${packDir}`.cwd(rootDir).text();
    const tarballPath = join(packDir, readTarballFilename(tarballOutput));
    const tscPath = findAncestorTool(rootDir, join("node_modules", ".bin", process.platform === "win32" ? "tsc.exe" : "tsc"));
    const threePath = join(rootDir, "node_modules", "three");
    const threeTypesPath = join(rootDir, "node_modules", "@types", "three");
    const threeTypesRequire = createRequire(join(realpathSync(threeTypesPath), "package.json"));
    const localPeerPackages = {
      three: threePath,
      "@types/three": threeTypesPath,
      "@tweenjs/tween.js": dirname(threeTypesRequire.resolve("@tweenjs/tween.js/package.json")),
      "@types/stats.js": dirname(threeTypesRequire.resolve("@types/stats.js/package.json")),
      "@types/webxr": dirname(threeTypesRequire.resolve("@types/webxr/package.json")),
      fflate: dirname(threeTypesRequire.resolve("fflate/package.json")),
      meshoptimizer: dirname(threeTypesRequire.resolve("meshoptimizer/package.json")),
    };

    assert(tscPath, "local TypeScript install is required for offline consumer typecheck");
    assert(existsSync(threePath), "local Three.js install is required for the offline render/3d consumer");
    assert(existsSync(threeTypesPath), "local Three.js type install is required for the offline render/3d consumer");
    for (const [packageName, packagePath] of Object.entries(localPeerPackages)) {
      assert(existsSync(packagePath), `local ${packageName} install is required for the offline render/3d type consumer`);
    }

    writeFileSync(
      join(consumerDir, "package.json"),
      JSON.stringify(
        {
          type: "module",
          dependencies: {
            "@hyperfocus/engine": tarballPath,
          },
        },
        null,
        2,
      ),
    );
    writeFileSync(
      join(consumerDir, "tsconfig.json"),
      JSON.stringify(
        {
          compilerOptions: {
            lib: ["ES2022", "DOM"],
            module: "ESNext",
            moduleResolution: "Bundler",
            noEmit: true,
            skipLibCheck: false,
            strict: true,
            target: "ES2022",
          },
          include: [
            "consumer.ts",
            "core-consumer.ts",
            "browser-consumer.ts",
            "net-consumer.ts",
            "protocol-consumer.ts",
            "server-consumer.ts",
            "mmo-consumer.ts",
            "render-consumer.ts",
            "render-3d-consumer.ts",
            "render-3d-core-consumer.ts",
            "render-3d-scene-consumer.ts",
            "render-3d-webgl2-consumer.ts",
            "physics-3d-consumer.ts",
            "physics-2d-consumer.ts",
            "physics-rigid-3d-consumer.ts",
            "motion-consumer.ts",
            "motion-three-consumer.ts",
            "migrations-consumer.ts",
            "project-consumer.ts",
            "project-runtime-2d-consumer.ts",
            "project-runtime-timeline-2d-consumer.ts",
            "project-runtime-navigation-2d-consumer.ts",
            "project-runtime-save-2d-consumer.ts",
            "project-runtime-story-2d-consumer.ts",
            "project-runtime-3d-consumer.ts",
            "project-filesystem-consumer.ts",
            "project-neutral-export-consumer.ts",
            "navigation-consumer.ts",
            "content-consumer.ts",
            "save-consumer.ts",
            "save-browser-consumer.ts",
            "audio-consumer.ts",
            "effects-consumer.ts",
            "subpath-negative-consumer.ts",
            "ui-consumer.ts",
            "ui-core-consumer.ts",
            "asset-loader-consumer.ts",
            "gltf-static-consumer.ts",
            "gltf-skin-animation-consumer.ts",
            "template-assets-consumer.ts",
            "prototype-post-processing-consumer.ts",
          ],
        },
        null,
        2,
      ),
    );
    writeFileSync(
      join(consumerDir, "tsconfig.nodenext.json"),
      JSON.stringify(
        {
          compilerOptions: {
            lib: ["ES2022", "DOM"],
            module: "NodeNext",
            moduleResolution: "NodeNext",
            noEmit: true,
            skipLibCheck: false,
            strict: true,
            target: "ES2022",
          },
          include: [
            "consumer.ts",
            "core-consumer.ts",
            "browser-consumer.ts",
            "net-consumer.ts",
            "protocol-consumer.ts",
            "server-consumer.ts",
            "mmo-consumer.ts",
            "render-consumer.ts",
            "render-3d-consumer.ts",
            "render-3d-core-consumer.ts",
            "render-3d-scene-consumer.ts",
            "render-3d-webgl2-consumer.ts",
            "physics-3d-consumer.ts",
            "physics-2d-consumer.ts",
            "physics-rigid-3d-consumer.ts",
            "motion-consumer.ts",
            "motion-three-consumer.ts",
            "migrations-consumer.ts",
            "project-consumer.ts",
            "project-runtime-2d-consumer.ts",
            "project-runtime-timeline-2d-consumer.ts",
            "project-runtime-navigation-2d-consumer.ts",
            "project-runtime-save-2d-consumer.ts",
            "project-runtime-story-2d-consumer.ts",
            "project-runtime-3d-consumer.ts",
            "project-filesystem-consumer.ts",
            "project-neutral-export-consumer.ts",
            "navigation-consumer.ts",
            "content-consumer.ts",
            "save-consumer.ts",
            "save-browser-consumer.ts",
            "audio-consumer.ts",
            "effects-consumer.ts",
            "subpath-negative-consumer.ts",
            "ui-consumer.ts",
            "ui-core-consumer.ts",
            "asset-loader-consumer.ts",
            "gltf-static-consumer.ts",
            "gltf-skin-animation-consumer.ts",
            "template-assets-consumer.ts",
            "prototype-post-processing-consumer.ts",
          ],
        },
        null,
        2,
      ),
    );
    writeFileSync(
      join(consumerDir, "core-consumer.ts"),
      [
        'import { circleRectOverlap, createAabb, createCollisionBroadphase, createObjectPool, createStage, gridKey } from "@hyperfocus/engine/core";',
        "",
        "const key: string = gridKey({ x: 2, y: 3 });",
        "const hit: boolean = circleRectOverlap({ x: 0, y: 0, r: 4 }, { x: 2, y: 2, w: 8, h: 8 });",
        "const broadphase = createCollisionBroadphase<string>();",
        "broadphase.upsert('player', createAabb(0, 0, 10, 10));",
        "broadphase.upsert('coin', createAabb(8, 8, 2, 2));",
        "const pool = createObjectPool({ create: () => ({ active: false }), reset: (item) => { item.active = false; } });",
        "const entity = pool.acquire();",
        "entity.active = true;",
        "const stage = createStage<typeof entity>();",
        "stage.spawn(entity);",
        "if (key !== '2,3' || hit !== true || broadphase.pairs().length !== 1 || stage.count() !== 1) throw new Error('unexpected core result');",
      ].join("\n"),
    );
    writeFileSync(
      join(consumerDir, "consumer.ts"),
      [
        'import { circleRectOverlap, createAabb, createAnimationClip, createAnimationPlayer, createAtlasClip, createCamera, createCollisionBroadphase, createCollisionKernel, createFixedStepLoop, createTextureAtlas, createTileset, extractCollisionRects, GameMap, generateTileMap, getTileAt, resolveCollisionKernelWasmUrl, seededRandom, type AnimationClip, type Camera, type CollisionKernelOptions, type InitOptions, type KeyboardActionOptions, type MapMarker, type ScaleMode, type TextureAtlas, type TileMap } from "@hyperfocus/engine";',
        'import wasmPath from "@hyperfocus/engine/wasm/collision-kernel.wasm";',
        'import viteWasmPath from "@hyperfocus/engine/wasm/collision-kernel.wasm?url";',
        "",
        "const camera: Camera = createCamera({ viewportWidth: 320, viewportHeight: 180 });",
        "camera.pan(8, 4).zoomTo(2).setViewport(640, 360).clearFollow().update();",
        "const cameraX: number = camera.visibleRect().x;",
        "const gameMap = new GameMap({ shape: 'circle', pixelX: 0, pixelY: 0, width: 64, height: 64, zoom: 1, mode: 'FOLLOW_TARGET', borderStyle: false, compass: false });",
        "const mapMarkers: MapMarker[] = [{ id: 'player', worldX: 0, worldY: 0, color: '#fff' }];",
        "gameMap.update(0, 0, 0, 0);",
        "const mapPoint = gameMap.worldToMapSpace(mapMarkers[0].worldX, mapMarkers[0].worldY);",
        "const scaleMode: ScaleMode = 'fit';",
        "const initOptions: InitOptions = { width: 320, height: 180, scaleMode };",
        "const keyboardOptions: KeyboardActionOptions = { resetOnBlur: true };",
        "const loop = createFixedStepLoop({ update: () => undefined, render: () => undefined });",
        "loop.stop();",
        "const atlas: TextureAtlas = createTextureAtlas({ frames: { idle_0: { frame: { x: 0, y: 0, w: 8, h: 8 } }, idle_1: { frame: { x: 8, y: 0, w: 8, h: 8 } } } });",
        "const clip: AnimationClip = createAnimationClip({ id: 'idle', frames: ['idle_0', 'idle_1'], frameDurationMs: 100 });",
        "const player = createAnimationPlayer(clip, atlas).play().update(100);",
        "const atlasClip = createAtlasClip(atlas, ['idle_0', 'idle_1'], { framesPerSecond: 10 });",
        "const broadphase = createCollisionBroadphase<number>();",
        "broadphase.upsert(1, createAabb(0, 0, 10, 10));",
        "broadphase.upsert(2, createAabb(20, 20, 5, 5));",
        "const tileset = createTileset({ tileSize: 8, columns: 2, tileCount: 2, tiles: { 1: { tags: ['solid'], solid: true } } });",
        "const map: TileMap = generateTileMap({ tileset, width: 4, height: 4, baseTile: 0, seed: 'consumer-map', rules: [{ type: 'border', tile: 1 }] });",
        "const collisionRects = extractCollisionRects(map);",
        "const seeded = seededRandom('consumer-map')();",
        "const overlaps: boolean = circleRectOverlap({ x: 0, y: 0, r: 4 }, { x: 2, y: 2, w: 8, h: 8 });",
        "const defaultWasmUrl: string = resolveCollisionKernelWasmUrl();",
        "const kernelOptions: CollisionKernelOptions = { url: String(wasmPath), onFallback: (diagnostic) => { if (diagnostic.reason === 'fetch') console.info(diagnostic.url); } };",
        "const viteWasmUrl: string = String(viteWasmPath).replaceAll('\\\\', '/');",
        "if (!defaultWasmUrl.endsWith('/wasm/collision-kernel.wasm')) throw new Error('unexpected default wasm url');",
        "if (!viteWasmUrl.endsWith('/wasm/collision-kernel.wasm')) throw new Error('unexpected Vite wasm url');",
        "const kernel = await createCollisionKernel(kernelOptions);",
        "const maybeFastOverlap: boolean = kernel.circleRectOverlap({ x: 0, y: 0, r: 1 }, { x: 5, y: 5, w: 1, h: 1 });",
        "if (!Number.isFinite(cameraX) || mapPoint.x !== 32 || mapPoint.y !== 32 || initOptions.scaleMode !== 'fit' || keyboardOptions.resetOnBlur !== true || player.getCurrentAtlasFrame()?.name !== 'idle_1' || atlasClip.update(0.1).name !== 'idle_1' || broadphase.query(createAabb(1, 1, 1, 1))[0] !== 1 || getTileAt(map, 0, 0)?.tileId !== 1 || collisionRects.length === 0 || !Number.isFinite(seeded) || overlaps !== true || maybeFastOverlap !== false) throw new Error('unexpected engine result');",
      ].join("\n"),
    );
    writeFileSync(
      join(consumerDir, "browser-consumer.ts"),
      [
        'import { createFixedStepLoop, init } from "@hyperfocus/engine/browser";',
        "",
        "const options: Parameters<typeof init>[0] = { width: 320, height: 180 };",
        "const loop = createFixedStepLoop({ update: () => undefined, render: () => undefined });",
        "loop.stop();",
        "if (typeof init !== 'function' || options.width !== 320) throw new Error('unexpected browser subpath result');",
      ].join("\n"),
    );
    writeFileSync(
      join(consumerDir, "net-consumer.ts"),
      [
        'import { createMemoryPeerGroup, createSharedStore, createRollbackLoop, type PeerGroup } from "@hyperfocus/engine/net";',
        "",
        "const a: PeerGroup = createMemoryPeerGroup({ lobbyId: 'consumer', peerId: 'a' });",
        "const b = createMemoryPeerGroup({ lobbyId: 'consumer', peerId: 'b' });",
        "const store = createSharedStore({ players: { a: { color: 'red' } } });",
        "store.players.a.color = 'blue';",
        "let state = { x: 0 };",
        "const loop = createRollbackLoop({ peerIds: ['a'], localPeerId: 'a', defaultInput: 0, getLocalInput: () => 1, getState: () => state, setState: (next) => { state = next; }, update: (inputs) => { state.x += inputs.a; } });",
        "loop.tick();",
        "if (a.peers()[0]?.id !== 'b' || b.peers()[0]?.id !== 'a' || store.players.a.color !== 'blue' || state.x !== 1) throw new Error('unexpected net result');",
        "a.close();",
        "b.close();",
      ].join("\n"),
    );
    writeFileSync(
      join(consumerDir, "protocol-consumer.ts"),
      [
        'import { defineSchema, encodeSnapshot, decodeSnapshot, encodeDelta, decodeDelta, encodeReplicationFrame, decodeReplicationFrame } from "@hyperfocus/engine/protocol";',
        "",
        "const schema = defineSchema<{ id: string; x: number; hp: number }>({ id: 'string:16', x: 'f32', hp: 'u16' });",
        "const before = { id: 'p1', x: 1, hp: 10 };",
        "const after = { id: 'p1', x: 2, hp: 10 };",
        "const snapshot = encodeSnapshot(schema, before);",
        "const decoded = decodeSnapshot<typeof before>(schema, snapshot);",
        "const delta = encodeDelta(schema, before, after);",
        "const frame = decodeReplicationFrame(encodeReplicationFrame({ kind: 'delta', sequence: 1, baseline: 0, bytes: delta }));",
        "if (decoded.id !== 'p1' || frame.sequence !== 1 || decodeDelta(schema, before, frame.bytes).x !== 2) throw new Error('unexpected protocol result');",
      ].join("\n"),
    );
    writeFileSync(
      join(consumerDir, "server-consumer.ts"),
      [
        'import { SignedSessionAuthority, createAuthoritativeServer, createDurableMmoServices, createGracefulDrainController, createMemoryDurableServiceStore, createRoomType, createInterestGrid, createMmo1000Preset, createMmoInterestGrid, createPortableMemoryPersistenceAdapter, createPortablePersistenceBackup, createServerOperations, createSignedSessionAuthority, restorePortablePersistenceBackup, type PortablePersistenceSnapshot, type ServerOperationsHealth } from "@hyperfocus/engine/server";',
        'import { defineSchema } from "@hyperfocus/engine/protocol";',
        "",
        "const room = createRoomType<{ ticks: number }>({ name: 'field', schema: defineSchema<{ ticks: number }>({ ticks: 'u16' }), createState: () => ({ ticks: 0 }), update: (ctx) => { ctx.state.ticks += 1; } });",
        "const scale = createMmo1000Preset({ publicRoomType: 'field', publicRoomPrefix: 'field', publicRooms: 1, playersPerRoom: 2 });",
        "const server = createAuthoritativeServer({ transport: 'websocket', port: 0, rooms: [room], scale });",
        "await server.tick();",
        "const grid = createInterestGrid({ cellSize: 32 });",
        "const mmoGrid = createMmoInterestGrid();",
        "grid.upsert({ id: 'e1', x: 0, y: 0 });",
        "mmoGrid.upsert({ id: 'm1', x: 0, y: 0 });",
        "const state = server.rooms()[0].ctx.state as { ticks: number };",
        "const secret = new Uint8Array(32).fill(7);",
        "let nonce = 0;",
        "const persistence = createPortableMemoryPersistenceAdapter();",
        "const directSessions = createSignedSessionAuthority({ issuer: 'consumer-game', audience: 'consumer-server', keys: [{ id: 'active', secret }], activeKeyId: 'active' }); if (!(directSessions instanceof SignedSessionAuthority)) throw new Error('unexpected direct session authority');",
        "await persistence.savePlayer('player-1', { score: 3 });",
        "const operations = createServerOperations({ sessions: { issuer: 'consumer-game', audience: 'consumer-server', keys: [{ id: 'active', secret }], activeKeyId: 'active', nonce: () => `consumer-${++nonce}` }, persistence });",
        "const durable = createDurableMmoServices(createMemoryDurableServiceStore());",
        "await durable.inventory.grant('player-1', 'potion', 2, undefined, 'grant-1');",
        "await durable.economy.credit('player-1', 'gold', 20, 'system', 'credit-1');",
        "if (!(operations.sessions instanceof SignedSessionAuthority)) throw new Error('unexpected session authority');",
        "const token = await operations.sessions.issue('player-1', { attributes: { role: 'player' } });",
        "const identity = await operations.auth.verify(token);",
        "const backup = await operations.backup({ createdAt: 1 });",
        "await persistence.savePlayer('player-1', { score: 9 });",
        "const health: ServerOperationsHealth = operations.health({ rooms: 1, players: 1 });",
        "await operations.drain.shutdown(() => undefined, { drainTimeoutMs: 100, stopTimeoutMs: 100 });",
        "const restored: PortablePersistenceSnapshot = await operations.restore(backup);",
        "const directBackup = await createPortablePersistenceBackup(persistence, { createdAt: 2 });",
        "await restorePortablePersistenceBackup(persistence, directBackup);",
        "const standaloneDrain = createGracefulDrainController({ maxInFlight: 1 });",
        "await standaloneDrain.run('smoke', async () => undefined);",
        "await standaloneDrain.shutdown(() => undefined, { drainTimeoutMs: 100, stopTimeoutMs: 100 });",
        "if (state.ticks !== 1 || grid.query({ x: 0, y: 0, radius: 10 })[0] !== 'e1' || mmoGrid.query({ x: 0, y: 0, radius: 10 })[0] !== 'm1' || !identity.ok || identity.userId !== 'player-1' || health.status !== 'ok' || restored.players[0]?.id !== 'player-1' || (await persistence.loadPlayer('player-1') as { score: number }).score !== 3 || (await durable.inventory.list('player-1')).items[0]?.quantity !== 2 || await durable.economy.balance('player-1', 'gold') !== 20) throw new Error('unexpected server result');",
      ].join("\n"),
    );
    writeFileSync(
      join(consumerDir, "mmo-consumer.ts"),
      [
        'import { addMmoId, createEntityInterpolator, createInputMapper, createMmoClient, createMmoCombatModule, createMmoEntityCollectionBridge, createMmoEntityRegistry, createMmoGameplayKit, createMmoInterestSnapshotter, createMmoInventoryOps, createMmoPersistenceBridge, createMmoRoomType, createMmoWorld, findMmoEntityNearAim, findNearestMmoEntity, hasMmoId, moveMmoCircle, parseMmoIdSet, pointSegmentDistance, rectAroundPoint, removeMmoId, teleportMmoEntityToTile, useMmoConsumable } from "@hyperfocus/engine/mmo";',
        "",
        "const registry = createMmoEntityRegistry({ initialEntities: [{ id: 'p1', type: 'player', x: 0, y: 0, ownerId: 'p1', publicData: { name: 'Mira' }, ownerData: { gold: 3 } }, { id: 'loot-1', type: 'loot', x: 4, y: 0, ownerId: 'p1', visibility: 'owner', publicData: { itemId: 'gold' } }] });",
        "const snapshotter = createMmoInterestSnapshotter({ registry, defaultRadius: 32 });",
        "const snapshot = snapshotter.snapshotFor('p1', { x: 0, y: 0, radius: 32 });",
        "const bridge = createMmoEntityCollectionBridge({ entities: registry.all() });",
        "const inv = createMmoInventoryOps({ aliases: { berry: 'berries' } });",
        "const bag: Record<string, number> = {};",
        "inv.add(bag, 'berry', 2);",
        "const actor = { hp: 1, maxHp: 5 };",
        "const used = useMmoConsumable(actor, bag, 'berries', { berries: { apply: ({ actor }) => { actor.hp = actor.maxHp; } } });",
        "const flags = addMmoId(parseMmoIdSet(['seen']), 'ready');",
        "removeMmoId(flags, 'seen');",
        "const combat = createMmoCombatModule<{ id: string }, { hp: number }>({ mitigate: ({ amount }) => amount - 1 });",
        "const target = { hp: 4 };",
        "const hit = combat.damage({ id: 'a' }, target, 3);",
        "const mover = { x: 1, y: 1, radius: 1 };",
        "moveMmoCircle(mover, 2, 0, { rectBlocked: () => false, circleBlocked: () => false, blockedAt: () => false });",
        "const rect = rectAroundPoint(mover, 1);",
        "const teleport = teleportMmoEntityToTile(mover, 2, 3, 8);",
        "const nearest = findNearestMmoEntity({ x: 0, y: 0 }, [{ id: 'n', x: 3, y: 0 }]);",
        "const aimed = findMmoEntityNearAim({ x: 0, y: 0 }, { x: 4, y: 0 }, [{ id: 'a', x: 3, y: 1 }], { maxAimDistance: 2 });",
        "const segment = pointSegmentDistance({ x: 1, y: 1 }, { x: 0, y: 0 }, { x: 2, y: 0 });",
        "const kit = createMmoGameplayKit({ skills: [{ id: 'combat' }], lootTables: { goblin: [{ itemId: 'gold', min: 1, max: 1 }] }, quests: [{ id: 'first', goals: { talk: 1 } }] });",
        "const progress = { combat: { xp: 0, level: 1 } };",
        "kit.awardXp(progress, 'combat', 100);",
        "const world = createMmoWorld({ id: 'consumer-mmo', gameplay: kit });",
        "const persistence = createMmoPersistenceBridge<{ id: string }>({ key: (player) => player.userId });",
        "const room = createMmoRoomType({ name: 'room', world: {}, update: ({ ctx }) => { ctx.state.tick += 1; } });",
        "const client = createMmoClient<{ entities: Record<string, never> }>({ transport: { connect: async () => undefined, close: () => undefined, sendInput: () => undefined, onSnapshot: () => () => undefined } });",
        "const mapper = createInputMapper({ pointerActions: { primary: 'attack' } });",
        "const mapped = mapper.map({ pointer: { x: 4, y: 0, primaryDown: true }, actor: { x: 0, y: 0 }, candidates: [{ id: 'goblin', x: 8, y: 0, type: 'npc' }] });",
        "const interpolator = createEntityInterpolator();",
        "interpolator.pushSnapshot({ entities: snapshot.snapshot.entities }, 0);",
        "if (!snapshot.visibleIds.includes('loot-1') || bridge.ids({ viewerId: 'p1' }).length !== 2 || bridge.ids().length !== 1 || inv.get(bag, 'berries') !== 1 || !used.ok || !hasMmoId(flags, 'ready') || target.hp !== 2 || hit.amount !== 2 || rect.width !== 2 || !teleport.ok || nearest?.id !== 'n' || aimed?.id !== 'a' || segment !== 1 || progress.combat.level < 2 || world.id !== 'consumer-mmo' || persistence.keyFor({ id: 'p', userId: 'u' } as never) !== 'u' || room.name !== 'room' || typeof client.connect !== 'function' || mapped.action !== 'attack' || !interpolator.sample(0).p1) throw new Error('unexpected mmo result');",
      ].join("\n"),
    );
    writeFileSync(
      join(consumerDir, "render-consumer.ts"),
      [
        'import { createActorRenderer, createBarDrawCall, createCanvasRenderStage, createEffectQueue, createHudRenderer, createInteractionOutlineDrawCall, createLabelDrawCall, createRenderStage, createTextBlockDrawCall, createTileCacheRenderer, cullRenderCallsToRect, drawRenderable, resolveSpriteSheetFrame, sortRenderCallsByY, truncateText, wrapText, type RenderDrawContext } from "@hyperfocus/engine/render";',
        "",
        "const calls: string[] = [];",
        "const ctx = { canvas: { width: 64, height: 64 }, globalAlpha: 1, font: '10px sans-serif', save() {}, restore() {}, clearRect() {}, scale() {}, translate() {}, rotate() {}, beginPath() {}, closePath() {}, arc() {}, ellipse() {}, quadraticCurveTo() {}, bezierCurveTo() {}, fill() { calls.push('fill-path'); }, stroke() { calls.push('stroke'); }, moveTo() {}, lineTo() {}, setLineDash() {}, fillRect() { calls.push('fill'); }, strokeRect() { calls.push('stroke-rect'); }, drawImage() { calls.push('image'); }, fillText(text: string) { calls.push(text); }, strokeText() {}, measureText(text: string) { return { width: text.length * 8 }; } } as unknown as CanvasRenderingContext2D;",
        "const stage = createRenderStage(ctx, {});",
        "stage.addLayer('world', { sort: 'y-axis' });",
        "stage.setCamera({ x: 1, y: 2 });",
        "stage.pushMany('world', [{ kind: 'rect', x: 0, y: 0, width: 4, height: 4, fill: 'red' }]);",
        "const canvasStage = createCanvasRenderStage({ getContext: () => ctx });",
        "canvasStage.addLayer('hud', { ignoreCamera: true });",
        "const tileRenderer = createTileCacheRenderer({ image: { width: 16, height: 16 } as unknown as CanvasImageSource, tileWidth: 8, tileHeight: 8, columns: 2 });",
        "const actorRenderer = createActorRenderer({ width: 16, height: 16 });",
        "const hud = createHudRenderer();",
        "const effects = createEffectQueue();",
        "effects.push({ ttl: 1, draw: () => calls.push('effect') });",
        "const result = stage.render();",
        "const sorted = sortRenderCallsByY([{ kind: 'rect', x: 0, y: 4, width: 1, height: 1 }, { kind: 'rect', x: 0, y: 1, width: 1, height: 1 }]);",
        "const culled = cullRenderCallsToRect(sorted, { x: 0, y: 0, width: 10, height: 2 });",
        "const frame = resolveSpriteSheetFrame({ width: 64, height: 32, frameWidth: 16, frameHeight: 32, timeMs: 150, frameMs: 150 });",
        "const tile = tileRenderer.toDrawCall({ id: 1, tileX: 0, tileY: 0 });",
        "const actor = actorRenderer.toDrawCall({ x: 0, y: 0, label: 'Hero' });",
        "const drawState: RenderDrawContext = { camera: {}, layer: 'direct', layerOptions: { sort: 'none', ignoreCamera: true, order: 0 }, order: 0 };",
        "hud.render(ctx, [hud.text({ text: 'HP', x: 0, y: 0 }), createTextBlockDrawCall({ text: 'two words', x: 0, y: 10, maxWidth: 40 })]);",
        "const bar = drawRenderable(ctx, createBarDrawCall({ x: 0, y: 0, width: 10, height: 2, value: 1, max: 2, fill: 'red' }), drawState);",
        "const label = drawRenderable(ctx, createLabelDrawCall({ x: 0, y: 0, text: 'Name' }), drawState);",
        "const outline = drawRenderable(ctx, createInteractionOutlineDrawCall({ x: 0, y: 0, width: 10, height: 6, shape: 'ellipse' }), drawState);",
        "if (result.drawn !== 1 || canvasStage.flush().layers !== 1 || sorted.length !== 2 || culled.length !== 1 || frame?.frame !== 1 || !tile || !actor || !bar || !label || !outline || truncateText(ctx, 'abcdef', 24) !== '...' || wrapText(ctx, 'aa bb cc', 40).length !== 2) throw new Error('unexpected render result');",
      ].join("\n"),
    );
    writeFileSync(
      join(consumerDir, "render-3d-consumer.ts"),
      [
        'import { createThirdPersonCameraRig3D, createThreeRender3D, createToroidalWorld3D, type ThreeLikeGeometry, type ThreeLikeMaterial, type ThreeModuleLike } from "@hyperfocus/engine/render/3d";',
        "",
        "class Vec { x = 0; y = 0; z = 0; set(x: number, y: number, z: number) { this.x = x; this.y = y; this.z = z; } setScalar(value: number) { this.set(value, value, value); } }",
        "class Obj { position = new Vec(); rotation = { x: 0, y: 0, z: 0 }; scale = new Vec(); visible = true; children: Obj[] = []; add(...items: Obj[]) { this.children.push(...items); } remove(...items: Obj[]) { this.children = this.children.filter((item) => !items.includes(item)); } updateMatrix() {} }",
        "class Camera extends Obj { aspect = 1; fov = 55; near = 0.1; far = 1000; lookAt() {}; updateProjectionMatrix() {} }",
        "class Renderer { domElement = { width: 64, height: 64, clientWidth: 64, clientHeight: 64 } as HTMLCanvasElement; renders = 0; setPixelRatio() {}; setSize(width: number, height: number) { this.domElement.width = width; this.domElement.height = height; }; setClearColor() {}; render() { this.renders += 1; }; dispose() {} }",
        "class Geometry implements ThreeLikeGeometry {}",
        "class Material implements ThreeLikeMaterial {}",
        "class Action { stopped = false; enabled = false; looped = false; weight = 1; timeScale = 1; reset() { return this; } fadeIn() { return this; } fadeOut() { return this; } play() { return this; } stop() { this.stopped = true; return this; } }",
        "class Mixer { actions: Action[] = []; clipAction() { const action = new Action(); this.actions.push(action); return action; } update() {} stopAllAction() {} }",
        "class Mesh extends Obj { constructor(public geometry: ThreeLikeGeometry, public material: ThreeLikeMaterial) { super(); } }",
        "class Matrix { elements: number[] = []; fromArray(values: ArrayLike<number>) { this.elements = Array.from({ length: 16 }, (_, index) => values[index] ?? 0); } }",
        "class InstancedMesh extends Obj { instanceMatrix = { needsUpdate: false }; constructor(public geometry: ThreeLikeGeometry, public material: ThreeLikeMaterial, public count: number) { super(); } setMatrixAt() {} }",
        "const three = { WebGLRenderer: Renderer, Scene: Obj, Group: Obj, PerspectiveCamera: Camera, OrthographicCamera: Camera, Color: class { constructor(public color: unknown) {} }, AmbientLight: Obj, HemisphereLight: Obj, DirectionalLight: Obj, PointLight: Obj, BoxGeometry: Geometry, SphereGeometry: Geometry, Mesh, InstancedMesh, Matrix4: Matrix, MeshBasicMaterial: Material, AnimationMixer: Mixer } as unknown as ThreeModuleLike;",
        "const view = await createThreeRender3D({ three, width: 64, height: 64 });",
        "view.registerMesh('hero', { geometry: new Geometry(), material: new Material() });",
        "const world = createToroidalWorld3D({ width: 100, depth: 60, origin: [-50, -30] });",
        "const wrapped = world.wrapPosition([55, 2, -31]);",
        "const delta = world.shortestDelta([48, 0, 0], [-48, 0, 0]);",
        "const offsets = world.visibleDuplicateOffsets([-48, 0, 28], 6);",
        "const rigState = createThirdPersonCameraRig3D({ pitch: 0, distance: 10, smoothing: { follow: 0, rotation: 0, distance: 0, collision: 0 }, collision: { enabled: false } }).pan([1, 0, 0]).setShoulderOffset(0.5).orbit(0.2, 0.1).snapTo({ distance: 12 }).snapshot();",
        "const animation = view.createAnimationController(new Obj(), [{ name: 'idle' }], { initial: 'idle' });",
        "const ragdoll = view.createRagdoll({ position: [0, 0, 0], incomingForce: [1, 0, 0], ttl: 0.1 });",
        "const result = view.render({ camera: { kind: 'perspective', position: [0, 12, 18], target: [0, 0, 0] }, calls: [{ kind: 'mesh', mesh: 'hero', transform: { position: [1, 2, 3] } }] });",
        "if (result.calls !== 1 || wrapped[0] !== -45 || wrapped[2] !== 29 || delta[0] !== 4 || offsets.length !== 3 || rigState.distance !== 12 || rigState.position.length !== 3 || !animation.play('idle') || !ragdoll.update(0.05) || typeof view.loadAddon !== 'function') throw new Error('unexpected render/3d result');",
      ].join("\n"),
    );
    writeFileSync(
      join(consumerDir, "physics-3d-consumer.ts"),
      [
        'import { applyOverTime, collidersOverlap3D, createKinematicCharacter3D, placeOnGround3D, rubberBand, submersionRatio, type HeightField3D } from "@hyperfocus/engine/physics/3d";',
        'import * as root from "@hyperfocus/engine";',
        "",
        "const heightField: HeightField3D = { heightAt: (x, z) => x + z };",
        "const placed = placeOnGround3D([1, 99, 2], heightField, { yOffset: 0.5 });",
        "const player = { kind: 'capsule' as const, a: [0, 0, 0] as const, b: [0, 2, 0] as const, radius: 0.5 };",
        "const water = submersionRatio(player, 1);",
        "const overlap = collidersOverlap3D(player, { kind: 'box', center: [0.5, 1, 0], halfSize: [0.5, 1, 0.5] });",
        "const actor = createKinematicCharacter3D({ heightField: { heightAt: () => 0 }, gravity: 10, groundSnap: 0.1 });",
        "actor.addForce([2, 0, 0]);",
        "actor.addForce([1, 0, 0], { continuous: true, durationMs: 100, damping: 4 });",
        "actor.applyOverTime(100, () => undefined);",
        "actor.rubberBand(100, () => undefined);",
        "actor.step(0.1);",
        "const values: number[] = [];",
        "const timed = applyOverTime(100, (ratio) => { values.push(ratio); });",
        "const band = rubberBand(100, (ratio) => { values.push(ratio); });",
        "timed.update(0.1);",
        "band.update(0.05);",
        "band.update(0.05);",
        "if ('createKinematicCharacter3D' in root || placed.y !== 3.5 || !overlap || water <= 0 || actor.state.position.x <= 0 || values.at(-1) !== 0) throw new Error('unexpected physics/3d result');",
      ].join("\n"),
    );
    writeFileSync(
      join(consumerDir, "render-3d-core-consumer.ts"),
      [
        'import { TransformHierarchy3D, createFrustumPlanes3D, createMat4, extractFrustumPlanes3D, perspectiveMat4 } from "@hyperfocus/engine/render/3d-core";',
        "const hierarchy = new TransformHierarchy3D(2);",
        "const root = hierarchy.create();",
        "hierarchy.setPosition(root, 1, 2, 3);",
        "hierarchy.updateWorldMatrices();",
        "const projection = perspectiveMat4(createMat4(), { fovYRadians: Math.PI / 3, aspect: 1, near: 0.1, far: 100 });",
        "const frustum = extractFrustumPlanes3D(createFrustumPlanes3D(), projection);",
        "if (root !== 0 || hierarchy.count !== 1 || frustum.length !== 24) throw new Error('unexpected first-party 3D core result');",
      ].join("\n"),
    );
    writeFileSync(
      join(consumerDir, "physics-2d-consumer.ts"),
      [
        'import { PHYSICS_DEBUG_SEGMENT_STRIDE, createPhysicsWorld2D } from "@hyperfocus/engine/physics/2d";',
        "const world = createPhysicsWorld2D({ capacity: 2, gravityY: 0 });",
        "world.addBody({ id: 'wall', type: 'static', shape: { kind: 'box', halfWidth: 1, halfHeight: 1 }, x: 4 });",
        "world.addBody({ id: 'ball', shape: { kind: 'circle', radius: 1 }, x: 1, velocityX: 2 });",
        "world.step(0.1);",
        "const hit = world.raycast(0, 0, 1, 0, 10);",
        "const debug = new Float32Array(world.debugSegmentCount(4) * PHYSICS_DEBUG_SEGMENT_STRIDE);",
        "if (hit?.id !== 'ball' || world.writeDebugSegments(debug, 4) < 1) throw new Error('unexpected first-party 2D physics result');",
      ].join("\n"),
    );
    writeFileSync(
      join(consumerDir, "physics-rigid-3d-consumer.ts"),
      [
        'import { RIGID_DEBUG_SEGMENT_STRIDE_3D, createRigidWorld3D } from "@hyperfocus/engine/physics/rigid-3d";',
        "const world = createRigidWorld3D({ capacity: 2, gravityY: 0 });",
        "world.addBody({ id: 'wall', type: 'static', shape: { kind: 'box', halfX: 1, halfY: 1, halfZ: 1 }, x: 4 });",
        "world.addBody({ id: 'ball', shape: { kind: 'sphere', radius: 1 }, x: 1, velocityX: 2 });",
        "world.step(0.1);",
        "const output = new Float32Array(world.debugSegmentCount() * RIGID_DEBUG_SEGMENT_STRIDE_3D);",
        "if (world.writeDebugSegments(output) < 1) throw new Error('unexpected rigid 3D result');",
      ].join("\n"),
    );
    writeFileSync(
      join(consumerDir, "render-3d-scene-consumer.ts"),
      [
        'import { createBoundedScene3D, createRenderCommandBuffer3D } from "@hyperfocus/engine/render/3d-scene";',
        "const scene = createBoundedScene3D({ transforms: 1, meshes: 1, materials: 1, lights: 0, instances: 1 });",
        "const transform = scene.transforms.create();",
        "const mesh = scene.registerMesh({ positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]) });",
        "const material = scene.createMaterial({ baseColor: [1, 0, 0, 1] });",
        "scene.createInstance({ mesh, material, transform });",
        "const commands = scene.compile(createRenderCommandBuffer3D({ commands: 1, instances: 1, lights: 0 }));",
        "if (commands.commandCount !== 1 || commands.instanceCount !== 1) throw new Error('unexpected first-party 3D scene result');",
      ].join("\n"),
    );
    writeFileSync(
      join(consumerDir, "render-3d-webgl2-consumer.ts"),
      [
        'import { createWebGl2Renderer3D, supportsWebGl2Renderer3D } from "@hyperfocus/engine/render/3d-webgl2";',
        "if (typeof createWebGl2Renderer3D !== 'function' || supportsWebGl2Renderer3D() !== false) throw new Error('unexpected first-party WebGL2 surface');",
      ].join("\n"),
    );
    writeFileSync(
      join(consumerDir, "motion-consumer.ts"),
      [
        'import { createPoseBuffer, createPoseBufferLayout, sampleCanonicalHumanoidGait } from "@hyperfocus/engine/motion";',
        'import * as root from "@hyperfocus/engine";',
        "",
        "const pose = createPoseBuffer(createPoseBufferLayout(2, 3));",
        "const gait = sampleCanonicalHumanoidGait(0.25);",
        "if ('createPoseBuffer' in root || pose.totalCount !== 3 || gait.footLift <= 0) throw new Error('unexpected motion result');",
      ].join("\n"),
    );
    writeFileSync(
      join(consumerDir, "motion-three-consumer.ts"),
      [
        'import { Bone, Skeleton } from "three";',
        'import { describeThreeSkeleton } from "@hyperfocus/engine/motion/three";',
        "",
        "const bone = new Bone();",
        "bone.name = 'Hips';",
        "const source = describeThreeSkeleton(new Skeleton([bone]));",
        "if (source.bones.length !== 1 || source.normalization.metersPerUnit !== 1) throw new Error('unexpected motion/three result');",
      ].join("\n"),
    );
    writeFileSync(
      join(consumerDir, "migrations-consumer.ts"),
      [
        'import { migrateT3RigDocument, t3RigMigrations } from "@hyperfocus/engine/migrations";',
        "",
        "if (typeof migrateT3RigDocument !== 'function' || !Array.isArray(t3RigMigrations)) throw new Error('unexpected migrations result');",
      ].join("\n"),
    );
    writeFileSync(
      join(consumerDir, "subpath-negative-consumer.ts"),
      [
        'import * as root from "@hyperfocus/engine";',
        'import * as browser from "@hyperfocus/engine/browser";',
        "",
        `const blockedExports = ${JSON.stringify(Object.values(rootBrowserSubpathOnlyValueExports).flat())} as const;`,
        "",
        "for (const exportName of blockedExports) {",
        "  if (exportName in root) throw new Error(`${exportName} leaked through @hyperfocus/engine`);",
        "  if (exportName in browser) throw new Error(`${exportName} leaked through @hyperfocus/engine/browser`);",
        "}",
      ].join("\n"),
    );
    writeFileSync(
      join(consumerDir, "ui-consumer.ts"),
      [
        'import { createMmoUiShell, darkFantasyMmoUiTheme, type MmoUiShellConfig } from "@hyperfocus/engine/ui";',
        "",
        "const config: MmoUiShellConfig = { login: false, title: 'Realm' };",
        "if (typeof createMmoUiShell !== 'function' || darkFantasyMmoUiTheme.radius !== '8px' || config.title !== 'Realm') throw new Error('unexpected ui result');",
      ].join("\n"),
    );
    writeFileSync(
      join(consumerDir, "ui-core-consumer.ts"),
      [
        'import { createMmoUiController, type MmoUiControllerState } from "@hyperfocus/engine/ui/core";',
        "",
        "const controller = createMmoUiController({ status: 'Ready' });",
        "const state: MmoUiControllerState = controller.getSnapshot();",
        "controller.actions.setStatus('Online');",
        "if (state.status !== 'Ready' || controller.getSnapshot().status !== 'Online') throw new Error('unexpected UI controller state');",
      ].join("\n"),
    );
    writeFileSync(
      join(consumerDir, "asset-loader-consumer.ts"),
      [
        'import { createAssetLoader, createAssetLoadSnapshot, createSmoothedAssetProgress, type AssetLoadSnapshot } from "@hyperfocus/engine/assets/loader";',
        'import * as root from "@hyperfocus/engine";',
        "",
        "const loader = createAssetLoader([{ id: 'hero', load: () => 7 }]);",
        "const value = await loader.loadAsset('hero', (asset) => { if (typeof asset !== 'number') throw new TypeError('hero asset must be a number'); return asset; });",
        "const base: AssetLoadSnapshot = createAssetLoadSnapshot({ status: 'loading', actualProgress: 0.5, startedAt: 1, updatedAt: 1 });",
        "const smoother = createSmoothedAssetProgress({ speed: 4, minAdvancePerSecond: 0, now: () => 0 });",
        "const smoothed = smoother.update(base, 0);",
        "if ('createAssetLoader' in root || value !== 7 || smoothed.visibleProgress !== 0) throw new Error('unexpected asset loader result');",
      ].join("\n"),
    );
    writeFileSync(
      join(consumerDir, "gltf-static-consumer.ts"),
      [
        'import { cookGltfStaticMeshes, resolveGltfStaticBuffers } from "@hyperfocus/engine/assets/gltf-static";',
        "if (typeof cookGltfStaticMeshes !== 'function' || typeof resolveGltfStaticBuffers !== 'function') throw new Error('unexpected glTF cooker surface');",
      ].join("\n"),
    );
    writeFileSync(
      join(consumerDir, "gltf-skin-animation-consumer.ts"),
      [
        'import { cookGltfSkinAnimations, createGltfPoseOutput, evaluateGltfAnimationPose, resolveAndCookGltfSkinAnimations } from "@hyperfocus/engine/assets/gltf-skin-animation";',
        "if (typeof cookGltfSkinAnimations !== 'function' || typeof resolveAndCookGltfSkinAnimations !== 'function' || typeof createGltfPoseOutput !== 'function' || typeof evaluateGltfAnimationPose !== 'function') throw new Error('unexpected glTF skin/animation surface');",
      ].join("\n"),
    );
    writeFileSync(
      join(consumerDir, "template-assets-consumer.ts"),
      [
        'import { resolveTemplateAssetUrl, templateAssetManifest } from "@hyperfocus/engine/assets/templates";',
        "",
        "const embedded = resolveTemplateAssetUrl(templateAssetManifest[0].id);",
        "const path = resolveTemplateAssetUrl(templateAssetManifest[0].id, { baseUrl: '/assets', mode: 'path' });",
        "if (!embedded.startsWith('data:image/png;base64,') || !path.startsWith('/assets/')) throw new Error('unexpected template asset result');",
      ].join("\n"),
    );
    writeFileSync(
      join(consumerDir, "project-consumer.ts"),
      [
        'import { HYPERFOCUS_ASSETS_PATH, HYPERFOCUS_PROJECT_PATH, createHyperfocusProjectFiles, openHyperfocusProjectFiles } from "@hyperfocus/engine/project";',
        "",
        "const source = new Uint8Array([1, 2, 3]);",
        "const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', source))).map((value) => value.toString(16).padStart(2, '0')).join('');",
        "const files = await createHyperfocusProjectFiles({ assets: [{ id: 'data', name: 'data.bin', mimeType: 'application/octet-stream', size: 3, sha256: digest }] }, [{ id: 'data', name: 'data.bin', bytes: source }]);",
        "const opened = await openHyperfocusProjectFiles(files.projectJson, files.assetsArchive);",
        "if (HYPERFOCUS_PROJECT_PATH !== '.hyperfocus/project.json' || HYPERFOCUS_ASSETS_PATH !== '.hyperfocus/assets.hfp' || opened.assets[0]?.bytes[2] !== 3) throw new Error('unexpected portable project result');",
      ].join("\n"),
    );
    writeFileSync(
      join(consumerDir, "project-runtime-2d-consumer.ts"),
      [
        'import { createPlayableWorld } from "@hyperfocus/engine/project/runtime-2d";',
        "",
        "const world = createPlayableWorld({ activeSceneId: 'main', scenes: [{ id: 'main', entities: [] }], tilemap: { columns: 1, rows: 1, tileSize: 16, values: [0] }, settings: { input: [] } });",
        "world.step();",
        "if (world.tick !== 1 || world.snapshot().sceneId !== 'main') throw new Error('unexpected portable runtime result');",
      ].join("\n"),
    );
    writeFileSync(
      join(consumerDir, "project-runtime-timeline-2d-consumer.ts"),
      [
        'import { applyTimelineOverrides2D, createPlayableTimeline2D } from "@hyperfocus/engine/project/runtime-timeline-2d";',
        "",
        "const timeline = createPlayableTimeline2D({ timeline: { fps: 30, durationFrames: 30, loopStart: 0, loopEnd: 30, playbackSpeed: 1, tracks: [], audioTracks: [], events: [] } });",
        "const result = timeline.advance(1 / 30);",
        "const snapshot = applyTimelineOverrides2D({ version: 1, sceneId: 'main', tick: 0, simulationTimeSeconds: 0, entities: [] }, result.overrides);",
        "if (result.frame !== 1 || snapshot.sceneId !== 'main') throw new Error('unexpected portable timeline result');",
      ].join("\n"),
    );
    writeFileSync(
      join(consumerDir, "project-runtime-navigation-2d-consumer.ts"),
      [
        'import { auditNavigationProject2D, createNavigationBehaviorRegistry2D } from "@hyperfocus/engine/project/runtime-navigation-2d";',
        "const project = { activeSceneId: 'main', scenes: [{ id: 'main', entities: [{ id: 'agent', label: 'Agent', x: 5, y: 5, width: 2, height: 2, scale: 1, layer: 1, color: '#fff', accent: '#000', kind: 'actor', components: [{ id: 'nav', type: 'behavior', enabled: true, values: { module: 'builtin:navigate', targetX: 15, targetY: 5, speed: 10 } }] }] }], tilemap: { columns: 2, rows: 1, tileSize: 10, values: [0, 0] }, settings: { input: [] } };",
        "const registry = createNavigationBehaviorRegistry2D(project);",
        "if (auditNavigationProject2D(project).length !== 0 || typeof registry['builtin:navigate#update'] !== 'function') throw new Error('unexpected portable navigation result');",
      ].join("\n"),
    );
    writeFileSync(
      join(consumerDir, "project-runtime-save-2d-consumer.ts"),
      [
        'import { PLAYABLE_WORLD_SAVE_SCHEMA, createPlayableSaveController2D, validatePlayableSaveProject2D } from "@hyperfocus/engine/project/runtime-save-2d";',
        "if (PLAYABLE_WORLD_SAVE_SCHEMA !== 'portable-world-snapshot-v1' || typeof createPlayableSaveController2D !== 'function' || typeof validatePlayableSaveProject2D !== 'function') throw new Error('unexpected portable save runtime surface');",
      ].join("\n"),
    );
    writeFileSync(
      join(consumerDir, "project-runtime-story-2d-consumer.ts"),
      [
        'import { auditPlayableStoryProject2D, createPlayableStoryController2D } from "@hyperfocus/engine/project/runtime-story-2d";',
        "if (typeof auditPlayableStoryProject2D !== 'function' || typeof createPlayableStoryController2D !== 'function') throw new Error('unexpected portable story surface');",
      ].join("\n"),
    );
    writeFileSync(
      join(consumerDir, "project-runtime-3d-consumer.ts"),
      [
        'import { auditHyperfocus3DProject, createHyperfocus3DRuntime, hasHyperfocus3DProject } from "@hyperfocus/engine/project/runtime-3d";',
        "const empty = { extensions: {} };",
        "if (hasHyperfocus3DProject(empty) || auditHyperfocus3DProject(empty, []).length === 0 || typeof createHyperfocus3DRuntime !== 'function') throw new Error('unexpected portable 3D surface');",
      ].join("\n"),
    );
    writeFileSync(
      join(consumerDir, "project-filesystem-consumer.ts"),
      [
        'import { readHyperfocusProjectPair, recoverHyperfocusProjectPair, writeHyperfocusProjectPair } from "@hyperfocus/engine/project/filesystem";',
        "if (typeof readHyperfocusProjectPair !== 'function' || typeof recoverHyperfocusProjectPair !== 'function' || typeof writeHyperfocusProjectPair !== 'function') throw new Error('unexpected project filesystem surface');",
      ].join("\n"),
    );
    writeFileSync(
      join(consumerDir, "project-neutral-export-consumer.ts"),
      [
        'import { NEUTRAL_EXPORT_FORMAT, auditNeutralExport, createNeutralExportBundle } from "@hyperfocus/engine/project/neutral-export";',
        "if (NEUTRAL_EXPORT_FORMAT !== 'hyperfocus-neutral-export' || typeof auditNeutralExport !== 'function' || typeof createNeutralExportBundle !== 'function') throw new Error('unexpected neutral export surface');",
      ].join("\n"),
    );
    writeFileSync(
      join(consumerDir, "navigation-consumer.ts"),
      [
        'import { createGridNavigator } from "@hyperfocus/engine/navigation";',
        "const output = new Int32Array(4);",
        "const result = createGridNavigator({ columns: 2, rows: 2 }).findPath(0, 3, output);",
        "if (result.status !== 'found' || output[0] !== 0 || output[result.length - 1] !== 3) throw new Error('unexpected navigation result');",
      ].join("\n"),
    );
    writeFileSync(
      join(consumerDir, "content-consumer.ts"),
      [
        'import { createScenePrefabCatalog, createStoryCatalog } from "@hyperfocus/engine/content";',
        "const scene = createScenePrefabCatalog({ scenes: [{ id: 'main', entities: [] }] }).instantiateScene('main');",
        "const text = createStoryCatalog({ defaultLocale: 'en', locales: [{ locale: 'en', messages: { hello: 'Hello' } }] }).format('en', 'hello');",
        "if (scene.sceneId !== 'main' || text !== 'Hello') throw new Error('unexpected content result');",
      ].join("\n"),
    );
    writeFileSync(
      join(consumerDir, "save-consumer.ts"),
      [
        'import { createSaveProfile, withSaveSlot } from "@hyperfocus/engine/save";',
        "const profile = withSaveSlot(createSaveProfile('game', 'player', 1), 'auto', { x: 1 }, 0, 2);",
        "if (profile.slots[0]?.name !== 'auto') throw new Error('unexpected save result');",
      ].join("\n"),
    );
    writeFileSync(
      join(consumerDir, "save-browser-consumer.ts"),
      [
        'import { createIndexedDbSaveStorage, type IndexedDbSaveStorage, type IndexedDbSaveStorageOptions } from "@hyperfocus/engine/save/browser";',
        "const options: IndexedDbSaveStorageOptions = { databaseName: 'consumer', maxBytes: 1024 };",
        "const storage: IndexedDbSaveStorage | undefined = undefined;",
        "if (typeof createIndexedDbSaveStorage !== 'function' || storage !== undefined || options.maxBytes !== 1024) throw new Error('unexpected browser save surface');",
      ].join("\n"),
    );
    writeFileSync(
      join(consumerDir, "audio-consumer.ts"),
      [
        'import { chooseAudioLoadPolicy, computeSpatialAudio } from "@hyperfocus/engine/audio";',
        "if (chooseAudioLoadPolicy({ byteLength: 1_000, durationSeconds: 1 }).mode !== 'buffer' || computeSpatialAudio({ x: 0, y: 0 }, { x: 0, y: 0 }).gain !== 1) throw new Error('unexpected audio result');",
      ].join("\n"),
    );
    writeFileSync(
      join(consumerDir, "effects-consumer.ts"),
      [
        'import { PARTICLE_INSTANCE_STRIDE, createParticleEmitter2D, createTimeline } from "@hyperfocus/engine/effects";',
        "const values = new Float64Array(1);",
        "createTimeline({ duration: 1, tracks: [{ id: 'x', keyframes: [{ time: 0, value: 0 }, { time: 1, value: 2 }] }] }).sample(0.5, values);",
        "const emitter = createParticleEmitter2D({ capacity: 1, seed: 1 });",
        "emitter.emit(1);",
        "const instances = new Float32Array(PARTICLE_INSTANCE_STRIDE);",
        "if (values[0] !== 1 || emitter.writeInstances(instances) !== 1) throw new Error('unexpected effects result');",
      ].join("\n"),
    );
    writeFileSync(
      join(consumerDir, "prototype-post-processing-consumer.ts"),
      [
        'import { bloom, glitch, pixelate } from "@hyperfocus/engine/post-processing/prototype";',
        'import * as root from "@hyperfocus/engine";',
        "",
        "if ('bloom' in root || typeof bloom !== 'function' || typeof glitch !== 'function' || typeof pixelate !== 'function') throw new Error('unexpected post-processing prototype surface');",
      ].join("\n"),
    );

    await $`${npmCommand} install --offline --ignore-scripts --no-audit --no-fund --package-lock=false`.cwd(consumerDir).quiet();
    // npm treats directory dependencies as source checkouts and may run their prepare scripts.
    // Stage the already-installed peer artifacts directly so this smoke stays offline and side-effect free.
    for (const [packageName, packagePath] of Object.entries(localPeerPackages)) {
      const target = join(consumerDir, "node_modules", ...packageName.split("/"));
      mkdirSync(dirname(target), { recursive: true });
      cpSync(packagePath, target, { recursive: true });
    }
    await $`${bunCommand} ./consumer.ts`.cwd(consumerDir).quiet();
    await $`${bunCommand} ./core-consumer.ts`.cwd(consumerDir).quiet();
    await $`${bunCommand} ./browser-consumer.ts`.cwd(consumerDir).quiet();
    await $`${bunCommand} ./net-consumer.ts`.cwd(consumerDir).quiet();
    await $`${bunCommand} ./protocol-consumer.ts`.cwd(consumerDir).quiet();
    await $`${bunCommand} ./server-consumer.ts`.cwd(consumerDir).quiet();
    await $`${bunCommand} ./mmo-consumer.ts`.cwd(consumerDir).quiet();
    await $`${bunCommand} ./render-consumer.ts`.cwd(consumerDir).quiet();
    await $`${bunCommand} ./render-3d-consumer.ts`.cwd(consumerDir).quiet();
    await $`${bunCommand} ./render-3d-core-consumer.ts`.cwd(consumerDir).quiet();
    await $`${bunCommand} ./render-3d-scene-consumer.ts`.cwd(consumerDir).quiet();
    await $`${bunCommand} ./render-3d-webgl2-consumer.ts`.cwd(consumerDir).quiet();
    await $`${bunCommand} ./physics-3d-consumer.ts`.cwd(consumerDir).quiet();
    await $`${bunCommand} ./physics-2d-consumer.ts`.cwd(consumerDir).quiet();
    await $`${bunCommand} ./physics-rigid-3d-consumer.ts`.cwd(consumerDir).quiet();
    await $`${bunCommand} ./motion-consumer.ts`.cwd(consumerDir).quiet();
    await $`${bunCommand} ./motion-three-consumer.ts`.cwd(consumerDir).quiet();
    await $`${bunCommand} ./migrations-consumer.ts`.cwd(consumerDir).quiet();
    await $`${bunCommand} ./project-consumer.ts`.cwd(consumerDir).quiet();
    await $`${bunCommand} ./project-runtime-2d-consumer.ts`.cwd(consumerDir).quiet();
    await $`${bunCommand} ./project-runtime-timeline-2d-consumer.ts`.cwd(consumerDir).quiet();
    await $`${bunCommand} ./project-runtime-navigation-2d-consumer.ts`.cwd(consumerDir).quiet();
    await $`${bunCommand} ./project-runtime-save-2d-consumer.ts`.cwd(consumerDir).quiet();
    await $`${bunCommand} ./project-runtime-story-2d-consumer.ts`.cwd(consumerDir).quiet();
    await $`${bunCommand} ./project-runtime-3d-consumer.ts`.cwd(consumerDir).quiet();
    await $`${bunCommand} ./project-filesystem-consumer.ts`.cwd(consumerDir).quiet();
    await $`${bunCommand} ./project-neutral-export-consumer.ts`.cwd(consumerDir).quiet();
    await $`${bunCommand} ./navigation-consumer.ts`.cwd(consumerDir).quiet();
    await $`${bunCommand} ./content-consumer.ts`.cwd(consumerDir).quiet();
    await $`${bunCommand} ./save-consumer.ts`.cwd(consumerDir).quiet();
    await $`${bunCommand} ./save-browser-consumer.ts`.cwd(consumerDir).quiet();
    await $`${bunCommand} ./audio-consumer.ts`.cwd(consumerDir).quiet();
    await $`${bunCommand} ./effects-consumer.ts`.cwd(consumerDir).quiet();
    await $`${bunCommand} ./subpath-negative-consumer.ts`.cwd(consumerDir).quiet();
    await $`${bunCommand} ./ui-consumer.ts`.cwd(consumerDir).quiet();
    await $`${bunCommand} ./ui-core-consumer.ts`.cwd(consumerDir).quiet();
    await $`${bunCommand} ./asset-loader-consumer.ts`.cwd(consumerDir).quiet();
    await $`${bunCommand} ./gltf-static-consumer.ts`.cwd(consumerDir).quiet();
    await $`${bunCommand} ./gltf-skin-animation-consumer.ts`.cwd(consumerDir).quiet();
    await $`${bunCommand} ./template-assets-consumer.ts`.cwd(consumerDir).quiet();
    await $`${bunCommand} ./prototype-post-processing-consumer.ts`.cwd(consumerDir).quiet();
    await $`${tscPath} --noEmit`.cwd(consumerDir).quiet();
    await $`${tscPath} --noEmit -p ./tsconfig.nodenext.json`.cwd(consumerDir).quiet();
  } finally {
    rmSync(consumerDir, { force: true, recursive: true });
  }
} finally {
  rmSync(packDir, { force: true, recursive: true });
}

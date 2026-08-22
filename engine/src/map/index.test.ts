import { expect, test } from "bun:test";
import {
  buildRegionAnchorSpecs,
  buildRegionNpcMarkers,
  buildRegionTiles,
  createRegionConfig,
  createStaticRectCollisionIndex,
  createTileMap,
  createTileset,
  extractCollisionRects,
  generateTileMap,
  getTileAt,
  renderTileLayer,
  resolveRegionAnchors,
  seededRandom,
  tileToWorld,
  worldToTile,
  zoneForRegionTile
} from "./index.ts";

test("tileset metadata drives source rects and tag lookup", () => {
  const tileset = createTileset({
    tileSize: 16,
    columns: 4,
    tileCount: 8,
    tiles: {
      5: { name: "reef", tags: ["solid", "reef"], solid: true }
    }
  });

  expect(tileset.requireTile(5).source).toEqual({ x: 16, y: 16, w: 16, h: 16 });
  expect(tileset.requireTile(5).collision).toBe(true);
  expect(tileset.tileIdsByTag("reef")).toEqual([5]);
});

test("generated maps are seeded and expose tile/world queries", () => {
  const tileset = createTileset({
    tileSize: 8,
    columns: 4,
    tileCount: 4,
    tiles: {
      0: { tags: ["floor"] },
      1: { tags: ["wall", "solid"], solid: true },
      2: { tags: ["hazard"] },
      3: { tags: ["spawn"] }
    }
  });
  const options = {
    tileset,
    width: 8,
    height: 8,
    baseTile: 1,
    seed: "same-route",
    rules: [
      { type: "path" as const, tile: 0, from: { x: 4, y: 7 }, to: { x: 4, y: 0 }, width: 3 },
      { type: "marker" as const, markerType: "spawn", tile: 3, count: 2, avoidTags: ["solid"] }
    ]
  };

  const first = generateTileMap(options);
  const second = generateTileMap(options);

  expect(first.layers[0].tiles).toEqual(second.layers[0].tiles);
  expect(first.markers).toEqual(second.markers);
  expect(worldToTile(first, 18, 26)).toEqual({ x: 2, y: 3 });
  expect(tileToWorld(first, 2, 3, "center")).toEqual({ x: 20, y: 28 });
  expect(getTileAt(first, -1, 0)).toBeUndefined();
});

test("generated maps can derive dimensions and deterministic anchors from a chunk grid", () => {
  const tileset = createTileset({
    tileSize: 8,
    columns: 2,
    tileCount: 2,
    tiles: {
      0: { tags: ["floor"] },
      1: { tags: ["anchor"] }
    }
  });
  const options = {
    tileset,
    chunkGrid: { chunksWide: 10, chunksHigh: 10, chunkWidth: 4, chunkHeight: 3 },
    baseTile: 0,
    seed: "region-grid",
    anchors: [
      { id: "oakhaven", type: "town", chunkX: 2, chunkY: 6, tile: 1, metadata: { spawnId: "oakhaven.elder-rowan", dialogTreeRef: "dialog.oakhaven.elder-rowan" } },
      { id: "void-rift", type: "dungeon", chunkX: 9, chunkY: 0, tile: 1, metadata: { instanceId: "void-rift" } }
    ]
  };

  const first = generateTileMap(options);
  const second = generateTileMap(options);

  expect(first.width).toBe(40);
  expect(first.height).toBe(30);
  expect(first.markers).toEqual(second.markers);
  expect(first.markers.map((marker) => marker.metadata?.anchorId)).toEqual(["oakhaven", "void-rift"]);
  expect(first.markers[0].metadata).toMatchObject({ spawnId: "oakhaven.elder-rowan", dialogTreeRef: "dialog.oakhaven.elder-rowan" });
});

test("collision extraction merges tagged tile runs into world rects", () => {
  const tileset = createTileset({
    tileSize: 16,
    columns: 2,
    tileCount: 2,
    tiles: {
      1: { tags: ["solid"], collision: true }
    }
  });
  const map = generateTileMap({
    tileset,
    width: 4,
    height: 3,
    baseTile: null,
    rules: [
      { type: "border", tile: 1, thickness: 1 }
    ]
  });

  expect(extractCollisionRects(map, { tags: ["solid"] })).toEqual([
    { x: 0, y: 0, w: 64, h: 16 },
    { x: 0, y: 16, w: 16, h: 16 },
    { x: 48, y: 16, w: 16, h: 16 },
    { x: 0, y: 32, w: 64, h: 16 }
  ]);
});

test("static rect collision index narrows circle collision checks", () => {
  const rects = [
    { x: 0, y: 0, w: 16, h: 16 },
    { x: 80, y: 80, w: 16, h: 16 },
    { x: 160, y: 160, w: 16, h: 16 }
  ];
  const index = createStaticRectCollisionIndex(rects);
  const candidates = index.queryCircle(84, 84, 12);
  let exactChecks = 0;

  expect(index.strategy).toBe("flatbush");
  expect(candidates).toEqual([{ x: 80, y: 80, w: 16, h: 16 }]);
  expect(index.collidesCircle(84, 84, 12, (rect, x, y, radius) => {
    exactChecks += 1;
    return x + radius >= rect.x && y + radius >= rect.y;
  })).toBe(true);
  expect(exactChecks).toBe(1);
  expect(index.collidesCircle(48, 48, 6)).toBe(false);
});

test("static rect collision index can use tree fallback", () => {
  const index = createStaticRectCollisionIndex([{ x: 0, y: 0, w: 16, h: 16 }], { strategy: "tree" });

  expect(index.strategy).toBe("tree");
  expect(index.queryCircle(8, 8, 4)).toEqual([{ x: 0, y: 0, w: 16, h: 16 }]);
});

test("render and collision helpers can filter instance layers", () => {
  const tileset = createTileset({
    tileSize: 16,
    columns: 2,
    tileCount: 2,
    tiles: {
      1: { tags: ["solid"], collision: true }
    }
  });
  const map = createTileMap({
    tileset,
    width: 2,
    height: 1,
    layers: [
      { id: "shared", tiles: [1, null] },
      { id: "dungeon-a", tiles: [1, 1], metadata: { instanceId: "dungeon-a" } }
    ]
  });
  const calls: unknown[] = [];
  const ctx = {
    globalAlpha: 1,
    save() {},
    restore() {},
    drawImage(...args: unknown[]) {
      calls.push(args);
    }
  } as unknown as CanvasRenderingContext2D;
  const image = {} as CanvasImageSource;

  expect(extractCollisionRects(map, { layer: "dungeon-a", instanceId: "dungeon-b" })).toEqual([]);
  expect(extractCollisionRects(map, { layer: "dungeon-a", instanceId: "dungeon-a" })).toEqual([{ x: 0, y: 0, w: 32, h: 16 }]);
  expect(renderTileLayer(map, { layer: "dungeon-a", context: ctx, image, instanceId: "dungeon-b" })).toEqual({ drawn: 0, skipped: 2 });
  expect(renderTileLayer(map, { layer: "dungeon-a", context: ctx, image, instanceId: "dungeon-a" })).toEqual({ drawn: 2, skipped: 0 });
  expect(calls).toHaveLength(2);
});

test("seeded random is stable for repeatable asset generation", () => {
  const left = seededRandom("asset-seed");
  const right = seededRandom("asset-seed");

  expect([left(), left(), left()]).toEqual([right(), right(), right()]);
});

test("generic region builders resolve anchors, NPCs, tiles, and zones from config", () => {
  const region = createRegionConfig({
    id: "test-region",
    seed: "region-seed",
    revision: "r1",
    tileSize: 16,
    chunkGrid: { chunksWide: 3, chunksHigh: 2, chunkWidth: 6, chunkHeight: 5 },
    anchors: [
      { id: "town-a", kind: "town", name: "Town A", zoneId: "meadow", chunkX: 0, chunkY: 1, markerTile: 2 },
      { id: "mine-a", kind: "dungeon", name: "Mine A", zoneId: "crag", chunkX: 2, chunkY: 0, markerTile: 3 }
    ],
    npcs: [
      { id: "guide", kind: "guide", name: "Guide", role: "quest", anchorId: "town-a", spawnId: "town-a.guide", offsetX: 1, offsetY: 0 }
    ],
    tiles: {
      baseTile: 0,
      edgeTile: 1,
      routeTile: 4,
      waterBorder: true,
      roadPairs: [["town-a", "mine-a"]],
      anchorFootprints: [{ kind: "town", width: 3, height: 3, tile: 4 }]
    },
    zones: {
      defaultZoneId: "meadow",
      nearestAnchorDistance: 8,
      nearestAnchorZone: (anchor) => anchor.zoneId,
      rules: [{ zoneId: "crag", when: ({ tileX, width }) => tileX > width * 0.6 }]
    }
  });

  const anchors = resolveRegionAnchors(region);
  const town = anchors.find((anchor) => anchor.id === "town-a");
  const mine = anchors.find((anchor) => anchor.id === "mine-a");
  expect(town?.tileX).toBeGreaterThan(0);
  expect(buildRegionAnchorSpecs(region).map((anchor) => anchor.id)).toEqual(["town-a", "mine-a"]);

  const npc = buildRegionNpcMarkers(region)[0];
  expect(npc.metadata).toMatchObject({ id: "guide", zoneId: "meadow", anchorId: "town-a" });

  const tiles = buildRegionTiles(region);
  expect(tiles).toHaveLength(18 * 10);
  expect(town && tiles[town.tileY * 18 + town.tileX]).toBe(2);
  expect(mine && zoneForRegionTile(region, mine.tileX, mine.tileY)).toBe("crag");
});

test("map builders reject dimensions and rules that cannot terminate safely", () => {
  const tileset = createTileset({ tileSize: 8, columns: 1, tileCount: 1 });

  expect(() => createTileMap({ tileset, width: 4096, height: 4096, layers: [] })).toThrow(/tile count/);
  expect(() => createTileset({ tileSize: 8, columns: 1, tileCount: 262_145 })).toThrow(/tileCount|tile count/);
  expect(() => generateTileMap({ tileset, width: 4, height: 4, rules: [{ type: "scatter", count: Infinity }] })).toThrow(/scatter count/);
  expect(() => generateTileMap({ tileset, width: 4, height: 4, rules: [{ type: "marker", markerType: "spawn", count: Infinity }] })).toThrow(/marker count/);
  expect(() => generateTileMap({
    tileset,
    width: 4,
    height: 4,
    rules: [{ type: "path", from: { x: 0.5, y: 0 }, to: { x: 3, y: 3 }, width: 1 }]
  })).toThrow(/safe-integer coordinates/);
  expect(() => generateTileMap({
    tileset,
    width: 4,
    height: 4,
    rules: [{ type: "path", from: { x: 0, y: 0 }, to: { x: 3, y: 3 }, width: Infinity }]
  })).toThrow(/path width/);
  expect(() => generateTileMap({
    tileset,
    width: 500,
    height: 500,
    rules: [{ type: "path", from: { x: 0, y: 0 }, to: { x: 499, y: 499 }, width: 1_000 }]
  })).toThrow(/work limit/);
});

test("generator requires full-sized layers and uses exact even brush widths", () => {
  const tileset = createTileset({ tileSize: 8, columns: 1, tileCount: 1 });
  expect(() => generateTileMap({
    tileset,
    width: 3,
    height: 3,
    layers: [{ id: "small", width: 2, height: 2, tiles: [null, null, null, null] }],
    rules: [{ type: "fill", tile: 0 }]
  })).toThrow(/dimensions must match/);

  const map = generateTileMap({
    tileset,
    width: 3,
    height: 3,
    rules: [{ type: "path", tile: 0, from: { x: 1, y: 1 }, to: { x: 1, y: 1 }, width: 2 }]
  });
  expect(map.layers[0].tiles.filter((tile) => tile === 0)).toHaveLength(4);
});

test("compact legends only read own entries and tile coordinates stay integral", () => {
  const tileset = createTileset({ tileSize: 8, columns: 1, tileCount: 1 });
  const map = createTileMap({
    tileset,
    width: 2,
    height: 1,
    layers: [{ tiles: "toString 1x", legend: Object.create({ toString: 0 }) as Record<string, 0> }]
  });

  expect(map.layers[0].tiles).toEqual([null, null]);
  expect(map.getTileAt(0.5, 0)).toBeUndefined();
});

test("static collision indexes snapshot source rectangles", () => {
  const source = { x: 0, y: 0, w: 10, h: 10 };
  const index = createStaticRectCollisionIndex([source]);
  source.x = 100;

  expect(index.queryCircle(5, 5, 1)).toEqual([{ x: 0, y: 0, w: 10, h: 10 }]);
  expect(index.queryCircle(105, 5, 1)).toEqual([]);
  expect(() => index.queryCircle(0, 0, Infinity)).toThrow(/radius/);
});

test("tile rendering restores canvas state when drawing throws", () => {
  const tileset = createTileset({ tileSize: 8, columns: 1, tileCount: 1 });
  const map = createTileMap({ tileset, width: 1, height: 1, layers: [{ tiles: [0] }] });
  let restores = 0;
  const ctx = {
    globalAlpha: 1,
    save() {},
    restore() { restores += 1; },
    drawImage() { throw new Error("draw failed"); }
  } as unknown as CanvasRenderingContext2D;

  expect(() => renderTileLayer(map, { context: ctx, image: {} as CanvasImageSource })).toThrow("draw failed");
  expect(restores).toBe(1);
});

test("region callbacks and scatter counts cannot create unbounded tile loops", () => {
  const scatterRegion = createRegionConfig({
    id: "bad-scatter",
    seed: "seed",
    revision: "r1",
    tileSize: 8,
    chunkGrid: { chunksWide: 1, chunksHigh: 1, chunkWidth: 4, chunkHeight: 4 },
    anchors: [],
    tiles: { baseTile: null, chunkScatters: [{ count: Infinity, tile: 0 }] }
  });
  expect(() => buildRegionTiles(scatterRegion)).toThrow(/scatter count/);

  const callbackRegion = createRegionConfig({
    id: "bad-callback",
    seed: "seed",
    revision: "r1",
    tileSize: 8,
    chunkGrid: { chunksWide: 1, chunksHigh: 1, chunkWidth: 4, chunkHeight: 4 },
    anchors: [],
    tiles: {
      baseTile: null,
      afterBuild: ({ drawPath }) => drawPath(0, 0, Infinity, 3)
    }
  });
  expect(() => buildRegionTiles(callbackRegion)).toThrow(/path toX/);
});

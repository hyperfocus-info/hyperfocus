import { dirname, resolve } from "node:path";
import { mkdir } from "node:fs/promises";
import Flatbush from "flatbush";
import KDBush from "kdbush";
import RBushModule from "rbush";
import { createCollisionBroadphase, type CollisionAabb, type CollisionBroadphaseEntry } from "../src/math/broadphase.ts";
import { createSpatialHash } from "../src/server/spatial-hash.ts";

type BenchSample = {
  label: string;
  samplesMs: number[];
  medianMs: number;
  minMs: number;
  maxMs: number;
  checksum: number;
};

type BenchResult = {
  experiment: string;
  samples: BenchSample[];
};

type RectItem = CollisionAabb & {
  id: number;
};

type PointItem = {
  id: number;
  x: number;
  y: number;
  radius?: number;
};

type RbushItem = RectItem;

type RbushLike = {
  load(items: RbushItem[]): void;
  insert(item: RbushItem): void;
  remove(item: RbushItem): void;
  search(bounds: CollisionAabb): RbushItem[];
};

const RBush = RBushModule as unknown as new (maxEntries?: number) => RbushLike;
const outputArg = process.argv.find((arg) => arg.startsWith("--out="));
const outputPath = outputArg?.slice("--out=".length) ?? ".local/engine-perf/2026-06-09/spatial-index-bench.json";

function round(value: number) {
  return Math.round(value * 1000) / 1000;
}

function median(values: readonly number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

function sample(label: string, run: () => number, repeats = 9): BenchSample {
  let checksum = 0;
  for (let i = 0; i < 2; i += 1) checksum = run();
  const samplesMs: number[] = [];
  for (let i = 0; i < repeats; i += 1) {
    Bun.gc(true);
    const start = performance.now();
    checksum = run();
    samplesMs.push(performance.now() - start);
  }
  return {
    label,
    samplesMs: samplesMs.map(round),
    medianMs: round(median(samplesMs)),
    minMs: round(Math.min(...samplesMs)),
    maxMs: round(Math.max(...samplesMs)),
    checksum
  };
}

function assertSame(name: string, samples: BenchSample[]) {
  const expected = samples[0]?.checksum;
  for (const item of samples) {
    if (item.checksum !== expected) {
      throw new Error(`${name} parity failed: ${item.label} checksum ${item.checksum}, expected ${expected}`);
    }
  }
}

function rects(count: number) {
  const out: RectItem[] = [];
  for (let i = 0; i < count; i += 1) {
    const x = ((i * 37) % 4096) + ((i % 7) * 0.25);
    const y = (Math.floor((i * 91) % 4096)) + ((i % 5) * 0.25);
    const w = 8 + (i % 11);
    const h = 8 + ((i * 3) % 13);
    out.push({ id: i, minX: x, minY: y, maxX: x + w, maxY: y + h });
  }
  return out;
}

function points(count: number) {
  const out: PointItem[] = [];
  for (let i = 0; i < count; i += 1) {
    out.push({
      id: i,
      x: ((i * 53) % 8192) + ((i % 3) * 0.125),
      y: ((i * 97) % 8192) + ((i % 5) * 0.125)
    });
  }
  return out;
}

function queries(count: number, worldSize: number, radius: number) {
  const out: CollisionAabb[] = [];
  for (let i = 0; i < count; i += 1) {
    const x = (i * 131) % worldSize;
    const y = (i * 197) % worldSize;
    out.push({ minX: x - radius, minY: y - radius, maxX: x + radius, maxY: y + radius });
  }
  return out;
}

function checksumIds(ids: Iterable<number>) {
  let sum = 0;
  let count = 0;
  for (const id of ids) {
    count += 1;
    sum = (sum + ((id + 1) * 2654435761)) >>> 0;
  }
  return sum ^ count;
}

function overlapsStrict(a: CollisionAabb, b: CollisionAabb) {
  return a.minX < b.maxX && a.maxX > b.minX && a.minY < b.maxY && a.maxY > b.minY;
}

function pairChecksum(a: number, b: number) {
  const low = Math.min(a, b);
  const high = Math.max(a, b);
  return ((low + 1) * 31 + (high + 1)) >>> 0;
}

function benchStaticBroadphase() {
  const items = rects(40_000);
  const queryBoxes = queries(2_000, 4096, 24);

  const custom = sample("engine packed static queries", () => {
    const index = createCollisionBroadphase<number>();
    index.rebuild(items);
    const out: number[] = [];
    let sum = 0;
    for (const query of queryBoxes) {
      out.length = 0;
      index.query(query, out);
      sum = (sum + checksumIds(out)) >>> 0;
    }
    return sum;
  });

  const flatbush = sample("Flatbush static packed R-tree queries", () => {
    const index = new Flatbush(items.length);
    for (const item of items) index.add(item.minX, item.minY, item.maxX, item.maxY);
    index.finish();
    let sum = 0;
    for (const query of queryBoxes) {
      sum = (sum + checksumIds(index.search(query.minX, query.minY, query.maxX, query.maxY, (id) => overlapsStrict(items[id]!, query)))) >>> 0;
    }
    return sum;
  });

  const grid = sample("fixed grid static rect queries", () => {
    const cellSize = 32;
    const buckets = new Map<string, number[]>();
    const key = (x: number, y: number) => `${x},${y}`;
    for (const item of items) {
      const minX = Math.floor(item.minX / cellSize);
      const maxX = Math.floor(item.maxX / cellSize);
      const minY = Math.floor(item.minY / cellSize);
      const maxY = Math.floor(item.maxY / cellSize);
      for (let y = minY; y <= maxY; y += 1) {
        for (let x = minX; x <= maxX; x += 1) {
          const bucketKey = key(x, y);
          let bucket = buckets.get(bucketKey);
          if (!bucket) {
            bucket = [];
            buckets.set(bucketKey, bucket);
          }
          bucket.push(item.id);
        }
      }
    }
    const seen = new Uint32Array(items.length);
    let stamp = 1;
    let sum = 0;
    for (const query of queryBoxes) {
      const ids: number[] = [];
      const minX = Math.floor(query.minX / cellSize);
      const maxX = Math.floor(query.maxX / cellSize);
      const minY = Math.floor(query.minY / cellSize);
      const maxY = Math.floor(query.maxY / cellSize);
      for (let y = minY; y <= maxY; y += 1) {
        for (let x = minX; x <= maxX; x += 1) {
          const bucket = buckets.get(key(x, y));
          if (!bucket) continue;
          for (const id of bucket) {
            const item = items[id]!;
            if (seen[id] === stamp) continue;
            seen[id] = stamp;
            if (item.minX < query.maxX && item.maxX > query.minX && item.minY < query.maxY && item.maxY > query.minY) ids.push(id);
          }
        }
      }
      stamp += 1;
      sum = (sum + checksumIds(ids)) >>> 0;
    }
    return sum;
  });

  const samples = [custom, flatbush, grid];
  assertSame("static broadphase", samples);
  return { experiment: "static rect query broadphase", samples };
}

function benchDynamicPairs() {
  const baseItems = rects(8_000);
  const frames = 30;

  const custom = sample("engine rebuild+allocation-free sweep pairs", () => {
    let sum = 0;
    const entries: CollisionBroadphaseEntry<number>[] = [];
    const index = createCollisionBroadphase<number>();
    for (let frame = 0; frame < frames; frame += 1) {
      entries.length = 0;
      for (const item of baseItems) {
        const dx = ((item.id + frame) % 9) - 4;
        entries.push({ id: item.id, minX: item.minX + dx, minY: item.minY, maxX: item.maxX + dx, maxY: item.maxY });
      }
      index.rebuild(entries);
      index.forEachPair((a, b) => {
        sum = (sum + pairChecksum(a, b)) >>> 0;
      });
    }
    return sum;
  }, 7);

  const rbush = sample("RBush bulk load + pair queries", () => {
    let sum = 0;
    const items: RbushItem[] = [];
    for (let frame = 0; frame < frames; frame += 1) {
      items.length = 0;
      const tree = new RBush(16);
      for (const item of baseItems) {
        const dx = ((item.id + frame) % 9) - 4;
        items.push({ id: item.id, minX: item.minX + dx, minY: item.minY, maxX: item.maxX + dx, maxY: item.maxY });
      }
      tree.load(items);
      for (const item of items) {
        for (const hit of tree.search(item)) {
          if (hit.id <= item.id) continue;
          if (!overlapsStrict(item, hit)) continue;
          sum = (sum + pairChecksum(item.id, hit.id)) >>> 0;
        }
      }
    }
    return sum;
  }, 7);

  const sweep = sample("sweep-and-prune dynamic pairs", () => {
    let sum = 0;
    const items: RectItem[] = [];
    for (let frame = 0; frame < frames; frame += 1) {
      items.length = 0;
      for (const item of baseItems) {
        const dx = ((item.id + frame) % 9) - 4;
        items.push({ id: item.id, minX: item.minX + dx, minY: item.minY, maxX: item.maxX + dx, maxY: item.maxY });
      }
      items.sort((a, b) => a.minX - b.minX || a.id - b.id);
      for (let i = 0; i < items.length; i += 1) {
        const a = items[i]!;
        for (let j = i + 1; j < items.length; j += 1) {
          const b = items[j]!;
          if (b.minX >= a.maxX) break;
          if (a.minY < b.maxY && a.maxY > b.minY) sum = (sum + pairChecksum(a.id, b.id)) >>> 0;
        }
      }
    }
    return sum;
  }, 7);

  const samples = [custom, rbush, sweep];
  assertSame("dynamic pairs", samples);
  return { experiment: "dynamic rect pair broadphase", samples };
}

function benchRadiusPoints() {
  const items = points(80_000);
  const queryPoints = queries(3_000, 8192, 64).map((box) => ({
    x: (box.minX + box.maxX) * 0.5,
    y: (box.minY + box.maxY) * 0.5,
    radius: (box.maxX - box.minX) * 0.5
  }));

  const hash = sample("engine spatial hash radius queries", () => {
    const index = createSpatialHash<PointItem>({ cellSize: 128 });
    for (const item of items) index.upsert(item);
    const out: PointItem[] = [];
    let sum = 0;
    for (const query of queryPoints) {
      index.queryNearby(query, out);
      sum = (sum + checksumIds(out.map((item) => item.id))) >>> 0;
    }
    return sum;
  });

  const kdbush = sample("KDBush static point radius queries", () => {
    const index = new KDBush(items.length);
    for (const item of items) index.add(item.x, item.y);
    index.finish();
    let sum = 0;
    for (const query of queryPoints) {
      sum = (sum + checksumIds(index.within(query.x, query.y, query.radius))) >>> 0;
    }
    return sum;
  });

  const samples = [hash, kdbush];
  assertSame("radius points", samples);
  return { experiment: "radius point query index", samples };
}

const results: BenchResult[] = [
  benchStaticBroadphase(),
  benchDynamicPairs(),
  benchRadiusPoints()
];

for (const result of results) {
  console.log(result.experiment);
  const fastest = Math.min(...result.samples.map((item) => item.medianMs));
  for (const item of result.samples) {
    const delta = round(((item.medianMs - fastest) / Math.max(0.001, fastest)) * 100);
    const sign = delta > 0 ? "+" : "";
    console.log(`  ${item.label}: ${item.medianMs}ms (${sign}${delta}%) checksum=${item.checksum}`);
  }
}

await mkdir(dirname(resolve(outputPath)), { recursive: true });
await Bun.write(outputPath, JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2));
console.log(`report: ${outputPath}`);

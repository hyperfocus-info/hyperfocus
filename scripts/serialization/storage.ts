import { deepStrictEqual } from "node:assert";
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { Database } from "bun:sqlite";
import { createReviewStore } from "@hyperfocus/review-store";
import { statistics, variant, type Sample } from "./measure";
import type { Workload } from "./workloads";

function timed(operation: () => void): Sample {
  Bun.gc(true);
  const heap = process.memoryUsage().heapUsed, cpu = process.cpuUsage(), start = performance.now();
  operation();
  const wallUs = (performance.now() - start) * 1000, used = process.cpuUsage(cpu);
  return { wallUs, cpuUs: used.user + used.system, retainedHeapDelta: process.memoryUsage().heapUsed - heap };
}

export function measureStorage(workloads: readonly Workload[], directory: string) {
  const root = resolve(directory);
  mkdirSync(root, { recursive: true });
  function removeFile(path: string) {
    if (!resolve(path).startsWith(root + sep)) throw new Error("Benchmark cleanup escaped its fixture directory");
    if (existsSync(path)) unlinkSync(path);
  }
  const files = [];
  for (const workload of workloads) for (const compressed of [false, true]) {
    const variants = workload.candidates.map(candidate => variant(candidate, compressed));
    const baseline = variants[0]!;
    const samples: Record<string, Sample[]> = {};
    for (const alternative of variants.slice(1)) for (let round = 0; round < 6; round++) {
      const order = round % 2 ? [alternative, baseline, baseline, alternative] : [baseline, alternative, alternative, baseline];
      for (const candidate of order) {
        const path = join(root, `${workload.name}-${candidate.name}.data`);
        let decoded: unknown;
        const sample = timed(() => {
          const bytes = candidate.encode(), handle = openSync(path, "w");
          try { writeFileSync(handle, bytes); fsyncSync(handle); } finally { closeSync(handle); }
          decoded = candidate.decode(readFileSync(path));
        });
        deepStrictEqual(decoded, workload.value);
        (samples[candidate.name] ??= []).push(sample);
        removeFile(path);
      }
    }
    files.push({ workload: workload.name, compression: compressed ? "gzip-6" : "none",
      fileBytes: Object.fromEntries(variants.map(candidate => [candidate.name, candidate.bytes.byteLength])),
      saveReadDecode: Object.fromEntries(Object.entries(samples).map(([key, values]) => [key, statistics(values)])) });
    console.log(`File save/read complete: ${workload.name}/${compressed ? "gzip-6" : "raw"}`);
  }

  const sqliteSamples: Record<string, Sample[]> = {};
  const footprints: Record<string, { mainBytes: number; walBytes: number; checkpointBytes: number; pageCount: number; pageSize: number }> = {};
  const jsonAndProtobuf: ("json" | "protobuf")[] = ["json", "protobuf", "protobuf", "json"];
  for (let round = 0; round < 6; round++) for (const encoding of round % 2 ? jsonAndProtobuf.map(value => value === "json" ? "protobuf" : "json") : jsonAndProtobuf) {
    const path = join(root, "review.sqlite"), db = new Database(path);
    try {
      db.exec("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA wal_autocheckpoint=0;");
      const store = createReviewStore({ database: db, encoding });
      const rows = Array.from({ length: 256 }, (_, i) => ({ namespace: "codec-benchmark", assetId: `asset-${i}`, version: "1",
        contentHash: `fixture-${i}`, metadata: { prompt: "Saved artifact metadata. ".repeat(12), seed: i,
          tags: ["review", "fixture"], parameters: { width: 1024, height: 768, steps: 20, scale: 0.75 } } }));
      const sample = timed(() => {
        db.transaction(() => { for (const row of rows) {
          store.registerAsset(row);
          store.saveFeedback({ ...row, expectedRevision: 0, payload: { rating: 4, notes: "Repeatable review feedback. ".repeat(8), accepted: true } });
        } }).immediate();
        for (const row of rows) {
          if (!store.readAsset(row) || !store.readFeedback(row)) throw new Error("Missing saved review");
        }
      });
      for (const row of rows) deepStrictEqual(store.readAsset(row)?.metadata, row.metadata);
      (sqliteSamples[encoding] ??= []).push(sample);
      const mainBytes = statSync(path).size, walBytes = statSync(path + "-wal").size;
      db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
      const pages = db.query<{ page_count: number }, []>("PRAGMA page_count").get()!;
      const size = db.query<{ page_size: number }, []>("PRAGMA page_size").get()!;
      footprints[encoding] = { mainBytes, walBytes, checkpointBytes: statSync(path).size, pageCount: pages.page_count, pageSize: size.page_size };
    } finally { db.close(); for (const suffix of ["", "-wal", "-shm"]) removeFile(path + suffix); }
  }
  return { files, sqlite: { workload: "review-store-256-assets-and-feedback", footprints,
    commitAndRead: Object.fromEntries(Object.entries(sqliteSamples).map(([key, values]) => [key, statistics(values)])) },
    limits: "Disposable local fixtures. File timing includes encode, write, fsync, close, read and decode, with warm OS caches; it is not cold-device latency or a power-loss test. SQLite uses the actual review-store API, WAL, synchronous=FULL, one outer transaction and warm reads. File bytes are logical sizes, not filesystem allocated blocks. SQLite footprint includes page counts and the pre-checkpoint WAL; no live database is migrated. No concurrent clients or DAW scheduling." };
}

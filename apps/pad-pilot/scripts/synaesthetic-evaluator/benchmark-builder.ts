import { createHash, randomUUID } from "node:crypto";
import { mkdir, rename, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { hashBoundedFile, readBoundedFileBytes } from "../bounded-file";

import { scoreAudioFile } from "./audio-orchestrator";
import { boundedFetchBytes, decodeUtf8 } from "./bounded-fetch";
import { clamp01 } from "./skill-math";

type GitHubTreeEntry = {
  readonly path: string;
  readonly sha: string;
  readonly type: string;
  readonly size?: number;
};

type CandidateEntry = {
  readonly source: "SoundSafari/CC0-1.0-Music";
  readonly sourcePath: string;
  readonly sourceUrl: string;
  readonly localPath: string;
  readonly license: "CC0-1.0";
  readonly sha256: string;
  readonly sizeBytes: number;
  readonly durationSeconds: number;
  readonly overallScore: number;
  readonly metrics: Awaited<ReturnType<typeof scoreAudioFile>>["metrics"];
};

type BenchmarkEntry = CandidateEntry & {
  readonly label: "good" | "average";
  readonly labelMethod: string;
};

type GeneratedEntry = {
  readonly source: "generated-local";
  readonly sourcePath: string;
  readonly sourceUrl: "";
  readonly localPath: string;
  readonly license: "CC0-1.0";
  readonly sha256: string;
  readonly sizeBytes: number;
  readonly durationSeconds: number;
  readonly label: "bad";
  readonly labelMethod: string;
  readonly overallScore: number;
  readonly metrics: Awaited<ReturnType<typeof scoreAudioFile>>["metrics"];
};

const BENCHMARK_VERSION = 1;
const TARGET_PER_CLASS = 50;
const REAL_CANDIDATE_TARGET = 125;
const MAX_SOURCE_BYTES = 4_500_000;
const MAX_TREE_BYTES = 10 * 1024 * 1024;
const MIN_SOURCE_BYTES = 500_000;
const MIN_REAL_TRACK_SECONDS = 25;
const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT_DIR = join(PROJECT_ROOT, "build", "synaesthetic-evaluator", "benchmark");
const CACHE_DIR = join(OUT_DIR, "cc0-cache");
const GENERATED_BAD_DIR = join(OUT_DIR, "generated-bad");
const MANIFEST_PATH = join(OUT_DIR, "benchmark-manifest.json");
const REPORT_PATH = join(OUT_DIR, "benchmark-report.md");

if (import.meta.main) {
  const manifest = await buildBenchmark();
  console.log(buildReport(manifest));
}

export async function buildBenchmark() {
  await Promise.all([
    mkdir(CACHE_DIR, { recursive: true }),
    mkdir(GENERATED_BAD_DIR, { recursive: true }),
  ]);
  const sourceFiles = await fetchSoundSafariTree();
  const candidates = deterministicSample(sourceFiles, 800);
  const scored: CandidateEntry[] = [];
  const seenHashes = new Set<string>();

  for (const entry of candidates) {
    if (scored.length >= REAL_CANDIDATE_TARGET) {
      break;
    }

    try {
      const candidate = await downloadAndScoreCandidate(entry);
      if (seenHashes.has(candidate.sha256)) {
        console.log(`duplicate ${entry.path}`);
        continue;
      }
      seenHashes.add(candidate.sha256);
      if (candidate.overallScore > 0 && Number.isFinite(candidate.overallScore)) {
        scored.push(candidate);
        console.log(`scored ${scored.length}/${REAL_CANDIDATE_TARGET}: ${entry.path}`);
      }
    } catch (error) {
      console.warn(`skip ${entry.path}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (scored.length < TARGET_PER_CLASS * 2) {
    throw new Error(`Need at least ${TARGET_PER_CLASS * 2} scored CC0 tracks; got ${scored.length}.`);
  }

  const sorted = [...scored].sort((left, right) => right.overallScore - left.overallScore);
  const good = sorted.slice(0, TARGET_PER_CLASS).map((entry) => ({
    ...entry,
    label: "good",
    labelMethod: "top-50 raw heuristic score from deterministic CC0 candidate pool",
  } satisfies BenchmarkEntry));
  const average = sorted.slice(TARGET_PER_CLASS, TARGET_PER_CLASS * 2).map((entry) => ({
    ...entry,
    label: "average",
    labelMethod: "rank-51-to-100 raw heuristic score from deterministic CC0 candidate pool",
  } satisfies BenchmarkEntry));
  const bad = await generateBadSongs(TARGET_PER_CLASS);

  const manifest = {
    benchmarkVersion: BENCHMARK_VERSION,
    createdAt: new Date().toISOString(),
    licensePolicy: "CC0-1.0/public-domain-equivalent only. Generated files are deterministic local stress fixtures.",
    sources: [
      {
        name: "SoundSafari/CC0-1.0-Music",
        url: "https://github.com/SoundSafari/CC0-1.0-Music",
        license: "CC0-1.0",
        caveat: "Aggregated CC0/PD corpus. Keep source URL and SHA for every selected item; replace any disputed item immediately.",
      },
    ],
    counts: {
      good: good.length,
      average: average.length,
      bad: bad.length,
    },
    entries: [...good, ...average, ...bad],
  };

  await Bun.write(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
  await Bun.write(REPORT_PATH, buildReport(manifest));
  return manifest;
}

async function fetchSoundSafariTree() {
  const response = await boundedFetchBytes("https://api.github.com/repos/SoundSafari/CC0-1.0-Music/git/trees/main?recursive=1", {
    headers: { "user-agent": "PadPilot-SynaestheticEvaluator-Benchmark" },
    maxBytes: MAX_TREE_BYTES,
    maxRedirects: 1,
    timeoutMs: 20_000,
  });
  if (!response.ok) {
    throw new Error(`GitHub tree fetch failed ${response.status}: ${decodeUtf8(response.bytes)}`);
  }

  const payload = JSON.parse(decodeUtf8(response.bytes)) as unknown;
  if (!payload || typeof payload !== "object" || Reflect.get(payload, "truncated") === true) {
    throw new Error("GitHub tree response was invalid or truncated.");
  }
  const rawTree = Reflect.get(payload, "tree");
  if (!Array.isArray(rawTree)) {
    throw new Error("GitHub tree response omitted its tree array.");
  }
  const tree: GitHubTreeEntry[] = [];
  for (const rawEntry of rawTree) {
    if (!rawEntry || typeof rawEntry !== "object") {
      continue;
    }
    const sourcePath = Reflect.get(rawEntry, "path");
    const type = Reflect.get(rawEntry, "type");
    const size = Reflect.get(rawEntry, "size");
    const sha = Reflect.get(rawEntry, "sha");
    if (typeof sourcePath === "string" && typeof type === "string" && typeof size === "number"
        && typeof sha === "string" && /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i.test(sha)
        && Number.isSafeInteger(size) && size >= MIN_SOURCE_BYTES && size <= MAX_SOURCE_BYTES
        && type === "blob" && /\.(mp3|wav|ogg|flac)$/i.test(sourcePath)
        && !sourcePath.startsWith("freesound.org/") && isSafeRepositoryPath(sourcePath)) {
      tree.push({ path: sourcePath, sha: sha.toLowerCase(), size, type });
    }
  }
  return tree;
}

function deterministicSample(entries: readonly GitHubTreeEntry[], limit: number) {
  return [...entries]
    .sort((left, right) => stableHash(left.path) - stableHash(right.path))
    .slice(0, limit);
}

async function downloadAndScoreCandidate(entry: GitHubTreeEntry) {
  const sourceUrl = `https://raw.githubusercontent.com/SoundSafari/CC0-1.0-Music/main/${entry.path.split("/").map(encodeURIComponent).join("/")}`;
  const localPath = join(CACHE_DIR, sanitizeFileName(`${entry.sha}-${entry.path}`));
  const localFile = Bun.file(localPath);

  if (await localFile.exists()) {
    const cachedHashMatches = await readBoundedFileBytes(
      localPath,
      MAX_SOURCE_BYTES,
      "Cached benchmark source",
    ).then((bytes) => bytes.byteLength === entry.size && gitBlobHash(bytes, entry.sha.length) === entry.sha)
      .catch(() => false);
    if (!cachedHashMatches) {
      await rm(localPath, { force: true });
    }
  }
  if (!(await localFile.exists())) {
    const response = await boundedFetchBytes(sourceUrl, {
      headers: { "user-agent": "PadPilot-SynaestheticEvaluator-Benchmark" },
      maxBytes: MAX_SOURCE_BYTES,
      maxRedirects: 2,
      timeoutMs: 30_000,
    });
    if (!response.ok) {
      throw new Error(`download failed ${response.status}: ${decodeUtf8(response.bytes)}`);
    }
    if (response.bytes.byteLength !== entry.size) {
      throw new Error(`download size ${response.bytes.byteLength} did not match GitHub tree size ${entry.size}`);
    }
    if (gitBlobHash(response.bytes, entry.sha.length) !== entry.sha) {
      throw new Error("download content did not match the GitHub tree object hash");
    }
    const temporary = `${localPath}.${process.pid}-${randomUUID()}.tmp`;
    try {
      await Bun.write(temporary, response.bytes);
      await rename(temporary, localPath);
    } finally {
      await rm(temporary, { force: true });
    }
  }
  const cachedBytes = await readBoundedFileBytes(localPath, MAX_SOURCE_BYTES, "Cached benchmark source");
  if (gitBlobHash(cachedBytes, entry.sha.length) !== entry.sha) {
    await rm(localPath, { force: true });
    throw new Error("cached content did not match the GitHub tree object hash");
  }

  const scored = await scoreAudioFile(localPath);
  if (scored.durationSeconds < MIN_REAL_TRACK_SECONDS) {
    throw new Error(`duration ${scored.durationSeconds.toFixed(1)}s below ${MIN_REAL_TRACK_SECONDS}s`);
  }

  return {
    source: "SoundSafari/CC0-1.0-Music",
    sourcePath: entry.path,
    sourceUrl,
    localPath,
    license: "CC0-1.0",
    sha256: await hashFile(localPath),
    sizeBytes: Bun.file(localPath).size,
    durationSeconds: scored.durationSeconds,
    overallScore: scored.overallScore,
    metrics: scored.metrics,
  } satisfies CandidateEntry;
}

async function generateBadSongs(count: number) {
  const entries: GeneratedEntry[] = [];
  for (let index = 0; index < count; index += 1) {
    const filePath = join(GENERATED_BAD_DIR, `generated-bad-${String(index + 1).padStart(2, "0")}.wav`);
    await Bun.write(filePath, createBadSongWav(index));
    const scored = await scoreAudioFile(filePath);
    entries.push({
      source: "generated-local",
      sourcePath: `generated-bad-${index + 1}`,
      sourceUrl: "",
      localPath: filePath,
      license: "CC0-1.0",
      sha256: await hashFile(filePath),
      sizeBytes: Bun.file(filePath).size,
      durationSeconds: scored.durationSeconds,
      label: "bad",
      labelMethod: "deterministic noisy/degraded synthetic stress fixture",
      overallScore: scored.overallScore,
      metrics: scored.metrics,
    });
  }
  return entries;
}

function createBadSongWav(seed: number) {
  const sampleRate = 16_000;
  const seconds = 18;
  const samples = sampleRate * seconds;
  const pcm = new Int16Array(samples);
  const random = mulberry32(0x9e3779b9 ^ seed);
  const mode = seed % 5;

  for (let index = 0; index < samples; index += 1) {
    const t = index / sampleRate;
    const beatGate = Math.floor(t * (4 + (seed % 7))) % 2 === 0 ? 1 : -1;
    const wobble = Math.sin(Math.PI * 2 * (0.17 + seed * 0.013) * t);
    const aliasTone = Math.sin(Math.PI * 2 * (370 + seed * 53 + wobble * 240) * t);
    const tritone = Math.sin(Math.PI * 2 * (523.25 * Math.SQRT2 + seed * 11) * t);
    const sub = Math.sin(Math.PI * 2 * (34 + seed) * t) * beatGate;
    const impulse = random() > 0.985 ? (random() * 2 - 1) * 2.4 : 0;
    const white = random() * 2 - 1;
    const sample = mode === 0
      ? aliasTone * 0.45 + tritone * 0.35 + white * 0.3
      : mode === 1
        ? Math.tanh((sub * 1.2 + impulse + white * 0.18) * 3)
        : mode === 2
          ? (random() > 0.5 ? 0.92 : -0.92) * Math.sin(Math.PI * 2 * (2 + seed * 0.1) * t)
          : mode === 3
            ? Math.sin(Math.PI * 2 * (80 + 900 * random()) * t) * (random() > 0.7 ? 1 : 0.12)
            : aliasTone * 0.28 + sub * 0.42 + impulse + white * 0.22;
    pcm[index] = Math.round(clamp01((sample + 1) / 2) * 65_534 - 32_767);
  }

  return encodeWav(pcm, sampleRate);
}

function encodeWav(pcm: Int16Array, sampleRate: number) {
  const dataBytes = pcm.byteLength;
  const bytes = new Uint8Array(44 + dataBytes);
  const view = new DataView(bytes.buffer);
  writeAscii(bytes, 0, "RIFF");
  view.setUint32(4, 36 + dataBytes, true);
  writeAscii(bytes, 8, "WAVE");
  writeAscii(bytes, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(bytes, 36, "data");
  view.setUint32(40, dataBytes, true);
  bytes.set(new Uint8Array(pcm.buffer), 44);
  return bytes;
}

function writeAscii(bytes: Uint8Array, offset: number, value: string) {
  for (let index = 0; index < value.length; index += 1) {
    bytes[offset + index] = value.charCodeAt(index);
  }
}

async function hashFile(filePath: string) {
  return (await hashBoundedFile(filePath, MAX_SOURCE_BYTES, "Benchmark source")).sha256;
}

function sanitizeFileName(path: string) {
  const digest = new Bun.CryptoHasher("sha256").update(path).digest("hex").slice(0, 16);
  const readable = path.replaceAll("/", "__").replaceAll("\\", "__").replace(/[<>:"|?*]/g, "_").slice(-120);
  return `${digest}-${readable}`;
}

function gitBlobHash(bytes: Uint8Array, digestLength: number) {
  return createHash(digestLength === 64 ? "sha256" : "sha1")
    .update(`blob ${bytes.byteLength}\0`)
    .update(bytes)
    .digest("hex");
}

function isSafeRepositoryPath(sourcePath: string) {
  return sourcePath.length > 0 && sourcePath.length <= 1_024 && !sourcePath.includes("\\")
    && sourcePath.split("/").every((segment) => segment.length > 0 && segment !== "." && segment !== "..");
}

function stableHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry32(seed: number) {
  return () => {
    let value = seed += 0x6d2b79f5;
    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

function buildReport(manifest: Awaited<ReturnType<typeof buildBenchmark>>) {
  const entries = [...manifest.entries];
  const rows = entries
    .sort((left, right) => labelOrder(left.label) - labelOrder(right.label) || right.overallScore - left.overallScore)
    .map((entry) => `| ${entry.label} | ${entry.overallScore.toFixed(3)} | ${entry.durationSeconds.toFixed(1)} | ${entry.localPath} | ${entry.sourcePath} | ${entry.sha256.slice(0, 12)} |`);

  return [
    "# SynaestheticEvaluator Benchmark",
    "",
    `Version: ${manifest.benchmarkVersion}`,
    `Counts: good ${manifest.counts.good}, average ${manifest.counts.average}, bad ${manifest.counts.bad}`,
    "",
    "| Label | Raw Score | Seconds | Local Path | Source Path | SHA-256 |",
    "| --- | ---: | ---: | --- | --- | --- |",
    ...rows,
  ].join("\n");
}

function labelOrder(label: "good" | "average" | "bad") {
  return label === "good" ? 0 : label === "average" ? 1 : 2;
}

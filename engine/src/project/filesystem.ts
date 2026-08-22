import {
  closeSync,
  existsSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, parse, resolve } from "node:path";
import {
  HYPERFOCUS_ASSETS_FILENAME,
  HYPERFOCUS_DIRECTORY,
  HYPERFOCUS_PROJECT_FILENAME,
  openHyperfocusProjectFiles,
  type HyperfocusOpenedProject,
  type HyperfocusProjectFiles,
  type HyperfocusUnpackOptions,
} from "./index.ts";

const STAGING_DIRECTORY = ".hyperfocus.next";
const PREVIOUS_DIRECTORY = ".hyperfocus.previous";

export type HyperfocusFilesystemPhase = "prepared" | "backup-installed" | "committed";

export type HyperfocusFilesystemWriteOptions = HyperfocusUnpackOptions & {
  /** Observability/failure-injection boundary. Throwing simulates interruption. */
  onPhase?: (phase: HyperfocusFilesystemPhase) => void | Promise<void>;
  /** Defaults true. False leaves recoverable artifacts for process-crash tests. */
  recoverOnError?: boolean;
};

export type HyperfocusFilesystemRecoveryStatus = "canonical" | "completed" | "empty" | "rolled-back";

export type HyperfocusFilesystemEvidence = {
  status: HyperfocusFilesystemRecoveryStatus;
  projectRoot: string;
  projectDirectory: string;
  directorySync: boolean;
  removedArtifacts: string[];
};

export type HyperfocusFilesystemWriteResult = HyperfocusFilesystemEvidence & {
  status: "canonical";
  replacedExisting: boolean;
};

type Candidate<TProject> = {
  exists: boolean;
  valid: boolean;
  opened?: HyperfocusOpenedProject<TProject>;
  files?: HyperfocusProjectFiles;
  error?: unknown;
};

function projectPaths(projectRoot: string) {
  const root = resolve(projectRoot);
  if (parse(root).root === root) throw new Error("Hyperfocus project root must not be a filesystem root");
  const canonical = resolve(root, HYPERFOCUS_DIRECTORY);
  const staging = resolve(root, STAGING_DIRECTORY);
  const previous = resolve(root, PREVIOUS_DIRECTORY);
  for (const path of [canonical, staging, previous]) {
    if (dirname(path) !== root) throw new Error("Hyperfocus persistence path escaped the project root");
  }
  return { root, canonical, staging, previous };
}

function assertOrdinaryDirectory(path: string) {
  const stat = lstatSync(path);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error(`Hyperfocus persistence refuses non-directory or symbolic-link path: ${path}`);
}

function removeTransactionDirectory(path: string, expectedParent: string, removed: string[]) {
  if (!existsSync(path)) return;
  if (dirname(resolve(path)) !== expectedParent) throw new Error(`Refusing to remove persistence path outside project root: ${path}`);
  assertOrdinaryDirectory(path);
  rmSync(path, { recursive: true, force: false });
  removed.push(path);
}

function durableWrite(path: string, bytes: Uint8Array) {
  const descriptor = openSync(path, "wx");
  try {
    writeFileSync(descriptor, new Uint8Array(bytes));
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
}

function syncDirectory(path: string) {
  let descriptor: number | undefined;
  try {
    descriptor = openSync(path, "r");
    fsyncSync(descriptor);
    return true;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "EACCES" || code === "EBADF" || code === "EINVAL" || code === "EISDIR" || code === "EPERM") return false;
    throw error;
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function readFiles(directory: string): HyperfocusProjectFiles {
  const project = readFileSync(resolve(directory, HYPERFOCUS_PROJECT_FILENAME));
  const assets = readFileSync(resolve(directory, HYPERFOCUS_ASSETS_FILENAME));
  return {
    projectJson: new Uint8Array(project.buffer, project.byteOffset, project.byteLength),
    assetsArchive: new Uint8Array(assets.buffer, assets.byteOffset, assets.byteLength),
  };
}

async function inspectCandidate<TProject>(directory: string, options: HyperfocusUnpackOptions): Promise<Candidate<TProject>> {
  if (!existsSync(directory)) return { exists: false, valid: false };
  try {
    assertOrdinaryDirectory(directory);
    const files = readFiles(directory);
    const opened = await openHyperfocusProjectFiles<TProject>(files.projectJson, files.assetsArchive, options);
    return { exists: true, valid: true, files, opened };
  } catch (error) {
    return { exists: true, valid: false, error };
  }
}

function invalidCandidates(candidates: Array<[string, Candidate<unknown>]>) {
  return candidates
    .filter(([, candidate]) => candidate.exists && !candidate.valid)
    .map(([name, candidate]) => `${name}: ${candidate.error instanceof Error ? candidate.error.message : String(candidate.error)}`);
}

/** Reads and validates the canonical pair from a filesystem project root. */
export async function readHyperfocusProjectPair<TProject = unknown>(
  projectRoot: string,
  options: HyperfocusUnpackOptions = {},
) {
  const { canonical } = projectPaths(projectRoot);
  const candidate = await inspectCandidate<TProject>(canonical, options);
  if (!candidate.valid || !candidate.opened || !candidate.files) {
    throw new Error(`Canonical Hyperfocus pair is missing or invalid${candidate.error instanceof Error ? `: ${candidate.error.message}` : ""}`);
  }
  return { ...candidate.opened, files: candidate.files };
}

/**
 * Recovers an interrupted directory-swap transaction without guessing between
 * unvalidated pairs. A fully staged pair wins only after the old canonical
 * directory was moved aside; otherwise the still-valid canonical pair wins.
 */
export async function recoverHyperfocusProjectPair<TProject = unknown>(
  projectRoot: string,
  options: HyperfocusUnpackOptions = {},
): Promise<HyperfocusFilesystemEvidence> {
  const paths = projectPaths(projectRoot);
  const removedArtifacts: string[] = [];
  const [canonical, staging, previous] = await Promise.all([
    inspectCandidate<TProject>(paths.canonical, options),
    inspectCandidate<TProject>(paths.staging, options),
    inspectCandidate<TProject>(paths.previous, options),
  ]);
  let status: HyperfocusFilesystemRecoveryStatus;

  if (canonical.valid) {
    removeTransactionDirectory(paths.staging, paths.root, removedArtifacts);
    removeTransactionDirectory(paths.previous, paths.root, removedArtifacts);
    status = "canonical";
  } else if (canonical.exists && previous.valid) {
    removeTransactionDirectory(paths.canonical, paths.root, removedArtifacts);
    renameSync(paths.previous, paths.canonical);
    removeTransactionDirectory(paths.staging, paths.root, removedArtifacts);
    status = "rolled-back";
  } else if (!canonical.exists && previous.valid && staging.valid) {
    renameSync(paths.staging, paths.canonical);
    removeTransactionDirectory(paths.previous, paths.root, removedArtifacts);
    status = "completed";
  } else if (!canonical.exists && previous.valid) {
    renameSync(paths.previous, paths.canonical);
    removeTransactionDirectory(paths.staging, paths.root, removedArtifacts);
    status = "rolled-back";
  } else if (staging.valid) {
    if (canonical.exists) removeTransactionDirectory(paths.canonical, paths.root, removedArtifacts);
    renameSync(paths.staging, paths.canonical);
    removeTransactionDirectory(paths.previous, paths.root, removedArtifacts);
    status = "completed";
  } else if (!canonical.exists && !staging.exists && !previous.exists) {
    status = "empty";
  } else {
    const details = invalidCandidates([
      [HYPERFOCUS_DIRECTORY, canonical],
      [STAGING_DIRECTORY, staging],
      [PREVIOUS_DIRECTORY, previous],
    ]);
    throw new Error(`No valid Hyperfocus project pair is recoverable${details.length ? ` (${details.join("; ")})` : ""}`);
  }

  const directorySync = existsSync(paths.root) ? syncDirectory(paths.root) : false;
  return { status, projectRoot: paths.root, projectDirectory: paths.canonical, directorySync, removedArtifacts };
}

/**
 * Crash-safe pair replacement for CLI/filesystem hosts. The canonical directory
 * itself is swapped atomically, so readers never accept a mixed JSON/archive pair.
 */
export async function writeHyperfocusProjectPair(
  projectRoot: string,
  files: HyperfocusProjectFiles,
  options: HyperfocusFilesystemWriteOptions = {},
): Promise<HyperfocusFilesystemWriteResult> {
  const paths = projectPaths(projectRoot);
  await openHyperfocusProjectFiles(files.projectJson, files.assetsArchive, options);
  mkdirSync(paths.root, { recursive: true });
  if (existsSync(paths.staging) || existsSync(paths.previous)) {
    throw new Error("A Hyperfocus persistence transaction is pending; call recoverHyperfocusProjectPair() before writing again");
  }
  const replacedExisting = existsSync(paths.canonical);
  let directorySync = syncDirectory(paths.root);
  let ownsStaging = false;

  try {
    mkdirSync(paths.staging);
    ownsStaging = true;
    durableWrite(resolve(paths.staging, HYPERFOCUS_PROJECT_FILENAME), files.projectJson);
    durableWrite(resolve(paths.staging, HYPERFOCUS_ASSETS_FILENAME), files.assetsArchive);
    directorySync = syncDirectory(paths.staging) && directorySync;
    await options.onPhase?.("prepared");

    if (replacedExisting) renameSync(paths.canonical, paths.previous);
    directorySync = syncDirectory(paths.root) && directorySync;
    await options.onPhase?.("backup-installed");

    renameSync(paths.staging, paths.canonical);
    directorySync = syncDirectory(paths.root) && directorySync;
    await options.onPhase?.("committed");

    await readHyperfocusProjectPair(paths.root, options);
    const removedArtifacts: string[] = [];
    removeTransactionDirectory(paths.previous, paths.root, removedArtifacts);
    directorySync = syncDirectory(paths.root) && directorySync;
    return {
      status: "canonical",
      projectRoot: paths.root,
      projectDirectory: paths.canonical,
      directorySync,
      removedArtifacts,
      replacedExisting,
    };
  } catch (error) {
    // An EEXIST here can mean another writer owns the fixed staging directory.
    // Never recover or delete another in-flight writer's transaction.
    if (ownsStaging && options.recoverOnError !== false) {
      try {
        await recoverHyperfocusProjectPair(paths.root, options);
      } catch (recoveryError) {
        throw new AggregateError([error, recoveryError], "Hyperfocus pair write failed and automatic recovery also failed");
      }
    }
    throw error;
  }
}

export const HYPERFOCUS_STAGING_DIRECTORY = STAGING_DIRECTORY;
export const HYPERFOCUS_PREVIOUS_DIRECTORY = PREVIOUS_DIRECTORY;

import { randomUUID } from "node:crypto";
import {
  lstat,
  open,
  rename,
  rm,
  stat,
} from "node:fs/promises";
import path from "node:path";
import { Database } from "bun:sqlite";
import { readBoundedUtf8File } from "@hyperfocus/pad-pilot/bounded-file";

export { readBoundedUtf8File } from "@hyperfocus/pad-pilot/bounded-file";

type LockOwner = {
  createdAt: number;
  pid: number;
  token?: string;
};

type DirectoryTransaction = {
  backupName: string;
  hadDestination: boolean;
  stagedName: string;
  version: 1;
};

type PromotionOptions = {
  afterDestinationPromoted?: () => Promise<void> | void;
  validate?: (directory: string) => Promise<void> | void;
};

const lockPollMilliseconds = 50;
const lockWaitMilliseconds = 60_000;
const incompleteLockGraceMilliseconds = 5_000;
const coordinationSuffix = ".padpilot-coordination.sqlite";
const inProcessLocks = new Set<string>();
export const processLockByteLimit = 8 * 1024;
export const directoryTransactionJournalByteLimit = 32 * 1024;

async function exists(target: string) {
  try {
    await lstat(target);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

function isProcessAlive(pid: number) {
  if (!Number.isSafeInteger(pid) || pid <= 0) {
    return false;
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

async function readLockOwner(lockPath: string) {
  try {
    const contents = await readBoundedUtf8File(lockPath, processLockByteLimit, "Filesystem transaction lock");
    const parsed = JSON.parse(contents) as Partial<LockOwner>;
    const createdAt = typeof parsed.createdAt === "number" ? parsed.createdAt : Number.NaN;
    const pid = typeof parsed.pid === "number" ? parsed.pid : Number.NaN;
    const token = typeof parsed.token === "string" && parsed.token.length > 0
      ? parsed.token
      : undefined;
    if (Number.isSafeInteger(createdAt) && createdAt > 0
        && Number.isSafeInteger(pid) && pid > 0) {
      return { createdAt, pid, token };
    }
  } catch {
    // A process can be interrupted between creating and populating the lock.
  }
  return null;
}

function isSqliteBusy(error: unknown) {
  return (error as { code?: unknown }).code === "SQLITE_BUSY";
}

async function acquireCoordinationLock(lockPath: string, deadline: number) {
  const database = new Database(`${lockPath}${coordinationSuffix}`, { create: true, strict: true });
  database.exec("PRAGMA busy_timeout = 0");
  while (true) {
    try {
      database.exec("BEGIN EXCLUSIVE");
      return database;
    } catch (error) {
      if (!isSqliteBusy(error)) {
        database.close(false);
        throw error;
      }
      if (Date.now() >= deadline) {
        database.close(false);
        throw new Error(`Timed out waiting for filesystem transaction lock: ${lockPath}`);
      }
      await Bun.sleep(lockPollMilliseconds);
    }
  }
}

async function acquireInProcessLock(lockPath: string, deadline: number) {
  const key = process.platform === "win32" ? lockPath.toLowerCase() : lockPath;
  let waited = false;
  while (inProcessLocks.has(key)) {
    waited = true;
    if (Date.now() >= deadline) {
      throw new Error(`Timed out waiting for filesystem transaction lock: ${lockPath}`);
    }
    await Bun.sleep(Math.min(lockPollMilliseconds, Math.max(1, deadline - Date.now())));
  }
  if (waited && Date.now() >= deadline) {
    throw new Error(`Timed out waiting for filesystem transaction lock: ${lockPath}`);
  }
  inProcessLocks.add(key);
  let released = false;
  return () => {
    if (!released) {
      released = true;
      inProcessLocks.delete(key);
    }
  };
}

async function acquireProcessLock(lockPath: string, deadline: number) {
  while (true) {
    const candidateOwner = {
      createdAt: Date.now(),
      pid: process.pid,
      token: randomUUID(),
    } satisfies LockOwner;
    try {
      const handle = await open(lockPath, "wx");
      try {
        await handle.writeFile(JSON.stringify(candidateOwner));
        await handle.sync();
      } finally {
        await handle.close();
      }
      return candidateOwner;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
        throw error;
      }
    }

    const owner = await readLockOwner(lockPath);
    if (owner && !isProcessAlive(owner.pid)) {
      await rm(lockPath, { force: true });
      continue;
    }
    if (!owner) {
      const lockStat = await stat(lockPath).catch(() => null);
      if (lockStat && Date.now() - lockStat.mtimeMs > incompleteLockGraceMilliseconds) {
        await rm(lockPath, { force: true });
        continue;
      }
    }
    if (Date.now() >= deadline) {
      throw new Error(`Timed out waiting for filesystem transaction lock: ${lockPath}`);
    }
    await Bun.sleep(lockPollMilliseconds);
  }
}

async function releaseProcessLock(lockPath: string, owner: LockOwner) {
  const currentOwner = await readLockOwner(lockPath);
  if (!owner.token || currentOwner?.token !== owner.token) {
    throw new Error(`Filesystem transaction lock ownership changed before release: ${lockPath}`);
  }
  await rm(lockPath);
}

export async function withProcessLock<T>(lockPath: string, action: () => Promise<T> | T, waitMilliseconds = lockWaitMilliseconds) {
  if (!Number.isSafeInteger(waitMilliseconds) || waitMilliseconds < 0) {
    throw new Error("Filesystem transaction lock wait must be a non-negative integer.");
  }
  const resolvedLock = path.resolve(lockPath);
  const deadline = Date.now() + waitMilliseconds;
  const releaseInProcessLock = await acquireInProcessLock(resolvedLock, deadline);
  try {
    const database = await acquireCoordinationLock(resolvedLock, deadline);
    let owner: LockOwner | null = null;
    let outcome: { error: unknown; status: "error" } | { status: "pending" } | { status: "success"; value: T } = {
      status: "pending",
    };
    try {
      owner = await acquireProcessLock(resolvedLock, deadline);
      outcome = { status: "success", value: await action() };
    } catch (error) {
      outcome = { error, status: "error" };
    } finally {
      const cleanupErrors: unknown[] = [];
      if (owner) {
        try {
          await releaseProcessLock(resolvedLock, owner);
        } catch (error) {
          cleanupErrors.push(error);
        }
      }
      try {
        database.exec("ROLLBACK");
      } catch (error) {
        cleanupErrors.push(error);
      }
      try {
        database.close(false);
      } catch (error) {
        cleanupErrors.push(error);
      }
      if (cleanupErrors.length > 0) {
        if (outcome.status === "error") {
          throw new AggregateError([outcome.error, ...cleanupErrors], `Filesystem transaction and lock cleanup failed: ${resolvedLock}`);
        }
        if (cleanupErrors.length === 1) {
          throw cleanupErrors[0];
        }
        throw new AggregateError(cleanupErrors, `Filesystem transaction lock cleanup failed: ${resolvedLock}`);
      }
    }
    if (outcome.status === "error") {
      throw outcome.error;
    }
    return outcome.value;
  } finally {
    releaseInProcessLock();
  }
}

function transactionPaths(destination: string) {
  const parent = path.dirname(destination);
  const base = path.basename(destination);
  return {
    committed: path.join(parent, `.${base}.padpilot-transaction-committed`),
    journal: path.join(parent, `.${base}.padpilot-transaction.json`),
    lock: path.join(parent, `.${base}.padpilot-transaction.lock`),
    parent,
    legacyBackupPrefix: `.${base}.padpilot-backup-`,
    legacyStagePrefix: `.${base}.padpilot-stage-`,
    safeBackupPrefix: `.${base}.pp-b-`,
    safeStagePrefix: `.${base}.pp-s-`,
  };
}

function resolveTransactionChild(parent: string, name: string, prefixes: readonly string[]) {
  if (!prefixes.some((prefix) => name.startsWith(prefix)) || path.basename(name) !== name) {
    throw new Error("Directory transaction journal contains an unsafe path.");
  }
  const resolved = path.resolve(parent, name);
  if (path.dirname(resolved) !== parent) {
    throw new Error("Directory transaction journal escaped its destination directory.");
  }
  return resolved;
}

async function readDirectoryTransaction(destination: string) {
  const paths = transactionPaths(destination);
  if (!await exists(paths.journal)) {
    return null;
  }
  const contents = await readBoundedUtf8File(
    paths.journal,
    directoryTransactionJournalByteLimit,
    "Directory transaction journal",
  );
  const parsed = JSON.parse(contents) as Partial<DirectoryTransaction>;
  if (parsed.version !== 1 || typeof parsed.hadDestination !== "boolean"
      || typeof parsed.backupName !== "string" || typeof parsed.stagedName !== "string") {
    throw new Error(`Invalid directory transaction journal: ${paths.journal}`);
  }
  return {
    backup: resolveTransactionChild(paths.parent, parsed.backupName, [
      paths.safeBackupPrefix,
      paths.legacyBackupPrefix,
    ]),
    hadDestination: parsed.hadDestination,
    staged: resolveTransactionChild(paths.parent, parsed.stagedName, [
      paths.safeStagePrefix,
      paths.legacyStagePrefix,
    ]),
  };
}

async function recoverDirectoryTransaction(destination: string) {
  const paths = transactionPaths(destination);
  const transaction = await readDirectoryTransaction(destination);
  if (!transaction) {
    await rm(paths.committed, { force: true });
    return;
  }

  if (await exists(paths.committed)) {
    await rm(transaction.backup, { force: true, recursive: true });
  } else if (await exists(transaction.backup)) {
    await rm(destination, { force: true, recursive: true });
    await rename(transaction.backup, destination);
  } else if (!transaction.hadDestination && !await exists(transaction.staged) && await exists(destination)) {
    await rm(destination, { force: true, recursive: true });
  }

  await rm(transaction.staged, { force: true, recursive: true });
  await rm(paths.committed, { force: true });
  await rm(paths.journal, { force: true });
}

export async function writeDurableNewFile(filePath: string, contents: string) {
  const handle = await open(filePath, "wx");
  let closed = false;
  try {
    await handle.writeFile(contents);
    await handle.sync();
    await handle.close();
    closed = true;
  } catch (error) {
    const cleanupErrors: unknown[] = [];
    if (!closed) {
      try {
        await handle.close();
      } catch (cleanupError) {
        cleanupErrors.push(cleanupError);
      }
    }
    try {
      await rm(filePath, { force: true });
    } catch (cleanupError) {
      cleanupErrors.push(cleanupError);
    }
    if (cleanupErrors.length > 0) {
      throw new AggregateError([error, ...cleanupErrors], `Failed to persist and clean up transaction marker: ${filePath}`);
    }
    throw error;
  }
}

export async function promoteStagedDirectory(stagedDirectory: string, destinationDirectory: string, options: PromotionOptions = {}) {
  const stagedInput = path.resolve(stagedDirectory);
  const destination = path.resolve(destinationDirectory);
  const paths = transactionPaths(destination);
  if (path.dirname(stagedInput) !== paths.parent || stagedInput === destination) {
    throw new Error("Staged and destination directories must be distinct siblings.");
  }
  const stagedStat = await lstat(stagedInput);
  if (!stagedStat.isDirectory() || stagedStat.isSymbolicLink()) {
    throw new Error("Staged deployment source must be a real directory.");
  }

  return withProcessLock(paths.lock, async () => {
    await recoverDirectoryTransaction(destination);
    const suffix = `${process.pid}-${randomUUID()}`;
    const staged = path.join(paths.parent, `${paths.safeStagePrefix}${suffix}`);
    const backup = path.join(paths.parent, `${paths.safeBackupPrefix}${suffix}`);
    await rename(stagedInput, staged);
    try {
      if (options.validate) {
        await options.validate(staged);
      }
      const hadDestination = await exists(destination);
      if (hadDestination) {
        const destinationStat = await lstat(destination);
        if (!destinationStat.isDirectory() || destinationStat.isSymbolicLink()) {
          throw new Error("Refusing to replace a non-directory or linked destination.");
        }
      }
      const journal = {
        backupName: path.basename(backup),
        hadDestination,
        stagedName: path.basename(staged),
        version: 1,
      } satisfies DirectoryTransaction;
      await writeDurableNewFile(paths.journal, JSON.stringify(journal));
      if (hadDestination) {
        await rename(destination, backup);
      }
      await rename(staged, destination);
      if (options.afterDestinationPromoted) {
        await options.afterDestinationPromoted();
      }
      await writeDurableNewFile(paths.committed, "committed\n");

      let retainedBackup: string | null = null;
      try {
        await recoverDirectoryTransaction(destination);
      } catch {
        retainedBackup = await exists(backup) ? backup : null;
      }
      return { destination, retainedBackup };
    } catch (error) {
      try {
        await recoverDirectoryTransaction(destination);
      } catch (recoveryError) {
        throw new AggregateError([error, recoveryError], "Directory promotion and rollback both failed.");
      }
      throw error;
    } finally {
      await rm(staged, { force: true, recursive: true });
    }
  });
}

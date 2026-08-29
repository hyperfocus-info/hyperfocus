import { afterEach, describe, expect, it } from "bun:test";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  directoryTransactionJournalByteLimit,
  processLockByteLimit,
  promoteStagedDirectory,
  withProcessLock,
} from "./directory-transaction";

const tempRoots: string[] = [];

afterEach(() => {
  while (tempRoots.length > 0) {
    const root = tempRoots.pop();
    if (root) {
      rmSync(root, { force: true, recursive: true });
    }
  }
});

function writeDirectory(directory: string, contents: string) {
  mkdirSync(directory, { recursive: true });
  writeFileSync(path.join(directory, "value.txt"), contents);
}

describe("promoteStagedDirectory", () => {
  it("rolls back the old directory if promotion fails before commit", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "padpilot-directory-transaction-"));
    tempRoots.push(root);
    const destination = path.join(root, "output");
    const staged = path.join(root, "staged");
    writeDirectory(destination, "old");
    writeDirectory(staged, "new");

    await expect(promoteStagedDirectory(staged, destination, {
      afterDestinationPromoted: () => {
        throw new Error("injected failure");
      },
    })).rejects.toThrow("injected failure");
    expect(readFileSync(path.join(destination, "value.txt"), "utf8")).toBe("old");
  });

  it("serializes concurrent directory promotions without exposing a missing output", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "padpilot-directory-concurrency-"));
    tempRoots.push(root);
    const destination = path.join(root, "output");
    const first = path.join(root, "first");
    const second = path.join(root, "second");
    writeDirectory(destination, "old");
    writeDirectory(first, "first");
    writeDirectory(second, "second");

    await Promise.all([
      promoteStagedDirectory(first, destination),
      promoteStagedDirectory(second, destination),
    ]);
    expect(["first", "second"]).toContain(readFileSync(path.join(destination, "value.txt"), "utf8"));
  });

  it("restores a pre-crash backup before starting the next promotion", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "padpilot-directory-recovery-"));
    tempRoots.push(root);
    const destination = path.join(root, "output");
    const backupName = ".output.padpilot-backup-crash";
    const stagedName = ".output.padpilot-stage-crash";
    writeDirectory(destination, "uncommitted new");
    writeDirectory(path.join(root, backupName), "old");
    writeFileSync(path.join(root, ".output.padpilot-transaction.json"), JSON.stringify({
      backupName,
      hadDestination: true,
      stagedName,
      version: 1,
    }));
    const nextStaged = path.join(root, "next-staged");
    writeDirectory(nextStaged, "next");

    await expect(promoteStagedDirectory(nextStaged, destination, {
      validate: () => {
        throw new Error("stop after recovery");
      },
    })).rejects.toThrow("stop after recovery");
    expect(readFileSync(path.join(destination, "value.txt"), "utf8")).toBe("old");
  });

  it("fails closed before reading an oversized transaction journal", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "padpilot-directory-oversized-journal-"));
    tempRoots.push(root);
    const destination = path.join(root, "output");
    const staged = path.join(root, "staged");
    writeDirectory(destination, "old");
    writeDirectory(staged, "new");
    writeFileSync(
      path.join(root, ".output.padpilot-transaction.json"),
      "x".repeat(directoryTransactionJournalByteLimit + 1),
    );

    await expect(promoteStagedDirectory(staged, destination)).rejects.toThrow("exceeds");
    expect(readFileSync(path.join(destination, "value.txt"), "utf8")).toBe("old");
    expect(readFileSync(path.join(staged, "value.txt"), "utf8")).toBe("new");
  });

  it("recovers only an old incomplete oversized process lock", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "padpilot-directory-oversized-lock-"));
    tempRoots.push(root);
    const lockPath = path.join(root, "transaction.lock");
    writeFileSync(lockPath, "x".repeat(processLockByteLimit + 1));
    const oldTimestamp = new Date(Date.now() - 10_000);
    utimesSync(lockPath, oldTimestamp, oldTimestamp);

    await expect(withProcessLock(lockPath, () => "recovered", 500)).resolves.toBe("recovered");
    expect(existsSync(lockPath)).toBe(false);

    writeFileSync(lockPath, "x".repeat(processLockByteLimit + 1));
    await expect(withProcessLock(lockPath, () => "unsafe", 100)).rejects.toThrow("Timed out");
    expect(existsSync(lockPath)).toBe(true);
  });

  it("serializes contenders while recovering a stale process lock", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "padpilot-stale-lock-race-"));
    tempRoots.push(root);
    const lockPath = path.join(root, "transaction.lock");
    writeFileSync(lockPath, JSON.stringify({
      createdAt: Date.now() - 10_000,
      pid: 2_147_483_647,
      token: randomUUID(),
    }));

    let activeActions = 0;
    let maximumActiveActions = 0;
    await Promise.all(Array.from({ length: 8 }, () => withProcessLock(lockPath, async () => {
      activeActions += 1;
      maximumActiveActions = Math.max(maximumActiveActions, activeActions);
      await Bun.sleep(10);
      activeActions -= 1;
    }, 10_000)));

    expect(maximumActiveActions).toBe(1);
    expect(existsSync(lockPath)).toBe(false);
  });

  it("never removes a successor process lock during release", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "padpilot-lock-successor-"));
    tempRoots.push(root);
    const lockPath = path.join(root, "transaction.lock");
    const successor = JSON.stringify({
      createdAt: Date.now(),
      pid: process.pid,
      token: randomUUID(),
    });

    await expect(withProcessLock(lockPath, () => {
      rmSync(lockPath);
      writeFileSync(lockPath, successor);
    })).rejects.toThrow("ownership changed");

    expect(readFileSync(lockPath, "utf8")).toBe(successor);
  });

  it("rejects invalid lock wait limits instead of waiting forever", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "padpilot-lock-wait-"));
    tempRoots.push(root);
    const lockPath = path.join(root, "transaction.lock");

    await expect(withProcessLock(lockPath, () => undefined, Number.NaN)).rejects.toThrow("non-negative integer");
    expect(existsSync(lockPath)).toBe(false);
  });

  it("enforces the deadline while waiting on a same-process owner", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "padpilot-local-lock-deadline-"));
    tempRoots.push(root);
    const lockPath = path.join(root, "transaction.lock");
    let releaseOwner = () => {};
    const ownerCanFinish = new Promise<void>((resolve) => {
      releaseOwner = resolve;
    });
    let ownerStarted = () => {};
    const ownerDidStart = new Promise<void>((resolve) => {
      ownerStarted = resolve;
    });
    const owner = withProcessLock(lockPath, async () => {
      ownerStarted();
      await ownerCanFinish;
    });
    await ownerDidStart;

    await expect(withProcessLock(lockPath, () => "late", 10)).rejects.toThrow("Timed out");
    releaseOwner();
    await owner;
    await expect(withProcessLock(lockPath, () => "next", 500)).resolves.toBe("next");
  });
});

import { isRecord } from "@hyperfocus/utilities/records";
import { describe, expect, test } from "bun:test";
import {
  SignedSessionAuthority,
  createSignedSessionAuthority,
  createEncryptedPortablePersistenceBackup,
  createGracefulDrainController,
  createPortableMemoryPersistenceAdapter,
  createPortablePersistenceBackup,
  createServerOperations,
  decryptPortableBackup,
  encryptPortableBackup,
  restoreEncryptedPortablePersistenceBackup,
  restorePortablePersistenceBackup,
  type PortablePersistenceSnapshot,
  type SessionReplayStore,
} from "./operations.ts";

const key = (id: string, byte: number) => ({ id, secret: new Uint8Array(32).fill(byte) });

function sequence(prefix = "nonce") {
  let value = 0;
  return () => `${prefix}-${++value}`;
}



function parseBackupSummary(bytes: Uint8Array) {
  const value: unknown = JSON.parse(new TextDecoder().decode(bytes));
  if (!isRecord(value) || typeof value.format !== "string" || typeof value.checksum !== "string"
    || !isRecord(value.snapshot) || !Array.isArray(value.snapshot.players)
    || !value.snapshot.players.every((player) => isRecord(player) && typeof player.id === "string")) {
    throw new Error("Portable persistence backup fixture has an invalid shape");
  }
  return {
    format: value.format,
    checksum: value.checksum,
    snapshot: {
      players: value.snapshot.players.map((player) => {
        if (!isRecord(player) || typeof player.id !== "string") throw new Error("Portable persistence player fixture has an invalid shape");
        return { id: player.id };
      }),
    },
  };
}

function parseCiphertextEnvelope(bytes: Uint8Array) {
  const value: unknown = JSON.parse(new TextDecoder().decode(bytes));
  if (!isRecord(value) || typeof value.ciphertext !== "string") throw new Error("Encrypted backup fixture has no ciphertext");
  return { ...Object.fromEntries(Object.entries(value)), ciphertext: value.ciphertext };
}

describe("signed session identity", () => {
  test("supports factory, constructor, and instanceof compatibility", () => {
    const options = { issuer: "game", audience: "server", keys: [key("active", 1)], activeKeyId: "active" };
    const created = createSignedSessionAuthority(options);
    const constructed = new SignedSessionAuthority(options);

    expect(created).toBeInstanceOf(SignedSessionAuthority);
    expect(constructed).toBeInstanceOf(SignedSessionAuthority);
  });

  test("authenticates bounded claims once and rejects tampering, replay, and expiry", async () => {
    let now = 1_000_000;
    const sessions = new SignedSessionAuthority({
      issuer: "example-game",
      audience: "authoritative-server",
      keys: [key("2026-08", 7)],
      activeKeyId: "2026-08",
      sessionTtlMs: 1_000,
      maxSessionTtlMs: 2_000,
      maxClockSkewMs: 0,
      now: () => now,
      nonce: sequence(),
    });

    const token = await sessions.issue("player-1", { attributes: { role: "player", entitlements: ["base"] } });
    const identity = await sessions.verify(token);
    expect(identity.subject).toBe("player-1");
    expect(identity.keyId).toBe("2026-08");
    expect(identity.attributes).toEqual({ entitlements: ["base"], role: "player" });
    await expect(sessions.verify(token)).rejects.toThrow("replay detected");

    const base64url = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    const nonCanonicalParts = token.split(".");
    const last = nonCanonicalParts[2]!.at(-1)!;
    const nonCanonicalIndex = (base64url.indexOf(last) & 48) | ((base64url.indexOf(last) + 1) & 15);
    nonCanonicalParts[2] = `${nonCanonicalParts[2]!.slice(0, -1)}${base64url[nonCanonicalIndex]}`;
    await expect(sessions.verify(nonCanonicalParts.join("."))).rejects.toThrow("not canonical");

    const tokenParts = token.split(".");
    tokenParts[2] = `${tokenParts[2]!.startsWith("A") ? "B" : "A"}${tokenParts[2]!.slice(1)}`;
    const tampered = tokenParts.join(".");
    await expect(sessions.verify(tampered)).rejects.toThrow("signature verification failed");

    const expiring = await sessions.issue("player-2");
    now += 1_000;
    await expect(sessions.verify(expiring)).rejects.toThrow("expired");
  });

  test("rotates with an overlap window and rejects a retired signing key", async () => {
    let now = 2_000_000;
    const oldKey = key("old", 1);
    const newKey = key("new", 2);
    const sessions = new SignedSessionAuthority({
      issuer: "game",
      audience: "server",
      keys: [oldKey],
      activeKeyId: "old",
      maxClockSkewMs: 0,
      now: () => now,
      nonce: sequence("rotation"),
    });
    const overlapToken = await sessions.issue("old-overlap");
    sessions.rotate([oldKey, newKey], "new");
    const newToken = await sessions.issue("new-active");
    expect((await sessions.verify(overlapToken)).keyId).toBe("old");
    expect((await sessions.verify(newToken)).keyId).toBe("new");

    sessions.rotate([oldKey, newKey], "old");
    const retiredToken = await sessions.issue("old-retired");
    sessions.rotate([newKey], "new");
    await expect(sessions.verify(retiredToken)).rejects.toThrow("unknown or retired");
    now += 1;
  });

  test("admits exactly one concurrent consumer and fails closed at replay capacity", async () => {
    let now = 3_000_000;
    const sessions = new SignedSessionAuthority({
      issuer: "game",
      audience: "server",
      keys: [key("active", 3)],
      activeKeyId: "active",
      sessionTtlMs: 100,
      maxClockSkewMs: 0,
      maxReplayEntries: 2,
      now: () => now,
      nonce: sequence("race"),
    });
    const raced = await sessions.issue("raced");
    const results = await Promise.allSettled([sessions.verify(raced), sessions.verify(raced)]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);

    const second = await sessions.issue("second");
    const refused = await sessions.issue("refused");
    await sessions.verify(second);
    await expect(sessions.verify(refused)).rejects.toThrow("saturated");
    expect(sessions.replayCacheSize()).toBe(2);

    now += 100;
    const afterExpiry = await sessions.issue("after-expiry");
    await sessions.verify(afterExpiry);
    expect(sessions.replayCacheSize()).toBe(1);
  });

  test("coordinates one-use admission across processes through an atomic replay store", async () => {
    const consumed = new Map<string, number>();
    const replayStore: SessionReplayStore = {
      async consume(nonce, expiresAt, now) {
        for (const [candidate, expiry] of consumed) if (now >= expiry) consumed.delete(candidate);
        if (consumed.has(nonce)) return "replayed";
        if (consumed.size >= 2) return "saturated";
        consumed.set(nonce, expiresAt);
        return "accepted";
      },
    };
    const options = {
      issuer: "game",
      audience: "fleet",
      keys: [key("shared", 9)],
      activeKeyId: "shared",
      maxClockSkewMs: 0,
      replayStore,
      now: () => 4_000_000,
      nonce: sequence("distributed"),
    };
    const firstProcess = new SignedSessionAuthority(options);
    const secondProcess = new SignedSessionAuthority(options);
    const token = await firstProcess.issue("player");
    const results = await Promise.allSettled([firstProcess.verify(token), secondProcess.verify(token)]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect(firstProcess.usesExternalReplayStore()).toBe(true);
    expect(() => firstProcess.replayCacheSize()).toThrow("owned by the configured external replay store");

    const unavailable = new SignedSessionAuthority({
      ...options,
      replayStore: { consume: async () => { throw new Error("network partition"); } },
    });
    await expect(unavailable.verify(await unavailable.issue("partitioned"))).rejects.toThrow("fail-closed");
  });

  test("rejects oversized and non-JSON claim data before signing", async () => {
    const sessions = new SignedSessionAuthority({
      issuer: "game",
      audience: "server",
      keys: [key("active", 4)],
      activeKeyId: "active",
      maxAttributesBytes: 32,
      nonce: sequence("invalid"),
    });
    await expect(sessions.issue("player", { attributes: { large: "x".repeat(100) } })).rejects.toThrow("exceed");
    await expect(sessions.issue("player", { attributes: { value: Number.NaN } })).rejects.toThrow("finite");
  });
});

describe("portable persistence backups", () => {
  test("encodes deterministic checksummed backups and restores atomically", async () => {
    const persistence = createPortableMemoryPersistenceAdapter();
    await persistence.savePlayer("z-player", { coins: 3, name: "Zed" });
    await persistence.savePlayer("a-player", { coins: 8 });
    await persistence.saveRoom("room-1", { phase: "running", tick: 40 });
    await persistence.appendEvent?.({ kind: "joined", player: "a-player" });

    const first = await createPortablePersistenceBackup(persistence, { createdAt: 123 });
    const second = await createPortablePersistenceBackup(persistence, { createdAt: 123 });
    expect(first).toEqual(second);
    const decoded = parseBackupSummary(first);
    expect(decoded.format).toBe("hyperfocus-portable-persistence-backup");
    expect(decoded.checksum).toMatch(/^[0-9a-f]{64}$/);
    expect(decoded.snapshot.players.map(({ id }) => id)).toEqual(["a-player", "z-player"]);

    await persistence.savePlayer("a-player", { coins: 999 });
    await restorePortablePersistenceBackup(persistence, first);
    expect(await persistence.loadPlayer("a-player")).toEqual({ coins: 8 });

    await persistence.savePlayer("a-player", { coins: 55 });
    const changedText = new TextDecoder().decode(first).replace('"coins":8', '"coins":9');
    await expect(restorePortablePersistenceBackup(persistence, changedText)).rejects.toThrow("checksum verification failed");
    expect(await persistence.loadPlayer("a-player")).toEqual({ coins: 55 });
    const changedTimestamp = new TextDecoder().decode(first).replace('"createdAt":123', '"createdAt":124');
    await expect(restorePortablePersistenceBackup(persistence, changedTimestamp)).rejects.toThrow("checksum verification failed");
  });

  test("validates an entire replacement before committing any record", async () => {
    const persistence = createPortableMemoryPersistenceAdapter({ maxPlayers: 3, maxRecordBytes: 128 });
    await persistence.savePlayer("original", { safe: true });
    const invalid: PortablePersistenceSnapshot = {
      version: 1,
      players: [
        { id: "replacement", record: { safe: true } },
        { id: "replacement", record: { duplicate: true } },
      ],
      rooms: [],
      events: [],
    };
    await expect(persistence.replacePortableSnapshotAtomic(invalid)).rejects.toThrow("Duplicate");
    expect(await persistence.loadPlayer("original")).toEqual({ safe: true });
    expect(await persistence.loadPlayer("replacement")).toBeNull();
    await expect(persistence.savePlayer("deep", { a: { b: { c: true } } })).resolves.toBeUndefined();
  });

  test("enforces configured record and backup bounds", async () => {
    const persistence = createPortableMemoryPersistenceAdapter({ maxPlayers: 1, maxEvents: 1, maxRecordBytes: 32 });
    await persistence.savePlayer("one", { value: 1 });
    await expect(persistence.savePlayer("two", { value: 2 })).rejects.toThrow("player limit");
    await expect(persistence.saveRoom("large", { text: "x".repeat(100) })).rejects.toThrow("record exceeds byte limit");
    await persistence.appendEvent?.({ event: 1 });
    await expect(persistence.appendEvent?.({ event: 2 })).rejects.toThrow("event limit");
    await expect(createPortablePersistenceBackup(persistence, { maxBackupBytes: 16 })).rejects.toThrow("byte limit");
    expect(() => createPortableMemoryPersistenceAdapter({ maxJsonDepth: 129 })).toThrow("may not exceed 128");
  });

  test("encrypts backups with authenticated key rotation and restores only after validation", async () => {
    const persistence = createPortableMemoryPersistenceAdapter();
    await persistence.savePlayer("player", { score: 42 });
    const oldKey = key("backup-2026-08", 17);
    const nextKey = key("backup-2026-09", 18);
    const nonce = () => new Uint8Array(12).fill(7);
    const encrypted = await createEncryptedPortablePersistenceBackup(
      persistence,
      oldKey,
      { createdAt: 123 },
      { nonce },
    );
    expect(new TextDecoder().decode(encrypted)).not.toContain("score");
    const plaintext = await decryptPortableBackup(encrypted, [oldKey, nextKey]);
    expect(new TextDecoder().decode(plaintext)).toContain('"score":42');

    await persistence.savePlayer("player", { score: 0 });
    await restoreEncryptedPortablePersistenceBackup(persistence, encrypted, [nextKey, oldKey]);
    expect(await persistence.loadPlayer("player")).toEqual({ score: 42 });

    const tampered = parseCiphertextEnvelope(encrypted);
    tampered.ciphertext = `${tampered.ciphertext.slice(0, -1)}${tampered.ciphertext.endsWith("A") ? "B" : "A"}`;
    await expect(decryptPortableBackup(JSON.stringify(tampered), [oldKey])).rejects.toThrow(/authentication failed|byte encoding is invalid/);
    await expect(decryptPortableBackup(encrypted, [nextKey])).rejects.toThrow("is unavailable");
    await expect(encryptPortableBackup(plaintext, { id: "short", secret: new Uint8Array(16) }, { nonce })).rejects.toThrow("exactly 32");
  });
});

describe("graceful operations lifecycle", () => {
  test("stops admission, drains active work, and publishes structured health", async () => {
    let now = 10_000;
    const persistence = createPortableMemoryPersistenceAdapter();
    const operations = createServerOperations({
      sessions: {
        issuer: "game",
        audience: "server",
        keys: [key("active", 5)],
        activeKeyId: "active",
        maxClockSkewMs: 0,
        nonce: sequence("ops"),
      },
      persistence,
      now: () => now,
    });
    const acceptedToken = await operations.sessions.issue("player-1", { attributes: { tier: "free" } });
    expect(await operations.auth.verify(acceptedToken)).toEqual(expect.objectContaining({ ok: true, userId: "player-1" }));
    const refusedDuringDrain = await operations.sessions.issue("player-2");
    const release = operations.drain.begin("request");
    let stopped = false;
    const shutdown = operations.drain.shutdown(async () => { stopped = true; }, { drainTimeoutMs: 1_000, stopTimeoutMs: 1_000 });
    expect(operations.health({ rooms: 2, players: 5 })).toEqual(expect.objectContaining({ status: "draining", live: true, ready: false, rooms: 2, players: 5, inFlight: 1 }));
    expect(await operations.auth.verify(refusedDuringDrain)).toEqual(expect.objectContaining({ ok: false, reason: expect.stringContaining("draining") }));
    now += 25;
    release();
    const evidence = await shutdown;
    expect(evidence).toEqual(expect.objectContaining({ timedOut: false, pendingAtTimeout: 0 }));
    expect(stopped).toBe(true);
    expect(operations.health()).toEqual(expect.objectContaining({ status: "stopped", live: false, ready: false }));
    expect(operations.metrics.summary("operations.auth_accepted")?.latest).toBe(1);
    expect(operations.metrics.diagnostics().series).toBeLessThanOrEqual(512);
  });

  test("records bounded timeout evidence but still invokes the stop callback", async () => {
    const drain = createGracefulDrainController({ maxInFlight: 1 });
    const release = drain.begin("request");
    let stopped = false;
    const evidence = await drain.shutdown(() => { stopped = true; }, { drainTimeoutMs: 5, stopTimeoutMs: 100 });
    expect(evidence.timedOut).toBe(true);
    expect(evidence.pendingAtTimeout).toBe(1);
    expect(stopped).toBe(true);
    release();
  });

  test("survives a sustained bounded work cycle without leaking in-flight state", async () => {
    const drain = createGracefulDrainController({ maxInFlight: 8 });
    for (let index = 0; index < 10_000; index += 1) {
      const release = drain.begin(index % 2 === 0 ? "input" : "tick");
      release();
      release();
    }
    expect(drain.inFlight).toBe(0);
    expect(drain.completedWork).toBe(10_000);
    const evidence = await drain.shutdown(() => undefined, { drainTimeoutMs: 100, stopTimeoutMs: 100 });
    expect(evidence).toEqual(expect.objectContaining({ timedOut: false, completedWork: 10_000 }));
  });

  test("permits restore only after admission has stopped", async () => {
    const persistence = createPortableMemoryPersistenceAdapter();
    await persistence.savePlayer("player", { score: 10 });
    const operations = createServerOperations({
      sessions: { issuer: "game", audience: "server", keys: [key("active", 6)], activeKeyId: "active" },
      persistence,
    });
    const backup = await operations.backup({ createdAt: 5 });
    await persistence.savePlayer("player", { score: 99 });
    await expect(operations.restore(backup)).rejects.toThrow("requires a draining or stopped server");
    await operations.drain.shutdown(() => undefined, { drainTimeoutMs: 100, stopTimeoutMs: 100 });
    await operations.restore(backup);
    expect(await persistence.loadPlayer("player")).toEqual({ score: 10 });
  });
});

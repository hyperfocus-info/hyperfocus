import {
  SignedSessionAuthority,
  createEncryptedPortablePersistenceBackup,
  createPortableMemoryPersistenceAdapter,
  createServerOperations,
  restoreEncryptedPortablePersistenceBackup,
  type SessionReplayStore,
} from "../src/server/operations/operations.ts";

export type ProductionIncidentDrillEvidence = {
  replayPartitionFailedClosed: true;
  crossProcessReplayRejected: true;
  drainCompleted: true;
  corruptedBackupRejected: true;
  encryptedRestoreCompleted: true;
  signingKeyRotated: true;
};

export async function runProductionIncidentDrill(): Promise<ProductionIncidentDrillEvidence> {
  const consumed = new Map<string, number>();
  let replayAvailable = true;
  const replayStore: SessionReplayStore = {
    async consume(nonce, expiresAt, now) {
      if (!replayAvailable) throw new Error("simulated replay-store partition");
      for (const [candidate, expiry] of consumed) if (now >= expiry) consumed.delete(candidate);
      if (consumed.has(nonce)) return "replayed";
      consumed.set(nonce, expiresAt);
      return "accepted";
    },
  };
  const oldSigningKey = { id: "signing-old", secret: new Uint8Array(32).fill(11) };
  const nextSigningKey = { id: "signing-next", secret: new Uint8Array(32).fill(12) };
  let nonce = 0;
  const sessionOptions = {
    issuer: "incident-drill",
    audience: "authoritative-fleet",
    keys: [oldSigningKey],
    activeKeyId: oldSigningKey.id,
    replayStore,
    nonce: () => `incident-${++nonce}`,
  };
  const firstAdmissionProcess = new SignedSessionAuthority(sessionOptions);
  const secondAdmissionProcess = new SignedSessionAuthority(sessionOptions);
  const oneUseToken = await firstAdmissionProcess.issue("player");
  await firstAdmissionProcess.verify(oneUseToken);
  let crossProcessReplayRejected = false;
  try { await secondAdmissionProcess.verify(oneUseToken); }
  catch (cause) { crossProcessReplayRejected = /replay/i.test(String(cause)); }
  if (!crossProcessReplayRejected) throw new Error("Incident drill did not reject a cross-process token replay.");

  replayAvailable = false;
  let replayPartitionFailedClosed = false;
  try { await firstAdmissionProcess.verify(await firstAdmissionProcess.issue("partition")); }
  catch (cause) { replayPartitionFailedClosed = /fail-closed/i.test(String(cause)); }
  if (!replayPartitionFailedClosed) throw new Error("Incident drill did not fail closed during a replay-store partition.");
  replayAvailable = true;

  const persistence = createPortableMemoryPersistenceAdapter();
  await persistence.savePlayer("player", { inventory: ["sword"], coins: 25 });
  const backupKey = { id: "backup-2026-08", secret: new Uint8Array(32).fill(21) };
  const encrypted = await createEncryptedPortablePersistenceBackup(persistence, backupKey, { createdAt: 1 });
  const operations = createServerOperations({ sessions: sessionOptions, persistence });
  const release = operations.drain.begin("simulated-write");
  setTimeout(release, 5);
  const shutdown = await operations.drain.shutdown(() => undefined, { drainTimeoutMs: 1_000, stopTimeoutMs: 1_000 });
  if (shutdown.timedOut || shutdown.pendingAtTimeout !== 0) throw new Error("Incident drill graceful drain timed out.");

  await persistence.savePlayer("player", { inventory: [], coins: 0 });
  const backupDocument: unknown = JSON.parse(new TextDecoder().decode(encrypted));
  if (!isRecord(backupDocument) || typeof backupDocument.ciphertext !== "string") {
    throw new Error("Incident drill encrypted backup was malformed.");
  }
  const tampered = { ...backupDocument, ciphertext: backupDocument.ciphertext };
  tampered.ciphertext = `${tampered.ciphertext.slice(0, -1)}${tampered.ciphertext.endsWith("A") ? "B" : "A"}`;
  let corruptedBackupRejected = false;
  try { await restoreEncryptedPortablePersistenceBackup(persistence, JSON.stringify(tampered), [backupKey]); }
  catch { corruptedBackupRejected = true; }
  if (!corruptedBackupRejected || JSON.stringify(await persistence.loadPlayer("player")) !== '{"coins":0,"inventory":[]}') {
    throw new Error("Incident drill corrupted backup changed live persistence.");
  }
  await restoreEncryptedPortablePersistenceBackup(persistence, encrypted, [backupKey]);
  if (JSON.stringify(await persistence.loadPlayer("player")) !== '{"coins":25,"inventory":["sword"]}') {
    throw new Error("Incident drill encrypted restore did not recover the original player record.");
  }

  firstAdmissionProcess.rotate([oldSigningKey, nextSigningKey], nextSigningKey.id);
  const rotated = await firstAdmissionProcess.issue("rotated");
  if ((await firstAdmissionProcess.verify(rotated)).keyId !== nextSigningKey.id) throw new Error("Incident drill did not activate the rotated signing key.");
  return {
    replayPartitionFailedClosed: true,
    crossProcessReplayRejected: true,
    drainCompleted: true,
    corruptedBackupRejected: true,
    encryptedRestoreCompleted: true,
    signingKeyRotated: true,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

if (import.meta.main) {
  try { console.log(JSON.stringify(await runProductionIncidentDrill(), null, 2)); }
  catch (cause) {
    console.error(cause instanceof Error ? cause.stack ?? cause.message : String(cause));
    process.exitCode = 1;
  }
}

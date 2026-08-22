import { createServerMetrics, type ServerMetrics } from "./metrics.ts";
import type { AuthAdapter, AuthResult, PersistenceAdapter } from "./types.ts";

const SESSION_TOKEN_TYPE = "HFSESSION";
const SESSION_TOKEN_VERSION = 1;
const BACKUP_FORMAT = "hyperfocus-portable-persistence-backup";
const BACKUP_VERSION = 1;
const ENCRYPTED_BACKUP_FORMAT = "hyperfocus-encrypted-backup";
const ENCRYPTED_BACKUP_VERSION = 1;
const SNAPSHOT_VERSION = 1;
const DEFAULT_MAX_TOKEN_BYTES = 8 * 1024;
const DEFAULT_MAX_ATTRIBUTES_BYTES = 4 * 1024;
const DEFAULT_MAX_REPLAY_ENTRIES = 100_000;
const DEFAULT_MAX_CLOCK_SKEW_MS = 5_000;
const DEFAULT_MAX_SESSION_TTL_MS = 24 * 60 * 60 * 1_000;
const DEFAULT_MAX_BACKUP_BYTES = 64 * 1024 * 1024;
const DEFAULT_MAX_RECORD_BYTES = 2 * 1024 * 1024;
const DEFAULT_MAX_RECORDS = 100_000;
const DEFAULT_MAX_EVENTS = 1_000_000;
const DEFAULT_MAX_JSON_DEPTH = 64;
const DEFAULT_MAX_JSON_NODES = 1_000_000;
const DEFAULT_MAX_IN_FLIGHT = 100_000;
const MAX_CONFIGURED_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1_000;
const MAX_CONFIGURED_CLOCK_SKEW_MS = 5 * 60_000;
const MAX_CONFIGURED_TOKEN_BYTES = 64 * 1024;
const MAX_CONFIGURED_ATTRIBUTES_BYTES = 32 * 1024;
const MAX_CONFIGURED_REPLAY_ENTRIES = 10_000_000;
const MAX_CONFIGURED_RECORDS = 10_000_000;
const MAX_CONFIGURED_BACKUP_BYTES = 1024 * 1024 * 1024;
const MAX_CONFIGURED_RECORD_BYTES = 16 * 1024 * 1024;
const MAX_CONFIGURED_JSON_DEPTH = 128;
const MAX_CONFIGURED_JSON_NODES = 10_000_000;
const MAX_CONFIGURED_IN_FLIGHT = 1_000_000;
const MAX_CONFIGURED_METRIC_SERIES = 100_000;

export type PortableJson = null | boolean | number | string | PortableJson[] | { [key: string]: PortableJson };

export type SessionSigningKey = {
  id: string;
  secret: Uint8Array;
  notBefore?: number;
  notAfter?: number;
};

export type SessionReplayConsumeResult = "accepted" | "replayed" | "saturated";

/**
 * Atomic replay-consumption boundary for multi-process admission.
 *
 * A production implementation must perform the absent/insert/expiry operation
 * as one linearizable transaction. Errors are treated as admission failures;
 * callers must never fail open when the backing service is unavailable.
 */
export interface SessionReplayStore {
  consume(nonce: string, expiresAt: number, now: number): Promise<SessionReplayConsumeResult>;
}

export type SignedSessionIdentity = {
  version: 1;
  issuer: string;
  audience: string;
  subject: string;
  sessionId: string;
  issuedAt: number;
  expiresAt: number;
  attributes: Readonly<Record<string, PortableJson>>;
  keyId: string;
};

export type SignedSessionAuthorityOptions = {
  issuer: string;
  audience: string;
  keys: readonly SessionSigningKey[];
  activeKeyId: string;
  sessionTtlMs?: number;
  maxSessionTtlMs?: number;
  maxClockSkewMs?: number;
  maxTokenBytes?: number;
  maxAttributesBytes?: number;
  maxReplayEntries?: number;
  replayStore?: SessionReplayStore;
  now?: () => number;
  nonce?: () => string;
};

export type IssueSessionOptions = {
  ttlMs?: number;
  attributes?: Readonly<Record<string, PortableJson>>;
};

type SessionPayload = {
  v: 1;
  iss: string;
  aud: string;
  sub: string;
  jti: string;
  iat: number;
  exp: number;
  attr: Record<string, PortableJson>;
};

type StoredSigningKey = Omit<SessionSigningKey, "secret"> & { secret: Uint8Array };

export class SignedSessionAuthority {
  readonly #issuer: string;
  readonly #audience: string;
  readonly #sessionTtlMs: number;
  readonly #maxSessionTtlMs: number;
  readonly #maxClockSkewMs: number;
  readonly #maxTokenBytes: number;
  readonly #maxAttributesBytes: number;
  readonly #maxReplayEntries: number;
  readonly #now: () => number;
  readonly #nonce: () => string;
  readonly #replayStore: SessionReplayStore | undefined;
  #keys = new Map<string, StoredSigningKey>();
  #activeKeyId: string;
  #replay = new Map<string, number>();

  constructor(options: SignedSessionAuthorityOptions) {
    assertIdentifier(options.issuer, "Session issuer", 256);
    assertIdentifier(options.audience, "Session audience", 256);
    this.#issuer = options.issuer;
    this.#audience = options.audience;
    this.#maxSessionTtlMs = boundedPositiveInteger(options.maxSessionTtlMs ?? DEFAULT_MAX_SESSION_TTL_MS, "maxSessionTtlMs", MAX_CONFIGURED_SESSION_TTL_MS);
    this.#sessionTtlMs = positiveInteger(options.sessionTtlMs ?? Math.min(60 * 60 * 1_000, this.#maxSessionTtlMs), "sessionTtlMs");
    if (this.#sessionTtlMs > this.#maxSessionTtlMs) throw new Error("sessionTtlMs cannot exceed maxSessionTtlMs.");
    this.#maxClockSkewMs = boundedNonNegativeInteger(options.maxClockSkewMs ?? DEFAULT_MAX_CLOCK_SKEW_MS, "maxClockSkewMs", MAX_CONFIGURED_CLOCK_SKEW_MS);
    this.#maxTokenBytes = boundedPositiveInteger(options.maxTokenBytes ?? DEFAULT_MAX_TOKEN_BYTES, "maxTokenBytes", MAX_CONFIGURED_TOKEN_BYTES);
    this.#maxAttributesBytes = boundedPositiveInteger(options.maxAttributesBytes ?? DEFAULT_MAX_ATTRIBUTES_BYTES, "maxAttributesBytes", MAX_CONFIGURED_ATTRIBUTES_BYTES);
    this.#maxReplayEntries = boundedPositiveInteger(options.maxReplayEntries ?? DEFAULT_MAX_REPLAY_ENTRIES, "maxReplayEntries", MAX_CONFIGURED_REPLAY_ENTRIES);
    this.#now = options.now ?? Date.now;
    this.#nonce = options.nonce ?? (() => crypto.randomUUID());
    if (options.replayStore !== undefined && typeof options.replayStore.consume !== "function") {
      throw new TypeError("Session replay store must provide an atomic consume method.");
    }
    this.#replayStore = options.replayStore;
    this.#activeKeyId = options.activeKeyId;
    this.rotate(options.keys, options.activeKeyId);
  }

  rotate(keys: readonly SessionSigningKey[], activeKeyId: string): void {
    if (!Array.isArray(keys) || keys.length === 0 || keys.length > 32) throw new Error("Session key ring must contain 1-32 keys.");
    assertIdentifier(activeKeyId, "Active session key id", 128);
    const next = new Map<string, StoredSigningKey>();
    for (const key of keys) {
      assertIdentifier(key.id, "Session key id", 128);
      if (next.has(key.id)) throw new Error(`Duplicate session key id: ${key.id}.`);
      if (!(key.secret instanceof Uint8Array) || key.secret.byteLength < 32 || key.secret.byteLength > 128) throw new Error(`Session key ${key.id} must contain 32-128 secret bytes.`);
      if (key.notBefore !== undefined) assertTimestamp(key.notBefore, `Session key ${key.id} notBefore`);
      if (key.notAfter !== undefined) assertTimestamp(key.notAfter, `Session key ${key.id} notAfter`);
      if (key.notBefore !== undefined && key.notAfter !== undefined && key.notAfter <= key.notBefore) throw new Error(`Session key ${key.id} validity window is empty.`);
      next.set(key.id, { ...key, secret: new Uint8Array(key.secret) });
    }
    if (!next.has(activeKeyId)) throw new Error(`Active session key ${activeKeyId} is absent from the key ring.`);
    this.#keys = next;
    this.#activeKeyId = activeKeyId;
  }

  async issue(subject: string, options: IssueSessionOptions = {}): Promise<string> {
    assertIdentifier(subject, "Session subject", 256);
    const now = this.#time();
    const ttlMs = positiveInteger(options.ttlMs ?? this.#sessionTtlMs, "Session TTL");
    if (ttlMs > this.#maxSessionTtlMs) throw new Error(`Session TTL exceeds maximum ${this.#maxSessionTtlMs}ms.`);
    const key = this.#keys.get(this.#activeKeyId)!;
    if ((key.notBefore !== undefined && now < key.notBefore) || (key.notAfter !== undefined && now >= key.notAfter)) throw new Error(`Active session key ${key.id} is outside its validity window.`);
    const expiresAt = now + ttlMs;
    if (!Number.isSafeInteger(expiresAt) || (key.notAfter !== undefined && expiresAt > key.notAfter)) throw new Error(`Session expiry exceeds active key ${key.id} validity.`);
    const attributes = normalizeAttributeRecord(options.attributes ?? {}, this.#maxAttributesBytes);
    const sessionId = this.#nonce();
    assertIdentifier(sessionId, "Session nonce", 256);
    const header = canonicalJson({ alg: "HS256", kid: key.id, typ: SESSION_TOKEN_TYPE });
    const payload = canonicalJson({
      v: SESSION_TOKEN_VERSION,
      iss: this.#issuer,
      aud: this.#audience,
      sub: subject,
      jti: sessionId,
      iat: now,
      exp: expiresAt,
      attr: attributes,
    } satisfies SessionPayload);
    const signingInput = `${base64UrlEncode(utf8(header))}.${base64UrlEncode(utf8(payload))}`;
    const signature = await hmacSign(key.secret, utf8(signingInput));
    const token = `${signingInput}.${base64UrlEncode(signature)}`;
    if (utf8(token).byteLength > this.#maxTokenBytes) throw new Error(`Issued session token exceeds ${this.#maxTokenBytes} bytes.`);
    return token;
  }

  async verify(token: string): Promise<SignedSessionIdentity> {
    if (typeof token !== "string" || token.length === 0 || token.length > this.#maxTokenBytes || utf8(token).byteLength > this.#maxTokenBytes) throw new Error("Session token is missing or exceeds its byte limit.");
    const parts = token.split(".");
    if (parts.length !== 3 || parts.some((part) => !/^[A-Za-z0-9_-]+$/.test(part))) throw new Error("Session token compact encoding is invalid.");
    const header = parseRecordJson(decodeUtf8(base64UrlDecode(parts[0]!)), "Session token header");
    assertExactKeys(header, ["alg", "kid", "typ"], "Session token header");
    if (header.alg !== "HS256" || header.typ !== SESSION_TOKEN_TYPE || typeof header.kid !== "string") throw new Error("Session token header is unsupported.");
    const key = this.#keys.get(header.kid);
    if (!key) throw new Error("Session token signing key is unknown or retired.");
    const validSignature = await hmacVerify(key.secret, utf8(`${parts[0]}.${parts[1]}`), base64UrlDecode(parts[2]!));
    if (!validSignature) throw new Error("Session token signature verification failed.");
    const payload = parseSessionPayload(parseRecordJson(decodeUtf8(base64UrlDecode(parts[1]!)), "Session token payload"), this.#maxAttributesBytes);
    if (payload.iss !== this.#issuer || payload.aud !== this.#audience) throw new Error("Session token issuer or audience does not match.");
    const now = this.#time();
    if (payload.iat > now + this.#maxClockSkewMs) throw new Error("Session token was issued in the future.");
    if (payload.exp <= payload.iat || payload.exp - payload.iat > this.#maxSessionTtlMs) throw new Error("Session token lifetime is invalid.");
    if (now >= payload.exp + this.#maxClockSkewMs) throw new Error("Session token has expired.");
    if ((key.notBefore !== undefined && payload.iat < key.notBefore) || (key.notAfter !== undefined && payload.exp > key.notAfter)) throw new Error("Session token falls outside its signing key validity window.");
    await this.#consumeNonce(payload.jti, payload.exp + this.#maxClockSkewMs, now);
    return Object.freeze({
      version: 1,
      issuer: payload.iss,
      audience: payload.aud,
      subject: payload.sub,
      sessionId: payload.jti,
      issuedAt: payload.iat,
      expiresAt: payload.exp,
      attributes: Object.freeze(cloneJson(payload.attr) as Record<string, PortableJson>),
      keyId: key.id,
    });
  }

  replayCacheSize(): number {
    if (this.#replayStore) throw new Error("Replay cache size is owned by the configured external replay store.");
    this.#pruneReplay(this.#time());
    return this.#replay.size;
  }

  usesExternalReplayStore(): boolean {
    return this.#replayStore !== undefined;
  }

  async #consumeNonce(nonce: string, expiresAt: number, now: number): Promise<void> {
    if (this.#replayStore) {
      let result: SessionReplayConsumeResult;
      try {
        result = await this.#replayStore.consume(nonce, expiresAt, now);
      } catch (cause) {
        throw new Error("Session replay store is unavailable; refusing admission fail-closed.", { cause });
      }
      if (result === "accepted") return;
      if (result === "replayed") throw new Error("Session token replay detected.");
      if (result === "saturated") throw new Error("Session replay store is saturated; refusing admission fail-closed.");
      throw new Error("Session replay store returned an invalid result; refusing admission fail-closed.");
    }
    this.#pruneReplay(now);
    if (this.#replay.has(nonce)) throw new Error("Session token replay detected.");
    if (this.#replay.size >= this.#maxReplayEntries) throw new Error("Session replay cache is saturated; refusing admission fail-closed.");
    this.#replay.set(nonce, expiresAt);
  }

  #pruneReplay(now: number): void {
    for (const [nonce, expiresAt] of this.#replay) if (now >= expiresAt) this.#replay.delete(nonce);
  }

  #time(): number {
    const value = this.#now();
    assertTimestamp(value, "Session clock");
    return value;
  }
}

export type PortablePersistenceSnapshot = {
  version: 1;
  players: Array<{ id: string; record: PortableJson }>;
  rooms: Array<{ id: string; snapshot: PortableJson }>;
  events: PortableJson[];
};

export interface PortablePersistenceAdapter extends PersistenceAdapter {
  exportPortableSnapshot(): Promise<PortablePersistenceSnapshot>;
  replacePortableSnapshotAtomic(snapshot: PortablePersistenceSnapshot): Promise<void>;
}

export type PortablePersistenceLimits = {
  maxPlayers?: number;
  maxRooms?: number;
  maxEvents?: number;
  maxRecordBytes?: number;
  maxBackupBytes?: number;
  maxJsonDepth?: number;
  maxJsonNodes?: number;
};

type ResolvedPersistenceLimits = Required<PortablePersistenceLimits>;

export function createPortableMemoryPersistenceAdapter(limits: PortablePersistenceLimits = {}): PortablePersistenceAdapter {
  const resolved = resolvePersistenceLimits(limits);
  let players = new Map<string, PortableJson>();
  let rooms = new Map<string, PortableJson>();
  let events: PortableJson[] = [];
  return {
    async loadPlayer(playerId) {
      assertRecordId(playerId, "Player id");
      const value = players.get(playerId);
      return value === undefined ? null : cloneJson(value);
    },
    async savePlayer(playerId, record) {
      assertRecordId(playerId, "Player id");
      if (!players.has(playerId) && players.size >= resolved.maxPlayers) throw new Error(`Portable persistence exceeds player limit ${resolved.maxPlayers}.`);
      players.set(playerId, normalizeRecord(record, resolved));
    },
    async loadRoom(roomId) {
      assertRecordId(roomId, "Room id");
      const value = rooms.get(roomId);
      return value === undefined ? null : cloneJson(value);
    },
    async saveRoom(roomId, snapshot) {
      assertRecordId(roomId, "Room id");
      if (!rooms.has(roomId) && rooms.size >= resolved.maxRooms) throw new Error(`Portable persistence exceeds room limit ${resolved.maxRooms}.`);
      rooms.set(roomId, normalizeRecord(snapshot, resolved));
    },
    async appendEvent(event) {
      if (events.length >= resolved.maxEvents) throw new Error(`Portable persistence exceeds event limit ${resolved.maxEvents}.`);
      events.push(normalizeRecord(event, resolved));
    },
    async exportPortableSnapshot() {
      return normalizePortableSnapshot({
        version: 1,
        players: [...players].sort(([a], [b]) => compareText(a, b)).map(([id, record]) => ({ id, record })),
        rooms: [...rooms].sort(([a], [b]) => compareText(a, b)).map(([id, snapshot]) => ({ id, snapshot })),
        events,
      }, resolved);
    },
    async replacePortableSnapshotAtomic(snapshot) {
      const next = normalizePortableSnapshot(snapshot, resolved);
      const nextPlayers = new Map(next.players.map((entry) => [entry.id, cloneJson(entry.record)]));
      const nextRooms = new Map(next.rooms.map((entry) => [entry.id, cloneJson(entry.snapshot)]));
      const nextEvents = next.events.map(cloneJson);
      // All validation and allocation happened above; these synchronous pointer
      // swaps are the adapter's atomic commit boundary.
      players = nextPlayers;
      rooms = nextRooms;
      events = nextEvents;
    },
  };
}

export type PortablePersistenceBackupOptions = PortablePersistenceLimits & { createdAt?: number };

export type BackupEncryptionKey = {
  id: string;
  /** Exactly 32 bytes of key material for AES-256-GCM. */
  secret: Uint8Array;
};

export type EncryptedBackupOptions = {
  /** Bounds plaintext before encryption and ciphertext before allocation. */
  maxBytes?: number;
  /** Test/HSM integration seam. Must return a fresh 12-byte nonce per key. */
  nonce?: () => Uint8Array;
};

type EncryptedBackupEnvelope = {
  format: typeof ENCRYPTED_BACKUP_FORMAT;
  version: 1;
  algorithm: "A256GCM";
  keyId: string;
  nonce: string;
  ciphertext: string;
};

type PortablePersistenceBackupEnvelope = {
  format: typeof BACKUP_FORMAT;
  version: 1;
  createdAt: number;
  checksum: string;
  snapshot: PortablePersistenceSnapshot;
};

export async function createPortablePersistenceBackup(
  adapter: PortablePersistenceAdapter,
  options: PortablePersistenceBackupOptions = {},
): Promise<Uint8Array> {
  assertPortableAdapter(adapter);
  const limits = resolvePersistenceLimits(options);
  const createdAt = options.createdAt ?? Date.now();
  assertTimestamp(createdAt, "Backup creation timestamp");
  const snapshot = normalizePortableSnapshot(await adapter.exportPortableSnapshot(), limits);
  const material = { format: BACKUP_FORMAT, version: BACKUP_VERSION, createdAt, snapshot } as const;
  const envelope: PortablePersistenceBackupEnvelope = {
    ...material,
    checksum: await sha256(utf8(canonicalJson(material, limits.maxJsonDepth, limits.maxJsonNodes))),
  };
  const bytes = utf8(canonicalJson(envelope, limits.maxJsonDepth, limits.maxJsonNodes));
  if (bytes.byteLength > limits.maxBackupBytes) throw new Error(`Portable persistence backup exceeds byte limit ${limits.maxBackupBytes}.`);
  return bytes;
}

export async function restorePortablePersistenceBackup(
  adapter: PortablePersistenceAdapter,
  source: Uint8Array | string,
  limits: PortablePersistenceLimits = {},
): Promise<PortablePersistenceSnapshot> {
  assertPortableAdapter(adapter);
  const resolved = resolvePersistenceLimits(limits);
  if (typeof source === "string" && source.length > resolved.maxBackupBytes) throw new Error(`Portable persistence backup exceeds byte limit ${resolved.maxBackupBytes}.`);
  const bytes = typeof source === "string" ? utf8(source) : copyBytes(source);
  if (bytes.byteLength > resolved.maxBackupBytes) throw new Error(`Portable persistence backup exceeds byte limit ${resolved.maxBackupBytes}.`);
  const envelope = parseBackupEnvelope(parseRecordJson(decodeUtf8(bytes), "Portable persistence backup"), resolved);
  const expected = await sha256(utf8(canonicalJson({
    format: envelope.format,
    version: envelope.version,
    createdAt: envelope.createdAt,
    snapshot: envelope.snapshot,
  }, resolved.maxJsonDepth, resolved.maxJsonNodes)));
  if (!constantTimeTextEqual(envelope.checksum, expected)) throw new Error("Portable persistence backup checksum verification failed.");
  await adapter.replacePortableSnapshotAtomic(envelope.snapshot);
  return normalizePortableSnapshot(envelope.snapshot, resolved);
}

/** Encrypts an already checksummed backup for storage with authenticated AES-256-GCM. */
export async function encryptPortableBackup(
  source: Uint8Array | string,
  key: BackupEncryptionKey,
  options: EncryptedBackupOptions = {},
): Promise<Uint8Array> {
  const maxBytes = boundedPositiveInteger(options.maxBytes ?? DEFAULT_MAX_BACKUP_BYTES, "Encrypted backup maxBytes", MAX_CONFIGURED_BACKUP_BYTES);
  const plaintext = typeof source === "string" ? utf8(source) : copyBytes(source);
  if (plaintext.byteLength > maxBytes) throw new Error(`Encrypted backup plaintext exceeds byte limit ${maxBytes}.`);
  const secret = validateBackupEncryptionKey(key);
  const nonce = options.nonce?.() ?? crypto.getRandomValues(new Uint8Array(12));
  if (!(nonce instanceof Uint8Array) || nonce.byteLength !== 12) throw new Error("Encrypted backup nonce must contain exactly 12 bytes.");
  const header = encryptedBackupHeader(key.id);
  const cryptoKey = await crypto.subtle.importKey("raw", secret, { name: "AES-GCM" }, false, ["encrypt"]);
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: ownedArrayBuffer(nonce), additionalData: ownedArrayBuffer(utf8(canonicalJson(header))), tagLength: 128 },
    cryptoKey,
    ownedArrayBuffer(plaintext),
  ));
  const envelope: EncryptedBackupEnvelope = {
    ...header,
    nonce: base64UrlEncode(nonce),
    ciphertext: base64UrlEncode(ciphertext),
  };
  const encoded = utf8(canonicalJson(envelope));
  if (encoded.byteLength > maxBytes + 4_096) throw new Error("Encrypted backup envelope exceeds its bounded overhead.");
  return encoded;
}

/** Authenticates and decrypts an encrypted backup without restoring it. */
export async function decryptPortableBackup(
  source: Uint8Array | string,
  keys: readonly BackupEncryptionKey[],
  options: Pick<EncryptedBackupOptions, "maxBytes"> = {},
): Promise<Uint8Array> {
  const maxBytes = boundedPositiveInteger(options.maxBytes ?? DEFAULT_MAX_BACKUP_BYTES, "Encrypted backup maxBytes", MAX_CONFIGURED_BACKUP_BYTES);
  const encoded = typeof source === "string" ? utf8(source) : copyBytes(source);
  if (encoded.byteLength > maxBytes + 4_096) throw new Error("Encrypted backup envelope exceeds its byte limit.");
  const envelope = parseEncryptedBackupEnvelope(parseRecordJson(decodeUtf8(encoded), "Encrypted backup"));
  if (!Array.isArray(keys) || keys.length === 0 || keys.length > 32) throw new Error("Encrypted backup key ring must contain 1-32 keys.");
  const matching = keys.find((candidate) => candidate.id === envelope.keyId);
  if (!matching) throw new Error(`Encrypted backup key ${envelope.keyId} is unavailable.`);
  const secret = validateBackupEncryptionKey(matching);
  let nonce: Uint8Array;
  let ciphertext: Uint8Array;
  try {
    nonce = base64UrlDecode(envelope.nonce);
    ciphertext = base64UrlDecode(envelope.ciphertext);
  } catch (cause) {
    throw new Error("Encrypted backup byte encoding is invalid.", { cause });
  }
  if (nonce.byteLength !== 12) throw new Error("Encrypted backup nonce must contain exactly 12 bytes.");
  if (ciphertext.byteLength < 16 || ciphertext.byteLength > maxBytes + 16) throw new Error("Encrypted backup ciphertext exceeds its byte limit.");
  const cryptoKey = await crypto.subtle.importKey("raw", secret, { name: "AES-GCM" }, false, ["decrypt"]);
  let plaintext: ArrayBuffer;
  try {
    plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: ownedArrayBuffer(nonce), additionalData: ownedArrayBuffer(utf8(canonicalJson(encryptedBackupHeader(envelope.keyId)))), tagLength: 128 },
      cryptoKey,
      ownedArrayBuffer(ciphertext),
    );
  } catch (cause) {
    throw new Error("Encrypted backup authentication failed.", { cause });
  }
  if (plaintext.byteLength > maxBytes) throw new Error(`Decrypted backup exceeds byte limit ${maxBytes}.`);
  return new Uint8Array(plaintext);
}

export async function createEncryptedPortablePersistenceBackup(
  adapter: PortablePersistenceAdapter,
  key: BackupEncryptionKey,
  backupOptions: PortablePersistenceBackupOptions = {},
  encryptionOptions: EncryptedBackupOptions = {},
): Promise<Uint8Array> {
  return encryptPortableBackup(await createPortablePersistenceBackup(adapter, backupOptions), key, encryptionOptions);
}

export async function restoreEncryptedPortablePersistenceBackup(
  adapter: PortablePersistenceAdapter,
  source: Uint8Array | string,
  keys: readonly BackupEncryptionKey[],
  limits: PortablePersistenceLimits = {},
): Promise<PortablePersistenceSnapshot> {
  const plaintext = await decryptPortableBackup(source, keys, { maxBytes: limits.maxBackupBytes });
  return restorePortablePersistenceBackup(adapter, plaintext, limits);
}

export type GracefulDrainState = "accepting" | "draining" | "stopped";

export type GracefulShutdownEvidence = {
  startedAt: number;
  completedAt: number;
  durationMs: number;
  timedOut: boolean;
  pendingAtTimeout: number;
  completedWork: number;
};

export type GracefulDrainController = {
  readonly state: GracefulDrainState;
  readonly inFlight: number;
  readonly completedWork: number;
  begin(kind?: string): () => void;
  run<T>(kind: string, operation: () => Promise<T>): Promise<T>;
  shutdown(stop: () => void | Promise<void>, options?: { drainTimeoutMs?: number; stopTimeoutMs?: number }): Promise<GracefulShutdownEvidence>;
};

export function createGracefulDrainController(options: { maxInFlight?: number; now?: () => number; metrics?: ServerMetrics } = {}): GracefulDrainController {
  const maxInFlight = boundedPositiveInteger(options.maxInFlight ?? DEFAULT_MAX_IN_FLIGHT, "maxInFlight", MAX_CONFIGURED_IN_FLIGHT);
  const now = options.now ?? Date.now;
  const metrics = options.metrics;
  let state: GracefulDrainState = "accepting";
  let inFlight = 0;
  let completedWork = 0;
  let shutdownPromise: Promise<GracefulShutdownEvidence> | undefined;
  const idleWaiters = new Set<() => void>();
  const controller: GracefulDrainController = {
    get state() { return state; },
    get inFlight() { return inFlight; },
    get completedWork() { return completedWork; },
    begin(kind = "request") {
      assertMetricSegment(kind, "Work kind");
      if (state !== "accepting") throw new Error("Server is draining and no longer accepts new work.");
      if (inFlight >= maxInFlight) throw new Error(`Server in-flight work limit ${maxInFlight} reached.`);
      inFlight += 1;
      metrics?.gauge("operations.in_flight", inFlight);
      metrics?.increment("operations.work_started", 1, { kind });
      let released = false;
      return () => {
        if (released) return;
        released = true;
        inFlight -= 1;
        completedWork += 1;
        metrics?.gauge("operations.in_flight", inFlight);
        metrics?.increment("operations.work_completed", 1, { kind });
        if (inFlight === 0) {
          for (const resolve of idleWaiters) resolve();
          idleWaiters.clear();
        }
      };
    },
    async run<T>(kind: string, operation: () => Promise<T>): Promise<T> {
      if (typeof operation !== "function") throw new TypeError("Tracked operation must be a function.");
      const release = controller.begin(kind);
      try { return await operation(); }
      finally { release(); }
    },
    shutdown(stop, shutdownOptions = {}) {
      if (shutdownPromise) return shutdownPromise;
      if (typeof stop !== "function") return Promise.reject(new TypeError("Graceful shutdown requires a stop callback."));
      const drainTimeoutMs = boundedTimeout(shutdownOptions.drainTimeoutMs ?? 30_000, "drainTimeoutMs");
      const stopTimeoutMs = boundedTimeout(shutdownOptions.stopTimeoutMs ?? 30_000, "stopTimeoutMs");
      state = "draining";
      metrics?.gauge("operations.accepting", 0);
      metrics?.increment("operations.drain_started");
      shutdownPromise = (async () => {
        const startedAt = readClock(now, "Drain clock");
        const drained = inFlight === 0 ? true : await waitForIdle(idleWaiters, drainTimeoutMs);
        const pendingAtTimeout = drained ? 0 : inFlight;
        let stopError: unknown;
        try { await withTimeout(Promise.resolve().then(stop), stopTimeoutMs, "server stop"); }
        catch (cause) { stopError = cause; }
        state = "stopped";
        const completedAt = readClock(now, "Drain clock");
        const evidence = {
          startedAt,
          completedAt,
          durationMs: Math.max(0, completedAt - startedAt),
          timedOut: !drained || Boolean(stopError),
          pendingAtTimeout,
          completedWork,
        };
        metrics?.increment("operations.drain_completed", 1, { timedOut: String(evidence.timedOut) });
        if (stopError) throw new AggregateError([stopError], "Graceful shutdown stop callback failed or timed out.");
        return evidence;
      })();
      return shutdownPromise;
    },
  };
  return controller;
}

export type ServerOperationsHealth = {
  status: "ok" | "draining" | "stopped";
  live: boolean;
  ready: boolean;
  state: GracefulDrainState;
  startedAt: number;
  observedAt: number;
  uptimeMs: number;
  inFlight: number;
  completedWork: number;
  rooms: number;
  players: number;
  persistence: boolean;
  metrics: ReturnType<ServerMetrics["snapshot"]>;
  metricsDiagnostics: ReturnType<ServerMetrics["diagnostics"]>;
};

export type ServerOperations = {
  sessions: SignedSessionAuthority;
  auth: AuthAdapter;
  metrics: ServerMetrics;
  drain: GracefulDrainController;
  health(counts?: { rooms?: number; players?: number }): ServerOperationsHealth;
  backup(options?: PortablePersistenceBackupOptions): Promise<Uint8Array>;
  restore(source: Uint8Array | string, limits?: PortablePersistenceLimits): Promise<PortablePersistenceSnapshot>;
};

export type ServerOperationsOptions = {
  sessions: SignedSessionAuthorityOptions;
  persistence?: PortablePersistenceAdapter;
  maxMetricSeries?: number;
  maxInFlight?: number;
  now?: () => number;
};

export function createServerOperations(options: ServerOperationsOptions): ServerOperations {
  const now = options.now ?? options.sessions.now ?? Date.now;
  const metrics = createServerMetrics({
    maxSeries: boundedPositiveInteger(options.maxMetricSeries ?? 512, "maxMetricSeries", MAX_CONFIGURED_METRIC_SERIES),
    maxTags: 4,
    maxTagLength: 64,
  });
  const sessions = new SignedSessionAuthority({ ...options.sessions, now });
  const drain = createGracefulDrainController({ maxInFlight: options.maxInFlight, now, metrics });
  const startedAt = readClock(now, "Operations clock");
  const auth: AuthAdapter = {
    async verify(token: string): Promise<AuthResult> {
      let release: (() => void) | undefined;
      try {
        release = drain.begin("auth");
        const identity = await sessions.verify(token);
        metrics.increment("operations.auth_accepted");
        return { ok: true, userId: identity.subject, sessionId: identity.sessionId, claims: cloneJson(identity.attributes) as Record<string, unknown> };
      } catch (cause) {
        const category = classifyAuthFailure(cause);
        metrics.increment("operations.auth_rejected", 1, { reason: category });
        return { ok: false, reason: category === "draining" ? "server draining" : "session rejected" };
      } finally {
        release?.();
      }
    },
  };
  return {
    sessions,
    auth,
    metrics,
    drain,
    health(counts = {}) {
      const observedAt = readClock(now, "Operations clock");
      const rooms = boundedCount(counts.rooms ?? 0, "Health room count");
      const players = boundedCount(counts.players ?? 0, "Health player count");
      return {
        status: drain.state === "accepting" ? "ok" : drain.state === "draining" ? "draining" : "stopped",
        live: drain.state !== "stopped",
        ready: drain.state === "accepting",
        state: drain.state,
        startedAt,
        observedAt,
        uptimeMs: Math.max(0, observedAt - startedAt),
        inFlight: drain.inFlight,
        completedWork: drain.completedWork,
        rooms,
        players,
        persistence: Boolean(options.persistence),
        metrics: metrics.snapshot(),
        metricsDiagnostics: metrics.diagnostics(),
      };
    },
    backup(backupOptions) {
      if (!options.persistence) return Promise.reject(new Error("Portable persistence is not configured."));
      return drain.run("backup", async () => {
        metrics.increment("operations.backup_started");
        const bytes = await createPortablePersistenceBackup(options.persistence!, backupOptions);
        metrics.increment("operations.backup_completed");
        metrics.observe("operations.backup_bytes", bytes.byteLength);
        return bytes;
      });
    },
    async restore(source, limits) {
      if (!options.persistence) throw new Error("Portable persistence is not configured.");
      if (drain.state === "accepting") throw new Error("Persistence restore requires a draining or stopped server.");
      const snapshot = await restorePortablePersistenceBackup(options.persistence, source, limits);
      metrics.increment("operations.restore_completed");
      return snapshot;
    },
  };
}

function parseSessionPayload(value: Record<string, unknown>, maxAttributesBytes: number): SessionPayload {
  assertExactKeys(value, ["attr", "aud", "exp", "iat", "iss", "jti", "sub", "v"], "Session token payload");
  if (value.v !== SESSION_TOKEN_VERSION) throw new Error("Session token version is unsupported.");
  assertIdentifier(value.iss, "Session issuer", 256);
  assertIdentifier(value.aud, "Session audience", 256);
  assertIdentifier(value.sub, "Session subject", 256);
  assertIdentifier(value.jti, "Session nonce", 256);
  assertTimestamp(value.iat, "Session issued-at timestamp");
  assertTimestamp(value.exp, "Session expiry timestamp");
  if (!isPlainRecord(value.attr)) throw new Error("Session attributes must be an object.");
  return { v: 1, iss: value.iss, aud: value.aud, sub: value.sub, jti: value.jti, iat: value.iat, exp: value.exp, attr: normalizeAttributeRecord(value.attr, maxAttributesBytes) };
}

function normalizeAttributeRecord(value: Readonly<Record<string, unknown>>, maxBytes: number): Record<string, PortableJson> {
  const normalized = normalizeJson(value, 8, 1_024);
  if (!isPlainRecord(normalized)) throw new Error("Session attributes must be a plain JSON object.");
  if (utf8(canonicalJson(normalized, 8, 1_024)).byteLength > maxBytes) throw new Error(`Session attributes exceed ${maxBytes} bytes.`);
  return normalized as Record<string, PortableJson>;
}

function normalizePortableSnapshot(value: unknown, limits: ResolvedPersistenceLimits): PortablePersistenceSnapshot {
  if (!isPlainRecord(value)) throw new Error("Portable persistence snapshot must be an object.");
  assertExactKeys(value, ["events", "players", "rooms", "version"], "Portable persistence snapshot");
  if (value.version !== SNAPSHOT_VERSION || !Array.isArray(value.players) || !Array.isArray(value.rooms) || !Array.isArray(value.events)) throw new Error("Portable persistence snapshot shape or version is invalid.");
  if (value.players.length > limits.maxPlayers || value.rooms.length > limits.maxRooms || value.events.length > limits.maxEvents) throw new Error("Portable persistence snapshot exceeds record limits.");
  const playerIds = new Set<string>();
  const roomIds = new Set<string>();
  const players = value.players.map((entry, index) => normalizeSnapshotEntry(entry, "record", `Player ${index}`, playerIds, limits));
  const rooms = value.rooms.map((entry, index) => normalizeSnapshotEntry(entry, "snapshot", `Room ${index}`, roomIds, limits));
  const events = value.events.map((event) => normalizeRecord(event, limits));
  players.sort((a, b) => compareText(a.id, b.id));
  rooms.sort((a, b) => compareText(a.id, b.id));
  const snapshot = { version: 1 as const, players, rooms, events };
  if (utf8(canonicalJson(snapshot, limits.maxJsonDepth, limits.maxJsonNodes)).byteLength > limits.maxBackupBytes) throw new Error(`Portable persistence snapshot exceeds byte limit ${limits.maxBackupBytes}.`);
  return snapshot;
}

function normalizeSnapshotEntry(value: unknown, dataKey: "record", label: string, ids: Set<string>, limits: ResolvedPersistenceLimits): { id: string; record: PortableJson };
function normalizeSnapshotEntry(value: unknown, dataKey: "snapshot", label: string, ids: Set<string>, limits: ResolvedPersistenceLimits): { id: string; snapshot: PortableJson };
function normalizeSnapshotEntry(
  value: unknown,
  dataKey: "record" | "snapshot",
  label: string,
  ids: Set<string>,
  limits: ResolvedPersistenceLimits,
): { id: string; record: PortableJson } | { id: string; snapshot: PortableJson } {
  if (!isPlainRecord(value)) throw new Error(`${label} entry must be an object.`);
  assertExactKeys(value, ["id", dataKey], `${label} entry`);
  assertRecordId(value.id, `${label} id`);
  if (ids.has(value.id)) throw new Error(`Duplicate portable persistence id: ${value.id}.`);
  ids.add(value.id);
  const data = normalizeRecord(value[dataKey], limits);
  return dataKey === "record" ? { id: value.id, record: data } : { id: value.id, snapshot: data };
}

function parseBackupEnvelope(value: Record<string, unknown>, limits: ResolvedPersistenceLimits): PortablePersistenceBackupEnvelope {
  assertExactKeys(value, ["checksum", "createdAt", "format", "snapshot", "version"], "Portable persistence backup");
  if (value.format !== BACKUP_FORMAT || value.version !== BACKUP_VERSION) throw new Error("Portable persistence backup format or version is unsupported.");
  assertTimestamp(value.createdAt, "Backup creation timestamp");
  if (typeof value.checksum !== "string" || !/^[0-9a-f]{64}$/.test(value.checksum)) throw new Error("Portable persistence backup checksum is invalid.");
  return { format: BACKUP_FORMAT, version: 1, createdAt: value.createdAt, checksum: value.checksum, snapshot: normalizePortableSnapshot(value.snapshot, limits) };
}

function encryptedBackupHeader(keyId: string): Pick<EncryptedBackupEnvelope, "format" | "version" | "algorithm" | "keyId"> {
  assertIdentifier(keyId, "Backup encryption key id", 128);
  return {
    format: ENCRYPTED_BACKUP_FORMAT,
    version: ENCRYPTED_BACKUP_VERSION,
    algorithm: "A256GCM" as const,
    keyId,
  };
}

function validateBackupEncryptionKey(key: BackupEncryptionKey): ArrayBuffer {
  if (!key || typeof key !== "object") throw new TypeError("Backup encryption key is required.");
  assertIdentifier(key.id, "Backup encryption key id", 128);
  if (!(key.secret instanceof Uint8Array) || key.secret.byteLength !== 32) {
    throw new Error(`Backup encryption key ${key.id} must contain exactly 32 secret bytes.`);
  }
  return ownedArrayBuffer(key.secret);
}

function parseEncryptedBackupEnvelope(value: Record<string, unknown>): EncryptedBackupEnvelope {
  assertExactKeys(value, ["algorithm", "ciphertext", "format", "keyId", "nonce", "version"], "Encrypted backup");
  if (value.format !== ENCRYPTED_BACKUP_FORMAT || value.version !== ENCRYPTED_BACKUP_VERSION || value.algorithm !== "A256GCM") {
    throw new Error("Encrypted backup format, version, or algorithm is unsupported.");
  }
  assertIdentifier(value.keyId, "Backup encryption key id", 128);
  if (typeof value.nonce !== "string" || typeof value.ciphertext !== "string") throw new Error("Encrypted backup byte fields must be strings.");
  return {
    format: ENCRYPTED_BACKUP_FORMAT,
    version: 1,
    algorithm: "A256GCM",
    keyId: value.keyId,
    nonce: value.nonce,
    ciphertext: value.ciphertext,
  };
}

function normalizeRecord(value: unknown, limits: ResolvedPersistenceLimits): PortableJson {
  const normalized = normalizeJson(value, limits.maxJsonDepth, limits.maxJsonNodes);
  if (utf8(canonicalJson(normalized, limits.maxJsonDepth, limits.maxJsonNodes)).byteLength > limits.maxRecordBytes) throw new Error(`Portable persistence record exceeds byte limit ${limits.maxRecordBytes}.`);
  return normalized;
}

function resolvePersistenceLimits(limits: PortablePersistenceLimits): ResolvedPersistenceLimits {
  return {
    maxPlayers: boundedPositiveInteger(limits.maxPlayers ?? DEFAULT_MAX_RECORDS, "maxPlayers", MAX_CONFIGURED_RECORDS),
    maxRooms: boundedPositiveInteger(limits.maxRooms ?? DEFAULT_MAX_RECORDS, "maxRooms", MAX_CONFIGURED_RECORDS),
    maxEvents: boundedPositiveInteger(limits.maxEvents ?? DEFAULT_MAX_EVENTS, "maxEvents", MAX_CONFIGURED_RECORDS),
    maxRecordBytes: boundedPositiveInteger(limits.maxRecordBytes ?? DEFAULT_MAX_RECORD_BYTES, "maxRecordBytes", MAX_CONFIGURED_RECORD_BYTES),
    maxBackupBytes: boundedPositiveInteger(limits.maxBackupBytes ?? DEFAULT_MAX_BACKUP_BYTES, "maxBackupBytes", MAX_CONFIGURED_BACKUP_BYTES),
    maxJsonDepth: boundedPositiveInteger(limits.maxJsonDepth ?? DEFAULT_MAX_JSON_DEPTH, "maxJsonDepth", MAX_CONFIGURED_JSON_DEPTH),
    maxJsonNodes: boundedPositiveInteger(limits.maxJsonNodes ?? DEFAULT_MAX_JSON_NODES, "maxJsonNodes", MAX_CONFIGURED_JSON_NODES),
  };
}

function assertPortableAdapter(value: PortablePersistenceAdapter): void {
  if (!value || typeof value.exportPortableSnapshot !== "function" || typeof value.replacePortableSnapshotAtomic !== "function") throw new TypeError("Portable persistence adapter is missing snapshot/atomic replacement methods.");
}

function normalizeJson(value: unknown, maxDepth: number, maxNodes: number): PortableJson {
  const state = { nodes: 0, ancestors: new Set<object>() };
  const visit = (candidate: unknown, depth: number): PortableJson => {
    state.nodes += 1;
    if (state.nodes > maxNodes) throw new Error(`JSON exceeds node limit ${maxNodes}.`);
    if (depth > maxDepth) throw new Error(`JSON exceeds depth limit ${maxDepth}.`);
    if (candidate === null || typeof candidate === "boolean" || typeof candidate === "string") return candidate;
    if (typeof candidate === "number") {
      if (!Number.isFinite(candidate)) throw new Error("JSON numbers must be finite.");
      return Object.is(candidate, -0) ? 0 : candidate;
    }
    if (!candidate || typeof candidate !== "object") throw new Error(`JSON cannot contain ${typeof candidate}.`);
    if (state.ancestors.has(candidate)) throw new Error("JSON cannot contain cycles.");
    state.ancestors.add(candidate);
    try {
      if (Array.isArray(candidate)) {
        const output: PortableJson[] = [];
        for (let index = 0; index < candidate.length; index += 1) {
          const descriptor = Object.getOwnPropertyDescriptor(candidate, String(index));
          if (!descriptor || !("value" in descriptor)) throw new Error("JSON arrays must be dense data arrays.");
          output.push(visit(descriptor.value, depth + 1));
        }
        return output;
      }
      if (!isPlainRecord(candidate)) throw new Error("JSON may contain only plain objects and arrays.");
      const output: Record<string, PortableJson> = Object.create(null) as Record<string, PortableJson>;
      for (const key of Object.keys(candidate).sort(compareText)) {
        const descriptor = Object.getOwnPropertyDescriptor(candidate, key);
        if (!descriptor || !("value" in descriptor)) throw new Error(`JSON property ${key} must not be an accessor.`);
        output[key] = visit(descriptor.value, depth + 1);
      }
      return output;
    } finally {
      state.ancestors.delete(candidate);
    }
  };
  return visit(value, 0);
}

function canonicalJson(value: unknown, maxDepth = 64, maxNodes = 1_000_000): string {
  return `${JSON.stringify(normalizeJson(value, maxDepth, maxNodes))}\n`;
}

function cloneJson<T extends PortableJson>(value: T): T {
  return normalizeJson(value, DEFAULT_MAX_JSON_DEPTH, DEFAULT_MAX_JSON_NODES) as T;
}

function parseRecordJson(text: string, label: string): Record<string, unknown> {
  let value: unknown;
  try { value = JSON.parse(text) as unknown; }
  catch { throw new Error(`${label} is not valid JSON.`); }
  if (!isPlainRecord(value)) throw new Error(`${label} must contain a JSON object.`);
  return value;
}

async function hmacSign(secret: Uint8Array, message: Uint8Array): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", new Uint8Array(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, new Uint8Array(message)));
}

async function hmacVerify(secret: Uint8Array, message: Uint8Array, signature: Uint8Array): Promise<boolean> {
  if (signature.byteLength !== 32) return false;
  const key = await crypto.subtle.importKey("raw", new Uint8Array(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  return crypto.subtle.verify("HMAC", key, new Uint8Array(signature), new Uint8Array(message));
}

async function sha256(value: Uint8Array): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(value)));
  return [...digest].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function base64UrlEncode(bytes: Uint8Array): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  let output = "";
  for (let index = 0; index < bytes.length; index += 3) {
    const a = bytes[index] ?? 0;
    const b = bytes[index + 1] ?? 0;
    const c = bytes[index + 2] ?? 0;
    const remaining = bytes.length - index;
    output += alphabet[a >>> 2];
    output += alphabet[((a & 3) << 4) | (b >>> 4)];
    if (remaining > 1) output += alphabet[((b & 15) << 2) | (c >>> 6)];
    if (remaining > 2) output += alphabet[c & 63];
  }
  return output;
}

function base64UrlDecode(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/.test(value) || value.length % 4 === 1) throw new Error("Session token base64url segment is invalid.");
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  const indexes = new Int16Array(128).fill(-1);
  for (let index = 0; index < alphabet.length; index += 1) indexes[alphabet.charCodeAt(index)] = index;
  const output: number[] = [];
  for (let offset = 0; offset < value.length; offset += 4) {
    const remaining = value.length - offset;
    const a = indexes[value.charCodeAt(offset)]!;
    const b = indexes[value.charCodeAt(offset + 1)]!;
    const c = remaining > 2 ? indexes[value.charCodeAt(offset + 2)]! : 0;
    const d = remaining > 3 ? indexes[value.charCodeAt(offset + 3)]! : 0;
    if (a < 0 || b < 0 || c < 0 || d < 0) throw new Error("Session token base64url segment is invalid.");
    output.push((a << 2) | (b >>> 4));
    if (remaining > 2) output.push(((b & 15) << 4) | (c >>> 2));
    if (remaining > 3) output.push(((c & 3) << 6) | d);
  }
  const bytes = Uint8Array.from(output);
  if (base64UrlEncode(bytes) !== value) throw new Error("Session token base64url segment is not canonical.");
  return bytes;
}

function waitForIdle(waiters: Set<() => void>, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      waiters.delete(onIdle);
      resolve(value);
    };
    const onIdle = () => finish(true);
    const timer = setTimeout(() => finish(false), timeoutMs);
    waiters.add(onIdle);
  });
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new Error(`${label} exceeded ${timeoutMs}ms timeout.`)), timeoutMs); }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function classifyAuthFailure(value: unknown): string {
  const message = value instanceof Error ? value.message : String(value);
  if (/replay/i.test(message)) return "replay";
  if (/expired|lifetime|future|validity/i.test(message)) return "time";
  if (/signature|signing key/i.test(message)) return "signature";
  if (/draining/i.test(message)) return "draining";
  return "invalid";
}

function boundedTimeout(value: number, label: string): number {
  const result = positiveInteger(value, label);
  if (result > 5 * 60_000) throw new Error(`${label} may not exceed 300000ms.`);
  return result;
}

function boundedCount(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 0 || value > 100_000_000) throw new Error(`${label} must be a non-negative bounded integer.`);
  return value;
}

function assertIdentifier(value: unknown, label: string, maxBytes: number): asserts value is string {
  if (typeof value !== "string" || !value || utf8(value).byteLength > maxBytes || /[\u0000-\u001f\u007f]/.test(value)) throw new Error(`${label} must be non-empty bounded text without control characters.`);
}

function assertRecordId(value: unknown, label: string): asserts value is string {
  assertIdentifier(value, label, 256);
}

function assertMetricSegment(value: string, label: string): void {
  if (typeof value !== "string" || !/^[a-z][a-z0-9_.-]{0,63}$/.test(value)) throw new Error(`${label} must match [a-z][a-z0-9_.-]{0,63}.`);
}

function assertTimestamp(value: unknown, label: string): asserts value is number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) throw new Error(`${label} must be a non-negative safe integer timestamp.`);
}

function readClock(clock: () => number, label: string): number {
  const value = clock();
  assertTimestamp(value, label);
  return value;
}

function positiveInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${label} must be a positive safe integer.`);
  return value;
}

function nonNegativeInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${label} must be a non-negative safe integer.`);
  return value;
}

function boundedPositiveInteger(value: number, label: string, maximum: number): number {
  const result = positiveInteger(value, label);
  if (result > maximum) throw new Error(`${label} may not exceed ${maximum}.`);
  return result;
}

function boundedNonNegativeInteger(value: number, label: string, maximum: number): number {
  const result = nonNegativeInteger(value, label);
  if (result > maximum) throw new Error(`${label} may not exceed ${maximum}.`);
  return result;
}

function assertExactKeys(value: Record<string, unknown>, keys: readonly string[], label: string): void {
  const actual = Object.keys(value).sort(compareText);
  const expected = [...keys].sort(compareText);
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) throw new Error(`${label} has unknown or missing fields.`);
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function utf8(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function decodeUtf8(value: Uint8Array): string {
  try { return new TextDecoder("utf-8", { fatal: true }).decode(value); }
  catch { throw new Error("Encoded data is not valid UTF-8."); }
}

function copyBytes(value: Uint8Array): Uint8Array {
  if (!(value instanceof Uint8Array)) throw new TypeError("Backup source must be a UTF-8 string or Uint8Array.");
  return new Uint8Array(value);
}

function ownedArrayBuffer(value: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(value.byteLength);
  copy.set(value);
  return copy.buffer;
}

function constantTimeTextEqual(a: string, b: string): boolean {
  let difference = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) difference |= (a.charCodeAt(index) || 0) ^ (b.charCodeAt(index) || 0);
  return difference === 0;
}

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

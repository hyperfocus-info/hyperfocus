export const SAVE_PROFILE_FORMAT = "hyperfocus-save-profile" as const;
export const SAVE_ENVELOPE_FORMAT = "hyperfocus-save-envelope" as const;
export const SAVE_PROFILE_FORMAT_VERSION = 1;
export const SAVE_ENVELOPE_VERSION = 1;

export {
  decodeBinaryJournalEntry,
  encodeBinaryJournalEntry,
  type BinaryJournalEntry,
  type BinaryJournalLimits,
  type EncodeBinaryJournalOptions
} from "./binary-journal.ts";

const DEFAULT_MAX_BYTES = 4 * 1024 * 1024;
const DEFAULT_MAX_DEPTH = 32;
const DEFAULT_MAX_NODES = 100_000;
const DEFAULT_MAX_SLOTS = 128;
const DEFAULT_MAX_NAME_BYTES = 256;

export type SaveJsonPrimitive = null | boolean | number | string;
export type SaveJsonValue = SaveJsonPrimitive | SaveJsonValue[] | { [key: string]: SaveJsonValue };

export type SaveSlot = {
  name: string;
  dataVersion: number;
  savedAt: number;
  data: SaveJsonValue;
};

export type SaveProfile = {
  format: typeof SAVE_PROFILE_FORMAT;
  formatVersion: typeof SAVE_PROFILE_FORMAT_VERSION;
  gameId: string;
  profileId: string;
  revision: number;
  createdAt: number;
  updatedAt: number;
  slots: SaveSlot[];
};

export type SaveLimits = {
  maxBytes?: number;
  maxDepth?: number;
  maxNodes?: number;
  maxSlots?: number;
  maxNameBytes?: number;
};

type ResolvedSaveLimits = Required<SaveLimits>;

type SaveEnvelope = {
  format: typeof SAVE_ENVELOPE_FORMAT;
  envelopeVersion: typeof SAVE_ENVELOPE_VERSION;
  checksum: string;
  profile: SaveProfile;
};

export type SaveMigration = (data: SaveJsonValue) => SaveJsonValue;

/** A contiguous registry: each function migrates version N to exactly N + 1. */
export class SaveMigrationRegistry {
  readonly #steps = new Map<number, SaveMigration>();

  register(fromVersion: number, migration: SaveMigration): this {
    assertVersion(fromVersion, "Migration source version");
    if (typeof migration !== "function") throw new TypeError("Save migration must be a function.");
    if (this.#steps.has(fromVersion)) throw new Error(`A save migration from version ${fromVersion} is already registered.`);
    this.#steps.set(fromVersion, migration);
    return this;
  }

  has(fromVersion: number): boolean {
    return this.#steps.has(fromVersion);
  }

  migrate(data: SaveJsonValue, fromVersion: number, targetVersion: number, limits: SaveLimits = {}): SaveJsonValue {
    assertVersion(fromVersion, "Save data version");
    assertVersion(targetVersion, "Target save data version");
    if (fromVersion > targetVersion) throw new Error(`Save data version ${fromVersion} is newer than supported version ${targetVersion}.`);
    const resolved = resolveLimits(limits);
    let current = normalizeJson(data, resolved);
    for (let version = fromVersion; version < targetVersion; version += 1) {
      const migration = this.#steps.get(version);
      if (!migration) throw new Error(`Missing save migration from version ${version} to ${version + 1}.`);
      try {
        current = normalizeJson(migration(current), resolved);
      } catch (cause) {
        throw new Error(`Save migration from version ${version} to ${version + 1} failed: ${errorMessage(cause)}`, { cause });
      }
    }
    return current;
  }
}

export function createSaveProfile(gameId: string, profileId: string, createdAt = Date.now(), limits: SaveLimits = {}): SaveProfile {
  const resolved = resolveLimits(limits);
  assertName(gameId, "Game id", resolved.maxNameBytes);
  assertName(profileId, "Profile id", resolved.maxNameBytes);
  assertTimestamp(createdAt, "Profile creation timestamp");
  return {
    format: SAVE_PROFILE_FORMAT,
    formatVersion: SAVE_PROFILE_FORMAT_VERSION,
    gameId,
    profileId,
    revision: 0,
    createdAt,
    updatedAt: createdAt,
    slots: [],
  };
}

/** Returns a validated copy with a named slot inserted or replaced. */
export function withSaveSlot(
  profile: SaveProfile,
  name: string,
  data: SaveJsonValue,
  dataVersion: number,
  savedAt = Date.now(),
  limits: SaveLimits = {},
): SaveProfile {
  const resolved = resolveLimits(limits);
  const current = normalizeProfile(profile, resolved);
  assertName(name, "Save slot name", resolved.maxNameBytes);
  assertVersion(dataVersion, "Save data version");
  assertTimestamp(savedAt, "Save slot timestamp");
  if (savedAt < current.createdAt) throw new Error("Save slot timestamp cannot precede profile creation.");
  if (current.revision >= Number.MAX_SAFE_INTEGER) throw new Error("Save profile revision is exhausted.");
  const slot: SaveSlot = { name, dataVersion, savedAt, data: normalizeJson(data, resolved) };
  const slots = current.slots.filter((candidate) => candidate.name !== name);
  slots.push(slot);
  slots.sort(compareSlots);
  if (slots.length > resolved.maxSlots) throw new Error(`Save profile exceeds slot limit ${resolved.maxSlots}.`);
  return normalizeProfile({
    ...current,
    revision: current.revision + 1,
    updatedAt: Math.max(current.updatedAt, savedAt),
    slots,
  }, resolved);
}

/** Returns a validated copy without the named slot. Missing slots are a no-op. */
export function withoutSaveSlot(
  profile: SaveProfile,
  name: string,
  updatedAt = Date.now(),
  limits: SaveLimits = {},
): SaveProfile {
  const resolved = resolveLimits(limits);
  const current = normalizeProfile(profile, resolved);
  assertName(name, "Save slot name", resolved.maxNameBytes);
  assertTimestamp(updatedAt, "Save profile update timestamp");
  if (updatedAt < current.createdAt) throw new Error("Save profile update timestamp cannot precede profile creation.");
  if (!current.slots.some((slot) => slot.name === name)) return current;
  if (current.revision >= Number.MAX_SAFE_INTEGER) throw new Error("Save profile revision is exhausted.");
  return normalizeProfile({
    ...current,
    revision: current.revision + 1,
    updatedAt: Math.max(current.updatedAt, updatedAt),
    slots: current.slots.filter((slot) => slot.name !== name),
  }, resolved);
}

export function findSaveSlot(profile: SaveProfile, name: string, limits: SaveLimits = {}): SaveSlot | undefined {
  const resolved = resolveLimits(limits);
  assertName(name, "Save slot name", resolved.maxNameBytes);
  const slot = normalizeProfile(profile, resolved).slots.find((candidate) => candidate.name === name);
  return slot ? cloneSlot(slot, resolved) : undefined;
}

/** Migrates every slot through each registered version step. */
export function migrateSaveProfile(
  profile: SaveProfile,
  targetDataVersion: number,
  migrations: SaveMigrationRegistry,
  limits: SaveLimits = {},
): SaveProfile {
  assertVersion(targetDataVersion, "Target save data version");
  const resolved = resolveLimits(limits);
  const current = normalizeProfile(profile, resolved);
  let changed = false;
  const slots = current.slots.map((slot): SaveSlot => {
    if (slot.dataVersion === targetDataVersion) return slot;
    changed = true;
    return {
      ...slot,
      dataVersion: targetDataVersion,
      data: migrations.migrate(slot.data, slot.dataVersion, targetDataVersion, resolved),
    };
  });
  if (!changed) return current;
  if (current.revision >= Number.MAX_SAFE_INTEGER) throw new Error("Save profile revision is exhausted.");
  return normalizeProfile({ ...current, revision: current.revision + 1, slots }, resolved);
}

/** Canonical, newline-terminated JSON for portable save data and migration tests. */
export function canonicalSaveJson(value: unknown, limits: SaveLimits = {}): string {
  const resolved = resolveLimits(limits);
  const json = `${JSON.stringify(normalizeJson(value, resolved))}\n`;
  assertByteLength(json, resolved.maxBytes, "Canonical save JSON");
  return json;
}

/** Exports a deterministic UTF-8 envelope whose SHA-256 covers the entire profile. */
export async function exportSaveProfile(profile: SaveProfile, limits: SaveLimits = {}): Promise<Uint8Array> {
  const resolved = resolveLimits(limits);
  const normalized = normalizeProfile(profile, resolved);
  const profileJson = canonicalSaveJson(normalized, resolved);
  const envelope: SaveEnvelope = {
    format: SAVE_ENVELOPE_FORMAT,
    envelopeVersion: SAVE_ENVELOPE_VERSION,
    checksum: await sha256(utf8(profileJson)),
    profile: normalized,
  };
  const encoded = utf8(canonicalSaveJson(envelope, resolved));
  if (encoded.byteLength > resolved.maxBytes) throw new Error(`Save envelope exceeds byte limit ${resolved.maxBytes}.`);
  return encoded;
}

/** Imports, bounds, validates, and verifies an exported save envelope. */
export async function importSaveProfile(source: Uint8Array | string, limits: SaveLimits = {}): Promise<SaveProfile> {
  const resolved = resolveLimits(limits);
  const bytes = typeof source === "string" ? utf8(source) : copyBytes(source);
  if (bytes.byteLength > resolved.maxBytes) throw new Error(`Save envelope exceeds byte limit ${resolved.maxBytes}.`);
  let parsed: unknown;
  try {
    parsed = JSON.parse(decodeUtf8(bytes)) as unknown;
  } catch (cause) {
    throw new Error(`Save envelope is not valid UTF-8 JSON: ${errorMessage(cause)}`, { cause });
  }
  const envelope = normalizeEnvelope(parsed, resolved);
  const expected = await sha256(utf8(canonicalSaveJson(envelope.profile, resolved)));
  if (!constantTimeTextEqual(envelope.checksum, expected)) throw new Error("Save profile checksum verification failed.");
  return normalizeProfile(envelope.profile, resolved);
}

/** Alias pairs for callers that prefer encode/decode terminology. */
export const encodeSaveProfile = exportSaveProfile;
export const decodeSaveProfile = importSaveProfile;

/**
 * Storage implementations must serialize `updateAtomic` calls per key and
 * expose either the complete old value or the complete committed new value.
 */
export interface AtomicSaveStorage {
  read(key: string): Promise<Uint8Array | undefined>;
  updateAtomic(
    key: string,
    update: (current: Uint8Array | undefined) => Promise<Uint8Array | undefined>,
  ): Promise<Uint8Array | undefined>;
}

/** DOM-free reference adapter. Returned and stored buffers are always copied. */
export class InMemorySaveStorage implements AtomicSaveStorage {
  readonly #values = new Map<string, Uint8Array>();
  readonly #locks = new Map<string, Promise<void>>();

  async read(key: string): Promise<Uint8Array | undefined> {
    assertStorageKey(key);
    await this.#locks.get(key);
    const value = this.#values.get(key);
    return value ? new Uint8Array(value) : undefined;
  }

  async updateAtomic(
    key: string,
    update: (current: Uint8Array | undefined) => Promise<Uint8Array | undefined>,
  ): Promise<Uint8Array | undefined> {
    assertStorageKey(key);
    if (typeof update !== "function") throw new TypeError("Atomic save update must be a function.");
    const previous = this.#locks.get(key) ?? Promise.resolve();
    let committed: Uint8Array | undefined;
    const operation = previous.then(async () => {
      const current = this.#values.get(key);
      const next = await update(current ? new Uint8Array(current) : undefined);
      if (next !== undefined && !(next instanceof Uint8Array)) throw new TypeError("Atomic save update must return Uint8Array or undefined.");
      if (next === undefined) {
        this.#values.delete(key);
        committed = undefined;
      } else {
        committed = new Uint8Array(next);
        this.#values.set(key, committed);
      }
    });
    const settled = operation.then(() => undefined, () => undefined);
    this.#locks.set(key, settled);
    try {
      await operation;
      return committed ? new Uint8Array(committed) : undefined;
    } finally {
      if (this.#locks.get(key) === settled) this.#locks.delete(key);
    }
  }
}

export type SaveProfileStoreOptions = {
  currentDataVersion?: number;
  migrations?: SaveMigrationRegistry;
  limits?: SaveLimits;
  clock?: () => number;
};

/** Atomic named-slot operations over any `AtomicSaveStorage` implementation. */
export class SaveProfileStore {
  readonly #storage: AtomicSaveStorage;
  readonly #gameId: string;
  readonly #currentDataVersion: number;
  readonly #migrations: SaveMigrationRegistry;
  readonly #limits: SaveLimits;
  readonly #clock: () => number;

  constructor(storage: AtomicSaveStorage, gameId: string, options: SaveProfileStoreOptions = {}) {
    if (!storage || typeof storage.read !== "function" || typeof storage.updateAtomic !== "function") {
      throw new TypeError("Save storage must implement read and updateAtomic.");
    }
    const resolved = resolveLimits(options.limits);
    assertName(gameId, "Game id", resolved.maxNameBytes);
    assertVersion(options.currentDataVersion ?? 0, "Current save data version");
    this.#storage = storage;
    this.#gameId = gameId;
    this.#currentDataVersion = options.currentDataVersion ?? 0;
    this.#migrations = options.migrations ?? new SaveMigrationRegistry();
    this.#limits = { ...options.limits };
    this.#clock = options.clock ?? Date.now;
  }

  async loadProfile(profileId: string): Promise<SaveProfile | undefined> {
    const bytes = await this.#storage.read(this.#key(profileId));
    if (!bytes) return undefined;
    const profile = await importSaveProfile(bytes, this.#limits);
    this.#assertIdentity(profile, profileId);
    return migrateSaveProfile(profile, this.#currentDataVersion, this.#migrations, this.#limits);
  }

  async loadSlot(profileId: string, slotName: string): Promise<SaveSlot | undefined> {
    const profile = await this.loadProfile(profileId);
    return profile ? findSaveSlot(profile, slotName, this.#limits) : undefined;
  }

  async saveSlot(profileId: string, slotName: string, data: SaveJsonValue): Promise<SaveProfile> {
    const key = this.#key(profileId);
    let saved: SaveProfile | undefined;
    await this.#storage.updateAtomic(key, async (current) => {
      const now = this.#now();
      let profile = current
        ? await importSaveProfile(current, this.#limits)
        : createSaveProfile(this.#gameId, profileId, now, this.#limits);
      this.#assertIdentity(profile, profileId);
      profile = migrateSaveProfile(profile, this.#currentDataVersion, this.#migrations, this.#limits);
      saved = withSaveSlot(profile, slotName, data, this.#currentDataVersion, now, this.#limits);
      return exportSaveProfile(saved, this.#limits);
    });
    if (!saved) throw new Error("Atomic save operation did not produce a profile.");
    return saved;
  }

  async deleteSlot(profileId: string, slotName: string): Promise<SaveProfile | undefined> {
    const key = this.#key(profileId);
    let saved: SaveProfile | undefined;
    await this.#storage.updateAtomic(key, async (current) => {
      if (!current) return undefined;
      let profile = await importSaveProfile(current, this.#limits);
      this.#assertIdentity(profile, profileId);
      profile = migrateSaveProfile(profile, this.#currentDataVersion, this.#migrations, this.#limits);
      saved = withoutSaveSlot(profile, slotName, this.#now(), this.#limits);
      return exportSaveProfile(saved, this.#limits);
    });
    return saved;
  }

  async deleteProfile(profileId: string): Promise<void> {
    await this.#storage.updateAtomic(this.#key(profileId), async () => undefined);
  }

  async exportProfile(profileId: string): Promise<Uint8Array> {
    const profile = await this.loadProfile(profileId);
    if (!profile) throw new Error(`Save profile ${profileId} does not exist.`);
    return exportSaveProfile(profile, this.#limits);
  }

  async importProfile(source: Uint8Array | string, overwrite = false): Promise<SaveProfile> {
    const imported = await importSaveProfile(source, this.#limits);
    if (imported.gameId !== this.#gameId) throw new Error(`Save belongs to game ${imported.gameId}, not ${this.#gameId}.`);
    const key = this.#key(imported.profileId);
    const encoded = await exportSaveProfile(imported, this.#limits);
    await this.#storage.updateAtomic(key, async (current) => {
      if (current && !overwrite) throw new Error(`Save profile ${imported.profileId} already exists.`);
      return encoded;
    });
    return imported;
  }

  #key(profileId: string): string {
    assertName(profileId, "Profile id", resolveLimits(this.#limits).maxNameBytes);
    return `hyperfocus-save:${encodeURIComponent(this.#gameId)}:${encodeURIComponent(profileId)}`;
  }

  #assertIdentity(profile: SaveProfile, profileId: string): void {
    if (profile.gameId !== this.#gameId || profile.profileId !== profileId) {
      throw new Error("Stored save profile identity does not match its storage key.");
    }
  }

  #now(): number {
    const value = this.#clock();
    assertTimestamp(value, "Save clock value");
    return value;
  }
}

function normalizeEnvelope(value: unknown, limits: ResolvedSaveLimits): SaveEnvelope {
  if (!isPlainRecord(value)) throw new Error("Save envelope must be a plain object.");
  assertExactKeys(value, ["checksum", "envelopeVersion", "format", "profile"], "Save envelope");
  if (value.format !== SAVE_ENVELOPE_FORMAT || value.envelopeVersion !== SAVE_ENVELOPE_VERSION) {
    throw new Error("Save envelope format or version is unsupported.");
  }
  if (typeof value.checksum !== "string" || !/^[0-9a-f]{64}$/.test(value.checksum)) throw new Error("Save envelope checksum is invalid.");
  return {
    format: SAVE_ENVELOPE_FORMAT,
    envelopeVersion: SAVE_ENVELOPE_VERSION,
    checksum: value.checksum,
    profile: normalizeProfile(value.profile, limits),
  };
}

function normalizeProfile(value: unknown, limits: ResolvedSaveLimits): SaveProfile {
  if (!isPlainRecord(value)) throw new Error("Save profile must be a plain object.");
  assertExactKeys(value, ["createdAt", "format", "formatVersion", "gameId", "profileId", "revision", "slots", "updatedAt"], "Save profile");
  if (value.format !== SAVE_PROFILE_FORMAT || value.formatVersion !== SAVE_PROFILE_FORMAT_VERSION) {
    throw new Error("Save profile format or version is unsupported.");
  }
  assertName(value.gameId, "Game id", limits.maxNameBytes);
  assertName(value.profileId, "Profile id", limits.maxNameBytes);
  assertVersion(value.revision, "Save profile revision");
  assertTimestamp(value.createdAt, "Profile creation timestamp");
  assertTimestamp(value.updatedAt, "Profile update timestamp");
  const createdAt = value.createdAt;
  const updatedAt = value.updatedAt;
  if (updatedAt < createdAt) throw new Error("Profile update timestamp cannot precede profile creation.");
  if (!Array.isArray(value.slots) || value.slots.length > limits.maxSlots) throw new Error(`Save profile exceeds slot limit ${limits.maxSlots}.`);
  const names = new Set<string>();
  const slots = value.slots.map((candidate, index): SaveSlot => {
    if (!isPlainRecord(candidate)) throw new Error(`Save slot ${index} must be a plain object.`);
    assertExactKeys(candidate, ["data", "dataVersion", "name", "savedAt"], `Save slot ${index}`);
    assertName(candidate.name, `Save slot ${index} name`, limits.maxNameBytes);
    if (names.has(candidate.name)) throw new Error(`Duplicate save slot name: ${candidate.name}.`);
    names.add(candidate.name);
    assertVersion(candidate.dataVersion, `Save slot ${candidate.name} data version`);
    assertTimestamp(candidate.savedAt, `Save slot ${candidate.name} timestamp`);
    if (candidate.savedAt < createdAt || candidate.savedAt > updatedAt) {
      throw new Error(`Save slot ${candidate.name} timestamp is outside the profile lifetime.`);
    }
    return {
      name: candidate.name,
      dataVersion: candidate.dataVersion,
      savedAt: candidate.savedAt,
      data: normalizeJson(candidate.data, limits),
    };
  });
  slots.sort(compareSlots);
  const profile: SaveProfile = {
    format: SAVE_PROFILE_FORMAT,
    formatVersion: SAVE_PROFILE_FORMAT_VERSION,
    gameId: value.gameId,
    profileId: value.profileId,
    revision: value.revision,
    createdAt,
    updatedAt,
    slots,
  };
  normalizeJson(profile, limits);
  return profile;
}

function normalizeJson(value: unknown, limits: ResolvedSaveLimits): SaveJsonValue {
  const state = { nodes: 0, ancestors: new Set<object>() };
  return visitJson(value, limits, state, 0);
}

function visitJson(
  value: unknown,
  limits: ResolvedSaveLimits,
  state: { nodes: number; ancestors: Set<object> },
  depth: number,
): SaveJsonValue {
  state.nodes += 1;
  if (state.nodes > limits.maxNodes) throw new Error(`Save JSON exceeds node limit ${limits.maxNodes}.`);
  if (depth > limits.maxDepth) throw new Error(`Save JSON exceeds depth limit ${limits.maxDepth}.`);
  if (value === null || typeof value === "boolean" || typeof value === "string") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Save JSON numbers must be finite.");
    return Object.is(value, -0) ? 0 : value;
  }
  if (!value || typeof value !== "object") throw new Error(`Save JSON cannot contain ${typeof value}.`);
  if (state.ancestors.has(value)) throw new Error("Save JSON cannot contain cycles.");
  state.ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      const result: SaveJsonValue[] = [];
      for (let index = 0; index < value.length; index += 1) {
        const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
        if (!descriptor || !("value" in descriptor)) throw new Error("Save JSON arrays must be dense data arrays.");
        result.push(visitJson(descriptor.value, limits, state, depth + 1));
      }
      return result;
    }
    if (!isPlainRecord(value)) throw new Error("Save JSON may contain only plain objects and arrays.");
    if (Object.getOwnPropertySymbols(value).some((symbol) => Object.getOwnPropertyDescriptor(value, symbol)?.enumerable)) {
      throw new Error("Save JSON cannot contain enumerable symbol properties.");
    }
    const result: { [key: string]: SaveJsonValue } = Object.create(null) as { [key: string]: SaveJsonValue };
    for (const key of Object.keys(value).sort(compareText)) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !("value" in descriptor)) throw new Error(`Save JSON property ${key} must not be an accessor.`);
      result[key] = visitJson(descriptor.value, limits, state, depth + 1);
    }
    return result;
  } finally {
    state.ancestors.delete(value);
  }
}

function cloneSlot(slot: SaveSlot, limits: ResolvedSaveLimits): SaveSlot {
  return { ...slot, data: normalizeJson(slot.data, limits) };
}

function compareSlots(a: SaveSlot, b: SaveSlot): number {
  return compareText(a.name, b.name);
}

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function resolveLimits(limits: SaveLimits | undefined): ResolvedSaveLimits {
  return {
    maxBytes: positiveInteger(limits?.maxBytes ?? DEFAULT_MAX_BYTES, "maxBytes"),
    maxDepth: nonNegativeInteger(limits?.maxDepth ?? DEFAULT_MAX_DEPTH, "maxDepth"),
    maxNodes: positiveInteger(limits?.maxNodes ?? DEFAULT_MAX_NODES, "maxNodes"),
    maxSlots: positiveInteger(limits?.maxSlots ?? DEFAULT_MAX_SLOTS, "maxSlots"),
    maxNameBytes: positiveInteger(limits?.maxNameBytes ?? DEFAULT_MAX_NAME_BYTES, "maxNameBytes"),
  };
}

function positiveInteger(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) throw new RangeError(`${name} must be a positive safe integer.`);
  return value;
}

function nonNegativeInteger(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value < 0) throw new RangeError(`${name} must be a non-negative safe integer.`);
  return value;
}

function assertVersion(value: unknown, label: string): asserts value is number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) throw new Error(`${label} must be a non-negative safe integer.`);
}

function assertTimestamp(value: unknown, label: string): asserts value is number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) throw new Error(`${label} must be a non-negative millisecond timestamp.`);
}

function assertName(value: unknown, label: string, maxBytes: number): asserts value is string {
  if (typeof value !== "string" || value.length === 0 || utf8(value).byteLength > maxBytes || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new Error(`${label} must be non-empty UTF-8 text without control characters and at most ${maxBytes} bytes.`);
  }
}

function assertStorageKey(value: string): void {
  if (typeof value !== "string" || !value || utf8(value).byteLength > 2_048) throw new Error("Save storage key is invalid or too long.");
}

function assertExactKeys(value: Record<string, unknown>, expected: readonly string[], label: string): void {
  const actual = Object.keys(value).sort(compareText);
  const sortedExpected = [...expected].sort(compareText);
  if (actual.length !== sortedExpected.length || actual.some((key, index) => key !== sortedExpected[index])) {
    throw new Error(`${label} has unknown or missing fields.`);
  }
}

function assertByteLength(value: string, maxBytes: number, label: string): void {
  if (utf8(value).byteLength > maxBytes) throw new Error(`${label} exceeds byte limit ${maxBytes}.`);
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
  return new TextDecoder("utf-8", { fatal: true }).decode(value);
}

function copyBytes(value: Uint8Array): Uint8Array {
  if (!(value instanceof Uint8Array)) throw new TypeError("Save envelope must be a UTF-8 string or Uint8Array.");
  return new Uint8Array(value);
}

async function sha256(value: Uint8Array): Promise<string> {
  const owned = new Uint8Array(value);
  const digest = new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", owned.buffer));
  return [...digest].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function constantTimeTextEqual(a: string, b: string): boolean {
  let difference = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) difference |= (a.charCodeAt(index) || 0) ^ (b.charCodeAt(index) || 0);
  return difference === 0;
}

function errorMessage(value: unknown): string {
  return value instanceof Error ? value.message : String(value);
}

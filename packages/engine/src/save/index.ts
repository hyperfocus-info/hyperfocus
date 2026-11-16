import { compareText, constantTimeTextEqual } from "@hyperfocus/utilities/text";
import { errorMessage } from "@hyperfocus/utilities/text";
import { isPlainRecord } from "@hyperfocus/utilities/records";
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

const DEFAULT_MAX_BYTES = 4194304;
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

export type SaveMigrationRegistry = {
  register(fromVersion: number, migration: SaveMigration): SaveMigrationRegistry;
  has(fromVersion: number): boolean;
  migrate(data: SaveJsonValue, fromVersion: number, targetVersion: number, limits?: SaveLimits): SaveJsonValue;
};

/** Creates a contiguous registry whose steps migrate version N to exactly N + 1. */
export function createSaveMigrationRegistry(): SaveMigrationRegistry {
  const steps = new Map<number, SaveMigration>();
  const registry: SaveMigrationRegistry = {
    register(fromVersion, migration) {
      assertVersion(fromVersion, "Migration source version");
      if (typeof migration !== "function") throw new TypeError("Save migration must be a function.");
      if (steps.has(fromVersion)) throw new Error(`A save migration from version ${fromVersion} is already registered.`);
      steps.set(fromVersion, migration);
      return registry;
    },
    has: (fromVersion) => steps.has(fromVersion),
    migrate(data, fromVersion, targetVersion, limits = {}) {
      assertVersion(fromVersion, "Save data version");
      assertVersion(targetVersion, "Target save data version");
      if (fromVersion > targetVersion) throw new Error(`Save data version ${fromVersion} is newer than supported version ${targetVersion}.`);
      const resolved = resolveLimits(limits);
      let current = normalizeJson(data, resolved);
      for (let version = fromVersion; version < targetVersion; version += 1) {
        const migration = steps.get(version);
        if (!migration) throw new Error(`Missing save migration from version ${version} to ${version + 1}.`);
        try { current = normalizeJson(migration(current), resolved); }
        catch (cause) { throw new Error(`Save migration from version ${version} to ${version + 1} failed: ${errorMessage(cause, { stringify: true })}`, { cause }); }
      }
      return current;
    },
  };
  return Object.freeze(registry);
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

/** Returns a detached, validated value suitable for storage in a save profile. */
export function normalizeSaveJson(value: unknown, limits: SaveLimits = {}): SaveJsonValue {
  return normalizeJson(value, resolveLimits(limits));
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
    const decoded: unknown = JSON.parse(decodeUtf8(bytes));
    parsed = decoded;
  } catch (cause) {
    throw new Error(`Save envelope is not valid UTF-8 JSON: ${errorMessage(cause, { stringify: true })}`, { cause });
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

/** Creates a DOM-free adapter whose returned and stored buffers are always copied. */
export function createInMemorySaveStorage() {
  const values = new Map<string, Uint8Array>();
  const locks = new Map<string, Promise<void>>();
  return Object.freeze({
    async read(key: string) {
      assertStorageKey(key);
      await locks.get(key);
      const value = values.get(key);
      return value ? new Uint8Array(value) : undefined;
    },
    async updateAtomic(key: string, update: (current: Uint8Array | undefined) => Promise<Uint8Array | undefined>) {
      assertStorageKey(key);
      if (typeof update !== "function") throw new TypeError("Atomic save update must be a function.");
      const previous = locks.get(key) ?? Promise.resolve();
      let committed: Uint8Array | undefined;
      const operation = previous.then(async () => {
        const current = values.get(key);
        const next = await update(current ? new Uint8Array(current) : undefined);
        if (next !== undefined && !(next instanceof Uint8Array)) throw new TypeError("Atomic save update must return Uint8Array or undefined.");
        if (next === undefined) {
          values.delete(key);
          committed = undefined;
        } else {
          committed = new Uint8Array(next);
          values.set(key, committed);
        }
      });
      const settled = operation.then(() => undefined, () => undefined);
      locks.set(key, settled);
      try {
        await operation;
        return committed ? new Uint8Array(committed) : undefined;
      } finally {
        if (locks.get(key) === settled) locks.delete(key);
      }
    },
  });
}

export type InMemorySaveStorage = ReturnType<typeof createInMemorySaveStorage>;

export type SaveProfileStoreOptions = {
  currentDataVersion?: number;
  migrations?: SaveMigrationRegistry;
  limits?: SaveLimits;
  clock?: () => number;
};

/** Creates atomic named-slot operations over any `AtomicSaveStorage` implementation. */
export function createSaveProfileStore(storage: AtomicSaveStorage, gameId: string, options: SaveProfileStoreOptions = {}) {
  if (!storage || typeof storage.read !== "function" || typeof storage.updateAtomic !== "function") throw new TypeError("Save storage must implement read and updateAtomic.");
  const resolved = resolveLimits(options.limits);
  assertName(gameId, "Game id", resolved.maxNameBytes);
  const currentDataVersion = options.currentDataVersion ?? 0;
  assertVersion(currentDataVersion, "Current save data version");
  const migrations = options.migrations ?? createSaveMigrationRegistry();
  const limits = { ...options.limits };
  const clock = options.clock ?? Date.now;
  const key = (profileId: string) => {
    assertName(profileId, "Profile id", resolveLimits(limits).maxNameBytes);
    return `hyperfocus-save:${encodeURIComponent(gameId)}:${encodeURIComponent(profileId)}`;
  };
  const assertIdentity = (profile: SaveProfile, profileId: string) => {
    if (profile.gameId !== gameId || profile.profileId !== profileId) throw new Error("Stored save profile identity does not match its storage key.");
  };
  const now = () => {
    const value = clock();
    assertTimestamp(value, "Save clock value");
    return value;
  };
  const loadProfile = async (profileId: string): Promise<SaveProfile | undefined> => {
    const bytes = await storage.read(key(profileId));
    if (!bytes) return undefined;
    const profile = await importSaveProfile(bytes, limits);
    assertIdentity(profile, profileId);
    return migrateSaveProfile(profile, currentDataVersion, migrations, limits);
  };
  return Object.freeze({
    loadProfile,
    async loadSlot(profileId: string, slotName: string) {
      const profile = await loadProfile(profileId);
      return profile ? findSaveSlot(profile, slotName, limits) : undefined;
    },
    async saveSlot(profileId: string, slotName: string, data: SaveJsonValue) {
      const storageKey = key(profileId);
      let saved: SaveProfile | undefined;
      await storage.updateAtomic(storageKey, async (current) => {
        const savedAt = now();
        let profile = current
          ? await importSaveProfile(current, limits)
          : createSaveProfile(gameId, profileId, savedAt, limits);
        assertIdentity(profile, profileId);
        profile = migrateSaveProfile(profile, currentDataVersion, migrations, limits);
        saved = withSaveSlot(profile, slotName, data, currentDataVersion, savedAt, limits);
        return exportSaveProfile(saved, limits);
      });
      if (!saved) throw new Error("Atomic save operation did not produce a profile.");
      return saved;
    },
    async deleteSlot(profileId: string, slotName: string) {
      const storageKey = key(profileId);
      let saved: SaveProfile | undefined;
      await storage.updateAtomic(storageKey, async (current) => {
        if (!current) return undefined;
        let profile = await importSaveProfile(current, limits);
        assertIdentity(profile, profileId);
        profile = migrateSaveProfile(profile, currentDataVersion, migrations, limits);
        saved = withoutSaveSlot(profile, slotName, now(), limits);
        return exportSaveProfile(saved, limits);
      });
      return saved;
    },
    async deleteProfile(profileId: string) {
      await storage.updateAtomic(key(profileId), async () => undefined);
    },
    async exportProfile(profileId: string) {
      const profile = await loadProfile(profileId);
      if (!profile) throw new Error(`Save profile ${profileId} does not exist.`);
      return exportSaveProfile(profile, limits);
    },
    async importProfile(source: Uint8Array | string, overwrite = false) {
      const imported = await importSaveProfile(source, limits);
      if (imported.gameId !== gameId) throw new Error(`Save belongs to game ${imported.gameId}, not ${gameId}.`);
      const storageKey = key(imported.profileId);
      const encoded = await exportSaveProfile(imported, limits);
      await storage.updateAtomic(storageKey, async (current) => {
        if (current && !overwrite) throw new Error(`Save profile ${imported.profileId} already exists.`);
        return encoded;
      });
      return imported;
    },
  });
}

export type SaveProfileStore = ReturnType<typeof createSaveProfileStore>;

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
    const result: { [key: string]: SaveJsonValue } = Object.create(null);
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

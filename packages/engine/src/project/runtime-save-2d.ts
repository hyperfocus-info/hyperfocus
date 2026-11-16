import { compareText } from "@hyperfocus/utilities/text";
import { errorMessage as message } from "@hyperfocus/utilities/text";
import { isPlainRecord as isRecord } from "@hyperfocus/utilities/records";
import {
  createSaveMigrationRegistry,
  createSaveProfileStore,
  normalizeSaveJson,
  type AtomicSaveStorage,
  type SaveJsonValue,
  type SaveMigrationRegistry,
  type SaveProfile,
} from "../save/index.ts";
import type { PlayableProject2D, PlayableWorldSnapshot } from "./runtime2d/runtime-2d-contracts.ts";
import type { PlayableWorld } from "./runtime2d/runtime-world-2d.ts";
import { parsePlayableWorldSnapshot } from "./runtime2d/runtime-2d-support.ts";

export const PLAYABLE_WORLD_SAVE_SCHEMA = "portable-world-snapshot-v1" as const;
const MAX_DECLARED_SAVE_BYTES = 4194304;
const MAX_DECLARED_SLOTS = 16;

export type PlayableSaveDeclaration2D = {
  schema: typeof PLAYABLE_WORLD_SAVE_SCHEMA;
  dataVersion: number;
  slotPolicy: "single" | "named";
  slots: readonly string[];
  defaultSlot: string;
  restoreOnBoot: boolean;
  editorPlay: "reset" | "restore";
  maxBytes: number;
};

export type PlayableSaveProject2D = PlayableProject2D & {
  id?: string;
  extensions?: { hyperfocusSave?: unknown; [key: string]: unknown };
};

export type PlayableSaveControllerOptions2D = {
  profileId?: string;
  migrations?: SaveMigrationRegistry;
  stateProviders?: readonly PlayableSaveStateProvider2D[];
  /** Hosts can acquire the destination scene before any world state is changed. */
  prepareRestore?: (snapshot: PlayableWorldSnapshot) => Promise<void>;
};

export type PlayableSaveStateProvider2D = {
  key: string;
  snapshot(): SaveJsonValue;
  restore(snapshot: SaveJsonValue): void;
};

export type PlayableSaveController2D = {
  readonly declaration: Readonly<PlayableSaveDeclaration2D>;
  readonly profileId: string;
  save(slotName?: string): Promise<SaveProfile>;
  restore(slotName?: string): Promise<boolean>;
  restoreOnBoot(): Promise<boolean>;
  reset(): PlayableWorldSnapshot;
  deleteSlot(slotName?: string): Promise<SaveProfile | undefined>;
  deleteProfile(): Promise<void>;
  exportProfile(): Promise<Uint8Array>;
  importProfile(source: Uint8Array | string, overwrite?: boolean): Promise<SaveProfile>;
};

/** Reads and validates the optional persisted save declaration without mutating it. */
export function readPlayableSaveDeclaration2D(project: PlayableSaveProject2D): PlayableSaveDeclaration2D | undefined {
  const raw = project.extensions?.hyperfocusSave;
  if (raw === undefined) return undefined;
  if (!isRecord(raw)) throw new Error("extensions.hyperfocusSave must be an object.");
  const expected = ["dataVersion", "defaultSlot", "editorPlay", "maxBytes", "restoreOnBoot", "schema", "slotPolicy", "slots"];
  const keys = Object.keys(raw).sort(compareText);
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) {
    throw new Error("extensions.hyperfocusSave has unknown or missing fields.");
  }
  if (raw.schema !== PLAYABLE_WORLD_SAVE_SCHEMA) throw new Error(`Unsupported playable save schema: ${String(raw.schema)}.`);
  if (!isIntegerBetween(raw.dataVersion, 0, 256)) {
    throw new Error("Playable save dataVersion must be an integer between 0 and 256.");
  }
  if (raw.slotPolicy !== "single" && raw.slotPolicy !== "named") throw new Error("Playable save slotPolicy must be single or named.");
  if (!Array.isArray(raw.slots) || raw.slots.length === 0 || raw.slots.length > MAX_DECLARED_SLOTS) {
    throw new Error(`Playable saves must declare between 1 and ${MAX_DECLARED_SLOTS} slots.`);
  }
  const slots = raw.slots.map((slot) => saveName(slot, "Playable save slot"));
  if (new Set(slots).size !== slots.length) throw new Error("Playable save slot names must be unique.");
  if (raw.slotPolicy === "single" && slots.length !== 1) throw new Error("Playable save slotPolicy single requires exactly one slot.");
  const defaultSlot = saveName(raw.defaultSlot, "Playable save defaultSlot");
  if (!slots.includes(defaultSlot)) throw new Error("Playable save defaultSlot must be one of the declared slots.");
  if (typeof raw.restoreOnBoot !== "boolean") throw new Error("Playable save restoreOnBoot must be boolean.");
  if (raw.editorPlay !== "reset" && raw.editorPlay !== "restore") throw new Error("Playable save editorPlay must be reset or restore.");
  if (!isIntegerBetween(raw.maxBytes, 1_024, MAX_DECLARED_SAVE_BYTES)) {
    throw new Error(`Playable save maxBytes must be an integer between 1024 and ${MAX_DECLARED_SAVE_BYTES}.`);
  }
  return {
    schema: PLAYABLE_WORLD_SAVE_SCHEMA,
    dataVersion: raw.dataVersion,
    slotPolicy: raw.slotPolicy,
    slots,
    defaultSlot,
    restoreOnBoot: raw.restoreOnBoot,
    editorPlay: raw.editorPlay,
    maxBytes: raw.maxBytes,
  };
}

export function validatePlayableSaveProject2D(project: PlayableSaveProject2D): void {
  const declaration = readPlayableSaveDeclaration2D(project);
  if (declaration && (typeof project.id !== "string" || !project.id)) {
    throw new Error("A project with extensions.hyperfocusSave must declare a non-empty project id.");
  }
}

/**
 * Binds checksummed named save profiles to one world. Storage remains host-owned;
 * no profile bytes are added to the portable project pair.
 */
export function createPlayableSaveController2D(
  project: PlayableSaveProject2D,
  world: PlayableWorld,
  storage: AtomicSaveStorage,
  options: PlayableSaveControllerOptions2D = {},
): PlayableSaveController2D | undefined {
  validatePlayableSaveProject2D(project);
  const declaration = readPlayableSaveDeclaration2D(project);
  if (!declaration) return undefined;
  const projectId = project.id;
  if (typeof projectId !== "string" || !projectId) throw new Error("A playable save project must declare a non-empty project id.");
  const profileId = saveName(options.profileId ?? "local", "Playable save profile id");
  const providers = normalizeProviders(options.stateProviders ?? []);
  const limits = { maxBytes: declaration.maxBytes, maxSlots: declaration.slots.length };
  const store = createSaveProfileStore(storage, projectId, {
    currentDataVersion: declaration.dataVersion,
    migrations: options.migrations ?? worldSnapshotMigrations(declaration.dataVersion),
    limits,
  });
  const initial = world.snapshot();
  const initialProviderState = new Map(providers.map((provider) => [provider.key, provider.snapshot()]));
  const resolveSlot = (slotName = declaration.defaultSlot) => {
    const normalized = saveName(slotName, "Playable save slot");
    if (!declaration.slots.includes(normalized)) throw new Error(`Playable save slot ${normalized} is not declared by the project.`);
    return normalized;
  };
  const restore = async (slotName?: string) => {
    const slot = await store.loadSlot(profileId, resolveSlot(slotName));
    if (!slot) return false;
    const decoded = decodeWorldSave(slot.data, declaration.schema, providers);
    await options.prepareRestore?.(decoded.snapshot);
    const rollback = world.snapshot();
    const providerRollback = new Map(providers.map((provider) => [provider.key, provider.snapshot()]));
    try {
      world.restore(decoded.snapshot);
      for (const provider of providers) provider.restore(decoded.state.get(provider.key)!);
    } catch (cause) {
      world.restore(rollback);
      for (const provider of providers) provider.restore(providerRollback.get(provider.key)!);
      throw new Error(`Playable save restore failed: ${message(cause, { stringify: true })}`, { cause });
    }
    return true;
  };
  return Object.freeze({
    declaration: Object.freeze({ ...declaration, slots: Object.freeze([...declaration.slots]) }),
    profileId,
    async save(slotName?: string) {
      const state = Object.fromEntries(providers.map((provider) => [provider.key, provider.snapshot()]));
      const data = toSaveJson({ schema: declaration.schema, snapshot: world.snapshot(), ...(providers.length ? { state } : {}) }, declaration.maxBytes);
      return store.saveSlot(profileId, resolveSlot(slotName), data);
    },
    restore,
    restoreOnBoot: async () => declaration.restoreOnBoot ? restore() : false,
    reset: () => {
      const snapshot = world.restore(initial);
      for (const provider of providers) provider.restore(initialProviderState.get(provider.key)!);
      return snapshot;
    },
    deleteSlot: (slotName?: string) => store.deleteSlot(profileId, resolveSlot(slotName)),
    deleteProfile: () => store.deleteProfile(profileId),
    exportProfile: () => store.exportProfile(profileId),
    importProfile: (source: Uint8Array | string, overwrite = false) => store.importProfile(source, overwrite),
  });
}

/** Creates session-only Editor Play state that never writes browser save profiles. */
export function createPlayableEditorPlaySession2D() {
  const snapshots = new Map<string, { world: PlayableWorldSnapshot; state: Map<string, SaveJsonValue> }>();
  return Object.freeze({
    start(project: PlayableSaveProject2D, world: PlayableWorld, stateProviders: readonly PlayableSaveStateProvider2D[] = []): boolean {
    const declaration = readPlayableSaveDeclaration2D(project);
    if (!declaration || declaration.editorPlay === "reset" || typeof project.id !== "string") {
      if (typeof project.id === "string") snapshots.delete(project.id);
      return false;
    }
    const snapshot = snapshots.get(project.id);
    if (!snapshot) return false;
    const providers = normalizeProviders(stateProviders);
    if (providers.length !== snapshot.state.size || providers.some((provider) => !snapshot.state.has(provider.key))) {
      snapshots.delete(project.id);
      return false;
    }
    try {
      world.restore(structuredClone(snapshot.world));
      for (const provider of providers) provider.restore(structuredClone(snapshot.state.get(provider.key)!));
      return true;
    } catch {
      snapshots.delete(project.id);
      return false;
    }
    },

    stop(project: PlayableSaveProject2D, world: PlayableWorld, stateProviders: readonly PlayableSaveStateProvider2D[] = []): void {
    const declaration = readPlayableSaveDeclaration2D(project);
    if (declaration?.editorPlay === "restore" && typeof project.id === "string") {
      const providers = normalizeProviders(stateProviders);
      snapshots.set(project.id, { world: world.snapshot(), state: new Map(providers.map((provider) => [provider.key, provider.snapshot()])) });
    }
    else if (typeof project.id === "string") snapshots.delete(project.id);
    },

    clear(projectId?: string): void {
      if (projectId === undefined) snapshots.clear();
      else snapshots.delete(projectId);
    },
  });
}

export type PlayableEditorPlaySession2D = ReturnType<typeof createPlayableEditorPlaySession2D>;

function decodeWorldSave(value: SaveJsonValue, schema: typeof PLAYABLE_WORLD_SAVE_SCHEMA, providers: readonly PlayableSaveStateProvider2D[]) {
  if (!isRecord(value) || value.schema !== schema || !isRecord(value.snapshot)) throw new Error(`Save slot does not contain ${schema}.`);
  const state = new Map<string, SaveJsonValue>();
  if (providers.length) {
    if (!isRecord(value.state)) throw new Error("Save slot is missing declared runtime extension state.");
    const expected = providers.map((provider) => provider.key).sort(compareText);
    const actual = Object.keys(value.state).sort(compareText);
    if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) throw new Error("Save slot runtime extension state does not match the current project.");
    for (const provider of providers) state.set(provider.key, normalizeSaveJson(value.state[provider.key]));
  }
  return { snapshot: parsePlayableWorldSnapshot(structuredClone(value.snapshot)), state };
}

function toSaveJson(value: unknown, maxBytes: number): SaveJsonValue {
  return normalizeSaveJson(value, { maxBytes });
}

function worldSnapshotMigrations(targetVersion: number) {
  const migrations = createSaveMigrationRegistry();
  for (let version = 0; version < targetVersion; version += 1) migrations.register(version, (data) => data);
  return migrations;
}

function normalizeProviders(providers: readonly PlayableSaveStateProvider2D[]) {
  const keys = new Set<string>();
  return providers.map((provider) => {
    if (!provider || typeof provider.snapshot !== "function" || typeof provider.restore !== "function") throw new Error("Playable save state providers must implement snapshot and restore.");
    const key = saveName(provider.key, "Playable save state provider key");
    if (keys.has(key)) throw new Error(`Duplicate playable save state provider: ${key}.`);
    keys.add(key);
    return { key, snapshot: provider.snapshot.bind(provider), restore: provider.restore.bind(provider) };
  });
}

function saveName(value: unknown, label: string): string {
  if (typeof value !== "string" || !value || new TextEncoder().encode(value).byteLength > 128 || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new Error(`${label} must be non-empty UTF-8 text without control characters and at most 128 bytes.`);
  }
  return value;
}

function isIntegerBetween(value: unknown, minimum: number, maximum: number): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= minimum && value <= maximum;
}

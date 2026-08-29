import {
  T3_RIG_SCHEMA_VERSION,
  parseT3Rig,
  serializeT3Rig,
  type T3RigDocument,
} from "../motion/rig.ts";

export type T3RigMigration = {
  id: string;
  fromVersion: number;
  toVersion: number;
  migrate(document: Readonly<Record<string, unknown>>): unknown;
};

export type T3RigMigrationResult = {
  document: T3RigDocument;
  fromVersion: number;
  toVersion: typeof T3_RIG_SCHEMA_VERSION;
  migrated: boolean;
  applied: readonly string[];
};

export type MigrateT3RigOptions = {
  migrations?: readonly T3RigMigration[];
};

export const t3RigMigrations: readonly T3RigMigration[] = Object.freeze([]);

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function requirePlainRecord(value: unknown, label: string): Record<string, unknown> {
  if (!isPlainRecord(value)) throw new TypeError(`${label} must be a plain object`);
  return value;
}

function cloneJson(value: unknown, ancestors = new WeakSet<object>()): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("t3rig migrations accept only finite JSON numbers");
    return value;
  }
  if (typeof value !== "object") throw new TypeError("t3rig migrations accept only JSON-compatible values");
  if (ancestors.has(value)) throw new TypeError("t3rig migration input cannot contain cycles");
  ancestors.add(value);
  try {
    if (Array.isArray(value)) return value.map((entry) => cloneJson(entry, ancestors));
    if (!isPlainRecord(value)) throw new TypeError("t3rig migration objects must use a plain prototype");
    const output: Record<string, unknown> = {};
    for (const key of Object.keys(value)) output[key] = cloneJson(Reflect.get(value, key), ancestors);
    return output;
  } finally {
    ancestors.delete(value);
  }
}

function documentVersion(value: unknown) {
  const document = requirePlainRecord(value, "t3rig document");
  const version = document.schemaVersion;
  if (typeof version !== "number" || !Number.isSafeInteger(version) || version < 0) {
    throw new TypeError("t3rig schemaVersion must be a non-negative integer");
  }
  return version;
}

function validateMigrationList(migrations: readonly T3RigMigration[]) {
  const fromVersions = new Set<number>();
  for (const migration of migrations) {
    if (!migration.id) throw new TypeError("t3rig migration id must be non-empty");
    if (!Number.isSafeInteger(migration.fromVersion) || !Number.isSafeInteger(migration.toVersion)
      || migration.fromVersion < 0 || migration.toVersion !== migration.fromVersion + 1) {
      throw new RangeError(`t3rig migration ${migration.id} must advance exactly one schema version`);
    }
    if (fromVersions.has(migration.fromVersion)) throw new RangeError(`duplicate t3rig migration from version ${migration.fromVersion}`);
    fromVersions.add(migration.fromVersion);
  }
}

export function migrateT3RigDocument(input: string | unknown, options: MigrateT3RigOptions = {}): T3RigMigrationResult {
  let current: unknown = typeof input === "string" ? JSON.parse(input) : cloneJson(input);
  const fromVersion = documentVersion(current);
  if (fromVersion > T3_RIG_SCHEMA_VERSION) {
    throw new RangeError(`t3rig schema version ${fromVersion} is newer than supported version ${T3_RIG_SCHEMA_VERSION}`);
  }
  const migrations = options.migrations ?? t3RigMigrations;
  validateMigrationList(migrations);
  const migrationsByVersion = new Map(migrations.map((migration) => [migration.fromVersion, migration] as const));
  const applied: string[] = [];
  let version = fromVersion;
  while (version < T3_RIG_SCHEMA_VERSION) {
    const migration = migrationsByVersion.get(version);
    if (!migration) throw new RangeError(`no t3rig migration path from schema version ${version}`);
    const migrationInput = requirePlainRecord(cloneJson(current), "t3rig migration input");
    current = cloneJson(migration.migrate(migrationInput));
    const nextVersion = documentVersion(current);
    if (nextVersion !== migration.toVersion) {
      throw new RangeError(`t3rig migration ${migration.id} produced schema version ${nextVersion}, expected ${migration.toVersion}`);
    }
    version = nextVersion;
    applied.push(migration.id);
  }
  return {
    document: parseT3Rig(current),
    fromVersion,
    toVersion: T3_RIG_SCHEMA_VERSION,
    migrated: applied.length > 0,
    applied,
  };
}

export function migrateT3RigText(input: string, options: MigrateT3RigOptions = {}): string {
  return serializeT3Rig(migrateT3RigDocument(input, options).document);
}

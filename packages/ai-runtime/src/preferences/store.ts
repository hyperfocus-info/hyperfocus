import { sharedAiPreferencesSchema } from "@hyperfocus/ai-core/runtime";
import { encodeStorageValue, readStoredBytes } from "@hyperfocus/serialization";
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

export function createSharedAiPreferencesStore(options: { filePath?: string } = {}) {
  const filePath = options.filePath ?? defaultPreferencesPath();
  return {
    read() {
      let content: Uint8Array;
      try { content = readFileSync(filePath); }
      catch (error) {
        if (error instanceof Error && "code" in error && error.code === "ENOENT") {
          return sharedAiPreferencesSchema.parse({ version: 1 });
        } else {
          throw error;
        }
      }
      try {
        // Explicit comparison files may contain protobuf; default writes remain JSON.
        return sharedAiPreferencesSchema.parse(readStoredBytes(content));
      }
      catch { throw new Error(`Invalid shared AI preferences: ${filePath}. Repair or remove this file before retrying.`); }
    },
    /** Replaces the complete small preference object; callers never merge stale disk state. */
    write(value: unknown) {
      const preferences = sharedAiPreferencesSchema.parse(value);
      mkdirSync(path.dirname(filePath), { recursive: true });
      const temporaryPath = `${filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
      try {
        writeFileSync(temporaryPath, encodeStorageValue(preferences), { mode: 0o600 });
        renameSync(temporaryPath, filePath);
      } finally { rmSync(temporaryPath, { force: true }); }
      return preferences;
    }
  };
}

export type SharedAiPreferencesStore = ReturnType<typeof createSharedAiPreferencesStore>;

function defaultPreferencesPath() {
  const home = homedir();
  const directory = process.platform === "win32"
    ? process.env.APPDATA?.trim() || path.join(home, "AppData", "Roaming")
    : process.platform === "darwin"
      ? path.join(home, "Library", "Application Support")
      : process.env.XDG_CONFIG_HOME?.trim() || path.join(home, ".config");
  return path.join(directory, "Hyperfocus", "ai", "preferences-v1.json");
}

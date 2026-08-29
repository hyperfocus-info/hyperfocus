import { Database } from "bun:sqlite";
import { existsSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { resolveHarnessDbPath } from "./harness-paths";
import { createProviderCredentialStore, type ProviderCredentialStore } from "./provider-credential-store";
import { createWorkspaceRepository, type WorkspaceRepository } from "./workspace-repository";

/**
 * Opens the real repository for an explicit repair, or a disposable serialized
 * snapshot for read-only doctor inspection. Migrations and persisted-data
 * recovery can therefore run against the snapshot without modifying the user's
 * database, WAL, or journal mode.
 */
export async function withDoctorRepository<T>(
  options: { repair: boolean; dbPath?: string; defaultRootPath?: string },
  inspect: (repository: WorkspaceRepository) => Promise<T>
) {
  const sourcePath = options.dbPath ?? resolveHarnessDbPath();
  const defaultRootPath = options.defaultRootPath ?? process.cwd();
  const persistedCredentialStore = createProviderCredentialStore(sourcePath);
  const providerCredentialStore = options.repair
    ? persistedCredentialStore
    : createReadOnlyCredentialStore(persistedCredentialStore);

  if (options.repair) {
    const repository = createWorkspaceRepository(sourcePath, defaultRootPath, { providerCredentialStore });
    try {
      return await inspect(repository);
    } finally {
      repository.close();
    }
  }

  if (!existsSync(sourcePath)) {
    const repository = createWorkspaceRepository(":memory:", defaultRootPath, { providerCredentialStore });
    try {
      return await inspect(repository);
    } finally {
      repository.close();
    }
  }

  const snapshotRoot = await mkdtemp(path.join(os.tmpdir(), "hyperfocus-doctor-"));
  const snapshotPath = path.join(snapshotRoot, "harness.db");
  let source: Database | undefined;
  let repository: WorkspaceRepository | undefined;
  try {
    source = new Database(sourcePath, { readonly: true, strict: true });
    await writeFile(snapshotPath, source.serialize());
    source.close(false);
    source = undefined;

    repository = createWorkspaceRepository(snapshotPath, defaultRootPath, { providerCredentialStore });
    return await inspect(repository);
  } finally {
    source?.close(false);
    repository?.close();
    await removeSnapshotRoot(snapshotRoot);
  }
}

function createReadOnlyCredentialStore(store: ProviderCredentialStore): ProviderCredentialStore {
  return {
    persistence: store.persistence,
    get: (provider) => store.get(provider),
    set: () => undefined,
    delete: () => undefined
  };
}

async function removeSnapshotRoot(rootPath: string) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      await rm(rootPath, { recursive: true, force: true });
      return;
    } catch (error) {
      if (!isRetryableFilesystemError(error) || attempt === 7) {
        throw error;
      }
      await Bun.sleep(125 * (attempt + 1));
    }
  }
}

function isRetryableFilesystemError(error: unknown) {
  return error instanceof Error && "code" in error && ["EBUSY", "EPERM", "EACCES", "ENOTEMPTY"].includes(String(error.code));
}

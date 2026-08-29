import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { createHarnessTestTempPath } from "./test-support/test-temp-root";
import { withDoctorRepository } from "./doctor-repository";
import { createMemoryOnlyProviderCredentialStore } from "./provider-credential-store";
import { createWorkspaceRepository } from "./workspace-repository";

describe("doctor repository", () => {
  test("inspects a disposable database snapshot without changing the source", async () => {
    const dbPath = createHarnessTestTempPath("doctor-source", ".sqlite");
    const projectRoot = createHarnessTestTempPath("doctor-project");
    await mkdir(projectRoot, { recursive: true });
    const source = createWorkspaceRepository(dbPath, projectRoot, {
      durability: "test-fast",
      providerCredentialStore: createMemoryOnlyProviderCredentialStore()
    });
    source.addProject(projectRoot);
    source.close();
    const before = readFileSync(dbPath);

    const inspectedProjectCount = await withDoctorRepository(
      { repair: false, dbPath, defaultRootPath: projectRoot },
      async (repository) => {
        const workspace = repository.loadWorkspace();
        repository.setDebugEnabledDefault(true);
        return workspace.projects.length;
      }
    );

    expect(inspectedProjectCount).toBe(1);
    expect(readFileSync(dbPath)).toEqual(before);
  });

  test("does not create a missing database during read-only inspection", async () => {
    const dbPath = createHarnessTestTempPath("doctor-missing", ".sqlite");

    await withDoctorRepository({ repair: false, dbPath }, async (repository) => {
      expect(repository.loadWorkspace().projects).toEqual([]);
    });

    expect(existsSync(dbPath)).toBe(false);
  });
});

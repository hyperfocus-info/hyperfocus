import { afterEach, beforeEach } from "bun:test";
import type { HarnessServerOsAdapters } from "../../server";
import { createWorkspaceRepository, type WorkspaceRepository } from "../../workspace-repository";
import { createFakePiAgentAdapter, type FakePiAgentAdapter } from "../../test-support/fake-pi-agent-adapter";
import { useGitProjectFixture } from "../../test-support/git-project-fixture";
import {
  startServerForTest,
  stopServerForTest,
  type StartServerForTestInput
} from "./server-test-client";

type ServerSuiteFixtureOptions = {
  fixtureName: string;
  persistentDatabase?: boolean;
  useFastOsAdapters?: boolean;
};

export function useServerSuiteFixture(options: ServerSuiteFixtureOptions) {
  const projectFixture = useGitProjectFixture({
    fixtureName: options.fixtureName,
    packageName: "test-project",
    readmeTitle: "# Test Project\n",
    gitIgnore: ".local\nnode_modules\ndist\n"
  });
  let server: Awaited<ReturnType<typeof startServerForTest>>["server"] | undefined;
  const repositories = new Set<WorkspaceRepository>();
  let adapter: FakePiAgentAdapter;
  let repository: WorkspaceRepository;
  let dbPath = "";
  let extraProjectRoot = "";
  let projectRoot = "";
  let port = 0;

  beforeEach(async () => {
    projectRoot = await projectFixture.createRepoClone(`repo-${crypto.randomUUID()}`);
    extraProjectRoot = projectFixture.createTempDir(`project-${crypto.randomUUID()}`);
    dbPath = options.persistentDatabase
      ? projectFixture.createTempPath(`server-${crypto.randomUUID()}.sqlite`)
      : ":memory:";
    adapter = createFakePiAgentAdapter();
    repository = createWorkspaceRepository(dbPath, projectRoot, { durability: "test-fast" });
    repositories.add(repository);
    await restart();
  });

  afterEach(async () => {
    try {
      await stopServerForTest(server);
      server = undefined;
    } finally {
      for (const ownedRepository of repositories) ownedRepository.close();
      repositories.clear();
    }
  });

  async function restart(overrides: Partial<StartServerForTestInput> = {}) {
    await stopServerForTest(server);
    if (overrides.repository) repositories.add(overrides.repository);
    const started = await startServerForTest({
      port: 0,
      adapter,
      repository,
      pickFolder: async () => extraProjectRoot,
      serverOnly: true,
      useFastOsAdapters: options.useFastOsAdapters,
      ...overrides
    });
    server = started.server;
    port = started.port;
  }

  function restartWithCustomOsAdapters(osAdapters: Partial<HarnessServerOsAdapters>) {
    return restart({ osAdapters });
  }

  function restartWithRealOsAdapters() {
    return restart({ useFastOsAdapters: false });
  }

  return {
    get adapter() {
      return adapter;
    },
    get repository() {
      return repository;
    },
    get dbPath() {
      return dbPath;
    },
    get extraProjectRoot() {
      return extraProjectRoot;
    },
    get projectRoot() {
      return projectRoot;
    },
    get port() {
      return port;
    },
    createTempDir: projectFixture.createTempDir,
    restart,
    restartWithCustomOsAdapters,
    restartWithRealOsAdapters
  };
}

export type ServerSuiteFixture = ReturnType<typeof useServerSuiteFixture>;

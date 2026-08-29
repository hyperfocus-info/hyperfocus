import path from "node:path";
import type { ExperimentInspection, ExperimentRun } from "@hyperfocus/ai-core/protocol";
import type { BranchfsExperimentLease } from "../branchfs-manager";
import type { HarnessBranchfsManager, HarnessServerOsAdapters } from "../server";

export function createFastHarnessServerOsAdapters(): HarnessServerOsAdapters {
  return {
    async searchProjectFolders({ query, workspaceProjectPaths = [], platform = process.platform }) {
      const normalizedQuery = query.trim().toLowerCase();
      if (!normalizedQuery) {
        return [];
      }

      return workspaceProjectPaths
        .filter((rootPath) => {
          const comparable = platform === "win32" ? rootPath.toLowerCase() : rootPath;
          return comparable.includes(platform === "win32" ? normalizedQuery.toLowerCase() : normalizedQuery);
        })
        .slice(0, 8)
        .map((rootPath) => ({
          id: rootPath,
          name: path.basename(rootPath) || rootPath,
          rootPath,
          repoKind: "git-repo",
          matchKind: path.basename(rootPath).toLowerCase().startsWith(normalizedQuery) ? "name-prefix" : "substring"
        }));
    },
    async runGitPreflight() {
      return {
        status: "clean",
        changedFileCount: 0
      };
    },
    async runCorrectnessReview() {
      return {
        status: "pass",
        summary: "Correctness review passed. Fast test adapter skipped OS file scan.",
        gaps: []
      };
    },
    branchfsManagerFactory(context) {
      return createFastBranchfsManager(context.rootPath, context.runId);
    }
  };
}

function createFastBranchfsManager(rootPath: string, runId: string): HarnessBranchfsManager {
  function createExperiment(status: ExperimentRun["status"]): ExperimentRun {
    const now = new Date().toISOString();
    const mountPath = path.join(rootPath, ".local", "branchfs-fast", runId, "mount");
    return {
      id: `experiment-${runId}`,
      runId,
      status,
      virtualBranchName: `fast-${runId}`,
      repoMountPath: mountPath,
      projectMountPath: mountPath,
      baseDirtyFingerprint: "fast-clean",
      filesChanged: 0,
      insertions: 0,
      deletions: 0,
      createdAt: now,
      updatedAt: now
    };
  }

  async function prepareExperimentLease(): Promise<BranchfsExperimentLease> {
    const experiment = createExperiment("prepared");
    return {
      experiment,
      repoRoot: rootPath,
      projectRelativePath: "",
      repoMountPath: experiment.repoMountPath,
      projectMountPath: experiment.projectMountPath,
      baseProjectPath: rootPath,
      manifestPath: path.join(rootPath, ".local", "branchfs", runId, "meta", "manifest.json"),
      dirtySeedPath: path.join(rootPath, ".local", "branchfs", runId, "dirty-seed"),
      upperPath: path.join(rootPath, ".local", "branchfs", runId, "upper")
    };
  }

  async function readInspection(lease: BranchfsExperimentLease): Promise<ExperimentInspection> {
    return {
      experiment: lease.experiment,
      diffText: "",
      files: [],
      inspectedAt: new Date().toISOString(),
      filesChanged: 0,
      insertions: 0,
      deletions: 0,
      changedPaths: []
    };
  }

  async function flushExperiment(lease: BranchfsExperimentLease): Promise<ExperimentInspection> {
    return readInspection(lease);
  }

  return {
    prepareExperimentLease,
    readInspection,
    flushExperiment,
    async discardExperiment() {},
    async unmountExperiment() {},
  };
}

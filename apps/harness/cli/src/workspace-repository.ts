import path from "node:path";
import { createThreadCollaboration, installThreadCollaboration } from "./persistence/thread-collaboration";
import type { WorkspaceRepositoryContext, WorkspaceRepositoryOptions } from "./persistence/workspace-repository/contracts";
import { Database } from "bun:sqlite";
import { createProviderCredentialStore } from "./provider-credential-store";
import { createRunDetailSnapshotStore } from "./persistence/run-detail-pagination";
import { createWorkspaceAssistantReadsOperations, createWorkspaceAssistantReadsOperations2, createWorkspaceAssistantReadsOperations3, createWorkspaceAssistantReadsOperations4 } from "./persistence/workspace-repository/operations/assistant-reads";
import { createWorkspaceAssistantsOperations, createWorkspaceAssistantsOperations2, createWorkspaceAssistantsOperations3, createWorkspaceAssistantsOperations4, createWorkspaceAssistantsOperations5, createWorkspaceAssistantsOperations6, createWorkspaceAssistantsOperations7 } from "./persistence/workspace-repository/operations/assistants-1";
import { createWorkspaceAssistantsOperations8, createWorkspaceAssistantsOperations9, createWorkspaceAssistantsOperations10 } from "./persistence/workspace-repository/operations/assistants-2";
import { createWorkspaceBackgroundOperations, createWorkspaceBackgroundOperations2, createWorkspaceBackgroundOperations3, createWorkspaceBackgroundOperations4, createWorkspaceBackgroundOperations5, createWorkspaceBackgroundOperations6 } from "./persistence/workspace-repository/operations/background-1";
import { createWorkspaceBackgroundOperations7, createWorkspaceBackgroundOperations8, createWorkspaceBackgroundOperations9, createWorkspaceBackgroundOperations10 } from "./persistence/workspace-repository/operations/background-2";
import { createWorkspaceBackgroundReadsOperations, createWorkspaceBackgroundReadsOperations2, createWorkspaceBackgroundReadsOperations3 } from "./persistence/workspace-repository/operations/background-reads";
import { createWorkspaceLifecycleOperations, createWorkspaceLifecycleOperations2 } from "./persistence/workspace-repository/operations/lifecycle";
import { createWorkspaceMemoryOperations, createWorkspaceMemoryOperations2, createWorkspaceMemoryOperations3, createWorkspaceMemoryOperations4 } from "./persistence/workspace-repository/operations/memory";
import { createWorkspaceMigrationSupportOperations, createWorkspaceMigrationSupportOperations2, createWorkspaceMigrationSupportOperations4 } from "./persistence/workspace-repository/operations/migration-support";
import { createWorkspaceProjectReadsOperations, createWorkspaceProjectReadsOperations2, createWorkspaceProjectReadsOperations3 } from "./persistence/workspace-repository/operations/project-reads";
import { createWorkspaceProjectsOperations, createWorkspaceProjectsOperations2, createWorkspaceProjectsOperations3, createWorkspaceProjectsOperations4, createWorkspaceProjectsOperations5, createWorkspaceProjectsOperations6 } from "./persistence/workspace-repository/operations/projects";
import { createWorkspaceRepositoryReadsOperations, createWorkspaceRepositoryReadsOperations2, createWorkspaceRepositoryReadsOperations3, createWorkspaceRepositoryReadsOperations4 } from "./persistence/workspace-repository/operations/repository-reads";
import { createWorkspaceRunsOperations, createWorkspaceRunsOperations2, createWorkspaceRunsOperations3, createWorkspaceRunsOperations4, createWorkspaceRunsOperations5, createWorkspaceRunsOperations6, createWorkspaceRunsOperations7 } from "./persistence/workspace-repository/operations/runs-1";
import { createWorkspaceRunsOperations8, createWorkspaceRunsOperations9, createWorkspaceRunsOperations10 } from "./persistence/workspace-repository/operations/runs-2";
import { createWorkspaceSchemaOperations } from "./persistence/workspace-repository/operations/schema";
import { createWorkspaceSettingsOperations, createWorkspaceSettingsOperations2, createWorkspaceSettingsOperations3, createWorkspaceSettingsOperations4, createWorkspaceSettingsOperations5, createWorkspaceSettingsOperations6 } from "./persistence/workspace-repository/operations/settings";
import { installWorkspaceMutationTriggers } from "./persistence/workspace-pagination";
import { mkdirSync } from "node:fs";
import { normalizeAssistantLearningSource } from "./assistant-learning-policy";
import { reconcileTerminalBrowserApprovals } from "./persistence/run/terminal-run-transition";
import { resolveHarnessDbPath } from "./harness-paths";

export type { GeminiCachedContentRecord } from "./persistence/workspace-repository/contracts";
export type { PersistedTerminalState } from "./persistence/workspace-repository/contracts";
export type { RunDiagnosticsQueryReport } from "./persistence/workspace-repository/contracts";
export { normalizeProjectRootPath } from "./persistence/workspace-repository/models";
export { normalizeWindowsEscapedPath } from "./persistence/workspace-repository/models";
export type { AssistantQuestionAnswerWrite } from "./persistence/assistant-persistence";
export { normalizeAssistantLearningSource };

export function createWorkspaceRepository(
  databasePath?: string,
  defaultRootPath: string = process.cwd(),
  options: WorkspaceRepositoryOptions = {}
) {
  const runDetailSnapshots = createRunDetailSnapshotStore();
  const dbPath = databasePath ?? resolveHarnessDbPath();
  const repoRoot = defaultRootPath;
  const allowDevThreadRecovery = Bun.env.NODE_ENV !== "production";
  const providerCredentialStore = options.providerCredentialStore ?? createProviderCredentialStore(dbPath);
  const instrumentation = options.instrumentation;
  if (dbPath !== ":memory:") {
      mkdirSync(path.dirname(dbPath), { recursive: true });
    }
  const db = new Database(dbPath, { create: true, strict: true });
  const context: WorkspaceRepositoryContext = {
    runDetailSnapshots, dbPath, repoRoot, allowDevThreadRecovery, providerCredentialStore, instrumentation, db,
  };
  const workspaceOperations1 = createWorkspaceLifecycleOperations(context);
  const workspaceOperations2 = createWorkspaceProjectsOperations(context);
  const workspaceOperations3 = createWorkspaceRunsOperations(context);
  const workspaceOperations4 = createWorkspaceMemoryOperations(context);
  const workspaceOperations5 = createWorkspaceAssistantsOperations(context);
  const workspaceOperations6 = createWorkspaceBackgroundOperations(context);
  const workspaceOperations7 = createWorkspaceBackgroundOperations2(context);
  const workspaceOperations8 = createWorkspaceSettingsOperations(context);
  const workspaceOperations9 = createWorkspaceProjectReadsOperations(context);
  const workspaceOperations10 = createWorkspaceProjectsOperations2(context, { ...workspaceOperations9.operations });
  const workspaceOperations11 = createWorkspaceRunsOperations2(context, { ...workspaceOperations9.operations });
  const workspaceOperations12 = createWorkspaceMemoryOperations2(context, { ...workspaceOperations9.operations });
  const workspaceOperations13 = createWorkspaceAssistantReadsOperations(context);
  const workspaceOperations14 = createWorkspaceAssistantReadsOperations2(context, { ...workspaceOperations13.operations });
  const workspaceOperations15 = createWorkspaceAssistantsOperations2(context, { ...workspaceOperations13.operations, ...workspaceOperations14.operations });
  const workspaceOperations16 = createWorkspaceAssistantReadsOperations3(context, { ...workspaceOperations14.operations });
  const workspaceOperations17 = createWorkspaceAssistantsOperations3(context, { ...workspaceOperations15.operations, ...workspaceOperations16.operations });
  const workspaceOperations18 = createWorkspaceAssistantReadsOperations4(context, { ...workspaceOperations16.operations });
  const workspaceOperations19 = createWorkspaceRepositoryReadsOperations(context, { ...workspaceOperations9.operations });
  const workspaceOperations20 = createWorkspaceAssistantsOperations4(context, { ...workspaceOperations13.operations, ...workspaceOperations14.operations, ...workspaceOperations15.operations, ...workspaceOperations16.operations, ...workspaceOperations18.operations, ...workspaceOperations19.operations });
  const workspaceOperations21 = createWorkspaceAssistantsOperations5(context, { ...workspaceOperations15.operations, ...workspaceOperations18.operations, ...workspaceOperations19.operations, ...workspaceOperations20.operations });
  const workspaceOperations22 = createWorkspaceMigrationSupportOperations(context, { ...workspaceOperations19.operations });
  const workspaceOperations23 = createWorkspaceProjectsOperations3(context, { ...workspaceOperations19.operations, ...workspaceOperations22.operations });
  const workspaceOperations24 = createWorkspaceAssistantsOperations6(context, { ...workspaceOperations14.operations, ...workspaceOperations16.operations, ...workspaceOperations19.operations, ...workspaceOperations20.operations, ...workspaceOperations22.operations });
  const workspaceOperations25 = createWorkspaceAssistantsOperations7(context, { ...workspaceOperations13.operations, ...workspaceOperations14.operations, ...workspaceOperations15.operations, ...workspaceOperations16.operations, ...workspaceOperations18.operations, ...workspaceOperations19.operations, ...workspaceOperations20.operations, ...workspaceOperations21.operations, ...workspaceOperations22.operations, ...workspaceOperations24.operations });
  const workspaceOperations26 = createWorkspaceAssistantsOperations8(context, { ...workspaceOperations13.operations, ...workspaceOperations14.operations, ...workspaceOperations15.operations, ...workspaceOperations16.operations, ...workspaceOperations18.operations, ...workspaceOperations19.operations, ...workspaceOperations20.operations, ...workspaceOperations22.operations, ...workspaceOperations25.operations });
  const workspaceOperations27 = createWorkspaceBackgroundOperations3(context, { ...workspaceOperations22.operations });
  const workspaceOperations28 = createWorkspaceSettingsOperations2(context, { ...workspaceOperations22.operations });
  const workspaceOperations29 = createWorkspaceSettingsOperations3(context, { ...workspaceOperations22.operations });
  const workspaceOperations30 = createWorkspaceAssistantsOperations9(context, { ...workspaceOperations15.operations, ...workspaceOperations16.operations, ...workspaceOperations21.operations, ...workspaceOperations24.operations, ...workspaceOperations25.operations, ...workspaceOperations29.operations });
  const workspaceOperations31 = createWorkspaceSettingsOperations4(context, { ...workspaceOperations29.operations });
  const workspaceOperations32 = createWorkspaceProjectReadsOperations2(context, { ...workspaceOperations22.operations });
  const workspaceOperations33 = createWorkspaceSettingsOperations5(context, { ...workspaceOperations32.operations });
  const workspaceOperations34 = createWorkspaceRepositoryReadsOperations2(context, { ...workspaceOperations22.operations });
  const workspaceOperations35 = createWorkspaceMigrationSupportOperations2(context, { ...workspaceOperations22.operations });
  const workspaceOperations36 = createWorkspaceRepositoryReadsOperations3(context, { ...workspaceOperations35.operations });
  const workspaceOperations38 = createWorkspaceBackgroundReadsOperations(context, { ...workspaceOperations22.operations });
  const workspaceOperations39 = createWorkspaceAssistantsOperations10(context, { ...workspaceOperations9.operations, ...workspaceOperations15.operations, ...workspaceOperations16.operations, ...workspaceOperations19.operations, ...workspaceOperations21.operations, ...workspaceOperations24.operations, ...workspaceOperations38.operations });
  const workspaceOperations40 = createWorkspaceBackgroundOperations4(context, { ...workspaceOperations19.operations, ...workspaceOperations22.operations, ...workspaceOperations27.operations, ...workspaceOperations38.operations });
  const workspaceOperations41 = createWorkspaceLifecycleOperations2(context, { ...workspaceOperations15.operations, ...workspaceOperations16.operations, ...workspaceOperations20.operations, ...workspaceOperations25.operations, ...workspaceOperations40.operations });
  const workspaceOperations42 = createWorkspaceBackgroundOperations5(context, { ...workspaceOperations19.operations, ...workspaceOperations38.operations, ...workspaceOperations40.operations });
  const workspaceOperations43 = createWorkspaceBackgroundOperations6(context, { ...workspaceOperations38.operations, ...workspaceOperations40.operations });
  const workspaceOperations44 = createWorkspaceBackgroundOperations7(context, { ...workspaceOperations38.operations, ...workspaceOperations42.operations, ...workspaceOperations43.operations });
  const workspaceOperations45 = createWorkspaceBackgroundOperations8(context, { ...workspaceOperations40.operations, ...workspaceOperations43.operations, ...workspaceOperations44.operations });
  const workspaceOperations46 = createWorkspaceBackgroundReadsOperations2(context);
  const workspaceOperations47 = createWorkspaceRunsOperations3(context, { ...workspaceOperations19.operations, ...workspaceOperations46.operations });
  const workspaceOperations48 = createWorkspaceMemoryOperations3(context, { ...workspaceOperations46.operations });
  const workspaceOperations49 = createWorkspaceBackgroundOperations9(context, { ...workspaceOperations22.operations, ...workspaceOperations46.operations });
  const workspaceOperations50 = createWorkspaceRepositoryReadsOperations4(context, { ...workspaceOperations46.operations });
  const workspaceOperations51 = createWorkspaceRunsOperations4(context, { ...workspaceOperations9.operations, ...workspaceOperations19.operations, ...workspaceOperations50.operations });
  const workspaceOperations52 = createWorkspaceMemoryOperations4(context, { ...workspaceOperations9.operations, ...workspaceOperations19.operations, ...workspaceOperations50.operations, ...workspaceOperations51.operations });
  const workspaceOperations53 = createWorkspaceProjectReadsOperations3(context, { ...workspaceOperations9.operations, ...workspaceOperations19.operations, ...workspaceOperations36.operations, ...workspaceOperations50.operations });
  const workspaceOperations54 = createWorkspaceProjectsOperations4(context, { ...workspaceOperations9.operations, ...workspaceOperations19.operations, ...workspaceOperations22.operations, ...workspaceOperations32.operations, ...workspaceOperations34.operations, ...workspaceOperations53.operations });
  const workspaceOperations55 = createWorkspaceProjectsOperations5(context, { ...workspaceOperations9.operations, ...workspaceOperations19.operations, ...workspaceOperations22.operations, ...workspaceOperations53.operations, ...workspaceOperations54.operations });
  const workspaceOperations56 = createWorkspaceRunsOperations5(context, { ...workspaceOperations9.operations, ...workspaceOperations19.operations, ...workspaceOperations22.operations, ...workspaceOperations53.operations });
  const workspaceOperations57 = createWorkspaceRunsOperations6(context, { ...workspaceOperations53.operations });
  const workspaceOperations58 = createWorkspaceRunsOperations7(context, { ...workspaceOperations19.operations, ...workspaceOperations53.operations });
  const workspaceOperations59 = createWorkspaceRunsOperations8(context, { ...workspaceOperations53.operations, ...workspaceOperations58.operations });
  const workspaceOperations60 = createWorkspaceRunsOperations9(context, { ...workspaceOperations19.operations, ...workspaceOperations53.operations });
  const workspaceOperations61 = createWorkspaceProjectsOperations6(context, { ...workspaceOperations9.operations, ...workspaceOperations22.operations, ...workspaceOperations53.operations, ...workspaceOperations60.operations });
  const workspaceOperations62 = createWorkspaceBackgroundOperations10(context, { ...workspaceOperations43.operations, ...workspaceOperations44.operations, ...workspaceOperations45.operations, ...workspaceOperations52.operations, ...workspaceOperations58.operations });
  const workspaceOperations63 = createWorkspaceSettingsOperations6(context, { ...workspaceOperations9.operations, ...workspaceOperations19.operations, ...workspaceOperations22.operations, ...workspaceOperations53.operations, ...workspaceOperations54.operations });
  const workspaceOperations64 = createWorkspaceMigrationSupportOperations4(context, { ...workspaceOperations46.operations });
  const workspaceOperations66 = createWorkspaceBackgroundReadsOperations3(context, { ...workspaceOperations46.operations, ...workspaceOperations53.operations });
  const workspaceOperations67 = createWorkspaceRunsOperations10(context, { ...workspaceOperations66.operations });
  const workspaceOperations68 = createWorkspaceSchemaOperations(context, { ...workspaceOperations13.operations, ...workspaceOperations35.operations, ...workspaceOperations46.operations, ...workspaceOperations64.operations, ...workspaceOperations66.operations });
  try {
      db.exec("PRAGMA foreign_keys = ON;");
      if (options.durability === "test-fast") {
        db.exec("PRAGMA journal_mode = MEMORY;");
        db.exec("PRAGMA synchronous = OFF;");
        db.exec("PRAGMA temp_store = MEMORY;");
      } else {
        db.exec("PRAGMA journal_mode = WAL;");
      }
      db.exec("PRAGMA busy_timeout = 5000;");
      workspaceOperations68.operations.migrate();
      installThreadCollaboration(db);
      installWorkspaceMutationTriggers(db);
      reconcileTerminalBrowserApprovals(db);
      workspaceOperations22.operations.migrateLegacyProviderApiKeys();
    } catch (error) {
      db.close(false);
      throw error;
    }
  return {
    dbPath,
    ...createThreadCollaboration(db),
    ...workspaceOperations1.publicApi,
    ...workspaceOperations2.publicApi,
    ...workspaceOperations3.publicApi,
    ...workspaceOperations4.publicApi,
    ...workspaceOperations5.publicApi,
    ...workspaceOperations6.publicApi,
    ...workspaceOperations7.publicApi,
    ...workspaceOperations8.publicApi,
    ...workspaceOperations10.publicApi,
    ...workspaceOperations11.publicApi,
    ...workspaceOperations12.publicApi,
    ...workspaceOperations15.publicApi,
    ...workspaceOperations16.publicApi,
    ...workspaceOperations17.publicApi,
    ...workspaceOperations20.publicApi,
    ...workspaceOperations21.publicApi,
    ...workspaceOperations23.publicApi,
    ...workspaceOperations24.publicApi,
    ...workspaceOperations25.publicApi,
    ...workspaceOperations26.publicApi,
    ...workspaceOperations27.publicApi,
    ...workspaceOperations28.publicApi,
    ...workspaceOperations29.publicApi,
    ...workspaceOperations30.publicApi,
    ...workspaceOperations31.publicApi,
    ...workspaceOperations33.publicApi,
    ...workspaceOperations39.publicApi,
    ...workspaceOperations40.publicApi,
    ...workspaceOperations41.publicApi,
    ...workspaceOperations42.publicApi,
    ...workspaceOperations43.publicApi,
    ...workspaceOperations44.publicApi,
    ...workspaceOperations45.publicApi,
    ...workspaceOperations47.publicApi,
    ...workspaceOperations48.publicApi,
    ...workspaceOperations49.publicApi,
    ...workspaceOperations51.publicApi,
    ...workspaceOperations52.publicApi,
    ...workspaceOperations54.publicApi,
    ...workspaceOperations55.publicApi,
    ...workspaceOperations56.publicApi,
    ...workspaceOperations57.publicApi,
    ...workspaceOperations58.publicApi,
    ...workspaceOperations59.publicApi,
    ...workspaceOperations60.publicApi,
    ...workspaceOperations61.publicApi,
    ...workspaceOperations62.publicApi,
    ...workspaceOperations63.publicApi,
    ...workspaceOperations67.publicApi,
  };
}

export type WorkspaceRepository = ReturnType<typeof createWorkspaceRepository>;

import type { CliSessionManager } from "../../agent-runtimes/cli-session-manager";
import type { AgentRuntimeRegistry } from "../../agent-runtimes/runtime-registry";
import type { AssistantManager } from "../../assistant-manager";
import type { BackgroundJobScheduler } from "../../background-job-scheduler";
import type { BranchfsExecutionContext, BranchfsManager, ManagerCallbacks } from "../../branchfs-manager";
import type { openSystemBrowser } from "../../desktop-app";
import type { pickProjectFolder } from "../../folder-picker";
import type { runGitPreflight } from "../../git-preflight";
import type { PiAgentAdapter } from "../../pi-agent-adapter";
import type { searchProjectFolders } from "../../project-search-service";
import type { runCorrectnessReview } from "../execution/correctness-review";
import type { StartupTelemetrySink } from "../../startup-telemetry";
import type { TerminalSessionManager } from "../../terminal/terminal-session-manager";
import type { createUiAssetManager } from "../../ui-build";
import type { WorkspaceRepository } from "../../workspace-repository";
import type { WorkspaceRuntimeStore } from "../../workspace-runtime-store";
import type { SetupLaunchMode, SetupState, TokenUsageTotals, WorkspaceProjectState } from "@hyperfocus/ai-core/protocol";
import type { ClientLeaseController } from "@hyperfocus/desktop-runtime";
import type { createRouteHandler } from "uploadthing/server";
import type { TimerApi } from "../runtime/timer-api";

export type HarnessConnection = {
  clientId: string;
  connectionId?: string;
  clientKind: "browser" | "native";
  kind: "control" | "pty" | "terminal";
  encoding?: "protobuf" | "json";
  sessionId?: string;
  attachOwnerId?: string;
};

export type { TimerApi };

export type DevHmrDebouncePolicy = {
  scheduleMs: readonly number[];
};

export type HarnessBranchfsManager = Pick<
  BranchfsManager,
  "prepareExperimentLease" | "readInspection" | "flushExperiment" | "discardExperiment" | "unmountExperiment"
>;

export type HarnessServerOsAdapters = {
  searchProjectFolders: typeof searchProjectFolders;
  runGitPreflight: typeof runGitPreflight;
  runCorrectnessReview: typeof runCorrectnessReview;
  branchfsManagerFactory: (
    context: BranchfsExecutionContext,
    callbacks?: ManagerCallbacks
  ) => HarnessBranchfsManager;
};

export type HarnessServerOptions = {
  port: number;
  hostname?: string;
  adapter?: PiAgentAdapter;
  repository?: WorkspaceRepository;
  runtimeRegistry?: AgentRuntimeRegistry;
  osAdapters?: Partial<HarnessServerOsAdapters>;
  pickFolder?: typeof pickProjectFolder;
  serverOnly?: boolean;
  openBrowser?: boolean;
  desktopMode?: boolean;
  desktopIdleGraceMs?: number;
  launchMode?: SetupLaunchMode;
  startupTelemetry?: StartupTelemetrySink;
  uiAssetManagerFactory?: typeof createUiAssetManager;
  browserLauncher?: typeof openSystemBrowser;
  devHotMode?: boolean;
  hotSingletonVersion?: number;
  hotReloadDebounceMs?: number;
  backendHotReloadChangeDetector?: () => boolean;
  timerApi?: TimerApi;
  derivedProgressHeartbeatMs?: number;
  sessionToken?: string;
};

export type ProjectLike = Pick<WorkspaceProjectState, "id" | "rootPath" | "activeThreadId" | "session" | "activeRun" | "lastRun">;

export type PendingBrowserApproval = {
  resolve: (approved: boolean) => void;
  reject: (error: Error) => void;
};

export type BackgroundRunControl = {
  abortController: AbortController;
  controllerInstanceId: string;
  controllerLeaseId: string;
  renewTimer?: ReturnType<typeof setInterval>;
  settled: Promise<void>;
};

export type BunServeOptions = Parameters<typeof Bun.serve<HarnessConnection>>[0];

export type HarnessRoutes = NonNullable<BunServeOptions["routes"]>;

export type HarnessFetchHandler = NonNullable<BunServeOptions["fetch"]>;

export type HarnessWebSocketOptions = NonNullable<BunServeOptions["websocket"]>;

export type HarnessWebSocketOpenHandler = NonNullable<HarnessWebSocketOptions["open"]>;

export type HarnessWebSocketCloseHandler = NonNullable<HarnessWebSocketOptions["close"]>;

export type HarnessWebSocketMessageHandler = NonNullable<HarnessWebSocketOptions["message"]>;

export type UiServingState =
  | {
    mode: "server-only";
  }
  | {
    mode: "static-dist";
    uiAssets: ReturnType<typeof createUiAssetManager>;
    liveReload: "disabled" | "debounced-poll";
  };

export type UiLiveReloadMode = Extract<UiServingState, { mode: "static-dist" }>["liveReload"];

export type HarnessServerState = {
  adapter: PiAgentAdapter;
  runtimeRegistry: AgentRuntimeRegistry;
  repository: WorkspaceRepository;
  runtime: WorkspaceRuntimeStore;
  pickFolder: typeof pickProjectFolder;
  serverOnly: boolean;
  desktopMode: boolean;
  desktopClientLease?: ClientLeaseController;
  launchMode: SetupLaunchMode;
  pendingBrowserApprovals: Map<string, PendingBrowserApproval>;
  backgroundRunControllers: Map<string, BackgroundRunControl>;
  projectSearchControllers: Map<string, { requestId: string; abortController: AbortController }>;
  ideSearchControllers: Map<string, { requestId: string; abortController: AbortController }>;
  connections: Set<Bun.ServerWebSocket<HarnessConnection>>;
  uploadthingHandler: ReturnType<typeof createRouteHandler>;
  ui: UiServingState;
  currentSetupState: SetupState;
  assistantManager: AssistantManager;
  cliSessionManager: CliSessionManager;
  terminalSessionManager: TerminalSessionManager;
  scheduler: BackgroundJobScheduler;
  osAdapters: HarnessServerOsAdapters;
  tokenUsageSession: TokenUsageTotals;
  sessionToken: string;
};

export type HarnessHandlerRefs = {
  routes?: HarnessRoutes;
  fetch: HarnessFetchHandler;
  websocket: {
    open: HarnessWebSocketOpenHandler;
    close: HarnessWebSocketCloseHandler;
    message: HarnessWebSocketMessageHandler;
  };
};

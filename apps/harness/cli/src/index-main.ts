import path from "node:path";
import { createAgentRuntimeRegistry } from "./agent-runtimes/runtime-registry";
import { createCopilotCliRuntime } from "./agent-runtimes/copilot-cli-runtime";
import { createCodexCliRuntime } from "./agent-runtimes/codex-cli-runtime";
import { launchHarnessServerWithRecovery, type StartHarnessServerResult } from "./launch-harness";
import { createPiSdkAgentAdapter } from "./pi-agent-adapter";
import { createPiRuntime } from "./agent-runtimes/pi-runtime";
import { buildSetupState, detectSetupLaunchMode, formatSetupDoctorReport } from "./setup-health";
import { createStartupTelemetrySession } from "./startup-telemetry";
import { createCliUsageError, parseCliOptions } from "./cli-options";
import { ensureDependencyHealth } from "./dependency-health";
import { repairDoctorArtifacts } from "./doctor-cleanup";
import { syncBundledSkillsToGlobalRoot } from "./global-skills";
import { withDoctorRepository } from "./doctor-repository";
import {
  checkHarnessDesktopUpdate,
  DESKTOP_HOST,
  findRunningDesktopServer,
  getDesktopServerUrl,
  openSystemBrowser,
  registerDesktopProtocol,
  requestDesktopOpen,
  resolveDesktopTargetArgument,
  waitForRunningDesktopServer
} from "./desktop-app";

export const CLI_HELP = `Usage: pi-harness [--desktop] [--ide-url <ide://path>] [--server-only] [--open|--no-open] [--doctor [--json] [--repair]] [--help]

Options:
  --help         Print this help.
  --desktop      Run as the browser-backed desktop IDE and stop after its last tab closes.
  --ide-url      Open an ide:// file or folder target, reusing the desktop backend when available.
  --register-ide-protocol  Register this launcher as the current user's ide:// handler.
  --check-app-update  Opt into a one-time standalone release update check.
  --server-only Start websocket/backend server without opening browser.
  --open        Open browser after startup.
  --no-open     Do not open browser after startup.
  --doctor      Inspect setup health without changing local files, then exit.
  --repair      With --doctor, repair dependencies, remove dist, and trim oversized .local artifacts.
  --json        With --doctor, print machine-readable setup health.`;

export async function main() {
  const options = parseHarnessCliOptions(process.argv.slice(2));
  if (options.flags.has("--help")) {
    console.log(CLI_HELP);
    process.exit(0);
  }

  const rawPort = Bun.env.HARNESS_PORT?.trim();
  const configuredPort = rawPort ? Number(rawPort) : Number.NaN;
  const port = Number.isFinite(configuredPort) ? configuredPort : 8787;
  const serverOnly = options.flags.has("--server-only");
  const doctorOnly = options.flags.has("--doctor");
  const forceOpen = options.flags.has("--open");
  const disableOpen = options.flags.has("--no-open");
  const launchMode = detectSetupLaunchMode();
  const STARTUP_TELEMETRY_ENABLED = process.env.NODE_ENV !== "production";

  if (launchMode === "portable-launcher") {
    process.chdir(path.dirname(process.execPath));
  }
  if (options.flags.has("--register-ide-protocol")) {
    await registerDesktopProtocol({
      launcherArgs: launchMode === "portable-launcher" ? [] : [path.resolve(import.meta.dir, "index.ts")]
    });
    console.log("Registered ide:// for the current user.");
    process.exit(0);
  }
  if (doctorOnly) {
    const repair = options.flags.has("--repair");
    if (repair) {
      syncBundledSkillsToGlobalRoot();
    }
    const setup = await runDoctor({ json: options.flags.has("--json"), repair });
    process.exit(setup.readyRequiredCount === setup.totalRequiredCount ? 0 : 1);
  }

  syncBundledSkillsToGlobalRoot();

  const desktopMode = options.flags.has("--desktop") || options.flags.has("--ide-url");
  if (desktopMode) {
    await runDesktopLaunch({
      port,
      target: resolveDesktopTargetArgument(options.values.get("--ide-url")),
      checkForUpdate: options.flags.has("--check-app-update"),
      launchMode
    });
    return;
  }

  const startupTelemetry = STARTUP_TELEMETRY_ENABLED ? createStartupTelemetrySession({ serverOnly }) : undefined;
  startupTelemetry?.sessionStart("startup session created", {
    launchMode,
    port,
    serverOnly
  });

  try {
    await launchHarnessServerWithRecovery({
      port,
      serverOnly,
      openBrowser: forceOpen || (!serverOnly && !disableOpen),
      launchMode,
      allowPortFallback: !rawPort,
      startupTelemetry
    });
  } catch (error) {
    startupTelemetry?.failed(`Harness startup failed: ${describeError(error)}`, {
      launchMode,
      port,
      serverOnly
    });
    throw error;
  } finally {
    startupTelemetry?.dispose();
  }
}

export function parseHarnessCliOptions(argv: string[]) {
  const options = parseCliOptions(argv, {
    flags: [
      "--help",
      "--desktop",
      "--ide-url",
      "--register-ide-protocol",
      "--check-app-update",
      "--server-only",
      "--doctor",
      "--repair",
      "--json",
      "--open",
      "--no-open"
    ],
    valueFlags: ["--ide-url"],
    conflicts: [["--open", "--no-open"]]
  });
  if (options.flags.has("--json") && !options.flags.has("--doctor")) {
    throw createCliUsageError("--json requires --doctor");
  }
  if (options.flags.has("--repair") && !options.flags.has("--doctor")) {
    throw createCliUsageError("--repair requires --doctor");
  }

  return options;
}

async function runDesktopLaunch(input: {
  port: number;
  target?: string;
  checkForUpdate: boolean;
  launchMode: ReturnType<typeof detectSetupLaunchMode>;
}) {
  const expectedServerUrl = getDesktopServerUrl(input.port);
  const runningServerUrl = await findRunningDesktopServer(expectedServerUrl);
  if (runningServerUrl) {
    await openDesktopTab(runningServerUrl, input.target);
    await reportDesktopUpdate(input.checkForUpdate);
    return;
  }

  let server: StartHarnessServerResult;
  try {
    server = await launchHarnessServerWithRecovery({
      port: input.port,
      hostname: DESKTOP_HOST,
      serverOnly: false,
      openBrowser: false,
      desktopMode: true,
      launchMode: input.launchMode,
      allowPortFallback: false
    });
  } catch (error) {
    if (!isPortInUseError(error)) throw error;
    const winner = await waitForRunningDesktopServer({ serverUrl: expectedServerUrl });
    if (!winner) throw error;
    await openDesktopTab(winner, input.target);
    await reportDesktopUpdate(input.checkForUpdate);
    return;
  }
  if (server.port === undefined) {
    server.stop(true);
    throw new Error("Desktop IDE backend did not report a bound port");
  }
  const serverUrl = getDesktopServerUrl(server.port);
  try {
    await openDesktopTab(serverUrl, input.target);
    await reportDesktopUpdate(input.checkForUpdate);
  } catch (error) {
    server.stop(true);
    throw error;
  }
}

async function openDesktopTab(serverUrl: string, target: string | undefined) {
  const launch = await requestDesktopOpen({ serverUrl, target });
  await openSystemBrowser(launch.url);
}

function isPortInUseError(error: unknown) {
  return error instanceof Error && "code" in error && error.code === "EADDRINUSE";
}

async function reportDesktopUpdate(enabled: boolean) {
  if (!enabled) return;
  try {
    const result = await checkHarnessDesktopUpdate(true);
    if (result.status === "available") {
      console.log(`Hyperfocus ${result.latest.version} is available: ${result.latest.downloadUrl ?? result.latest.notesUrl ?? "open the release page"}`);
    }
  } catch (error) {
    console.warn(`Desktop update check skipped: ${describeError(error)}`);
  }
}

async function runDoctor(options: { json?: boolean; repair?: boolean } = {}) {
  if (options.repair) {
    const cleanup = await repairDoctorArtifacts();
    if (!cleanup.deleted) {
      const message = `Skipped doctor repair because ${cleanup.rootPath} does not look like the harness root.`;
      if (options.json) {
        console.error(message);
      } else {
        console.log(message);
      }
    }
    await ensureDependencyHealth({
      log: (message) => (options.json ? console.error(message) : console.log(message))
    });
  }

  return await withDoctorRepository({ repair: options.repair ?? false, dbPath: Bun.env.HARNESS_DB_PATH }, async (repository) => {
    const launchMode = detectSetupLaunchMode();
    const adapter = createPiSdkAgentAdapter();
    const storedOpenAiApiKey = repository.getStoredOpenAiApiKey();
    const storedGoogleApiKey = repository.getStoredGoogleApiKey();
    const storedAnthropicApiKey = repository.getStoredAnthropicApiKey();

    if (storedOpenAiApiKey) {
      adapter.setApiKey("openai", storedOpenAiApiKey);
    }

    if (storedGoogleApiKey) {
      adapter.setApiKey("google", storedGoogleApiKey);
    }

    if (storedAnthropicApiKey) {
      adapter.setApiKey("anthropic", storedAnthropicApiKey);
    }

    const runtimeRegistry = createAgentRuntimeRegistry([
      createPiRuntime(adapter),
      createCopilotCliRuntime(),
      createCodexCliRuntime()
    ]);
    await runtimeRegistry.refreshAll();

    const setup = await buildSetupState({
      workspace: repository.loadWorkspace(),
      preferences: {
      hasUsableApiKey: adapter.hasApiKey("openai") || adapter.hasApiKey("google") || adapter.hasApiKey("anthropic"),
      hasStoredApiKey: Boolean(storedOpenAiApiKey || storedGoogleApiKey || storedAnthropicApiKey),
      hasUsableOpenAiApiKey: adapter.hasApiKey("openai"),
      hasStoredOpenAiApiKey: Boolean(storedOpenAiApiKey),
      hasUsableGoogleApiKey: adapter.hasApiKey("google"),
      hasStoredGoogleApiKey: Boolean(storedGoogleApiKey),
      hasUsableAnthropicApiKey: adapter.hasApiKey("anthropic"),
      hasStoredAnthropicApiKey: Boolean(storedAnthropicApiKey),
      providerBrand: repository.getProviderBrand(),
      debugEnabledDefault: repository.getDebugEnabledDefault(),
      tracePanelDefaultOpen: repository.getTracePanelDefaultOpen(),
      subagentWorktreeStrategyDefault: repository.getSubagentWorktreeStrategyDefault(),
      blockChatOnDirtyGitDefault: repository.getBlockChatOnDirtyGitDefault(),
      dirtyGitChangeLimitDefault: repository.getDirtyGitChangeLimitDefault(),
      autoCompactContextThresholdPercentDefault: repository.getAutoCompactContextThresholdPercentDefault(),
      planExecutionModeDefault: repository.getPlanExecutionModeDefault(),
      planExecutionDelaySecondsDefault: repository.getPlanExecutionDelaySecondsDefault(),
      singleAgentModelPreferenceDefault: repository.getSingleAgentModelPreferenceDefault(),
      subagentModelPreferenceDefault: repository.getSubagentModelPreferenceDefault(),
      correctnessIterationModeDefault: repository.getCorrectnessIterationModeDefault(),
      backgroundJobApprovalPolicyDefault: repository.getBackgroundJobApprovalPolicyDefault(),
      assistantAutoApproveNonBlockingQuestionsDefault: repository.getAssistantAutoApproveNonBlockingQuestionsDefault(),
      maxBackgroundJobsDefault: repository.getMaxBackgroundJobsDefault(),
      memoryBankEnabledDefault: repository.getMemoryBankEnabledDefault(),
      memoryBankRecordRunsDefault: repository.getMemoryBankRecordRunsDefault(),
      checkCliUpdatesDefault: repository.getCheckCliUpdatesDefault(),
      attachmentsEnabled: Boolean(Bun.env.UPLOADTHING_TOKEN?.trim()),
      capabilities: [],
        agentRuntimes: runtimeRegistry.listCapabilities()
      },
      launchMode
    });

    if (options.json) {
      console.log(
        JSON.stringify({
          version: 1,
          launchMode,
          ready: setup.readyRequiredCount === setup.totalRequiredCount,
          readyRequiredCount: setup.readyRequiredCount,
          totalRequiredCount: setup.totalRequiredCount,
          checks: setup.checks
        })
      );
    } else {
      console.log(formatSetupDoctorReport(setup));
    }

    return setup;
  });
}

function describeError(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

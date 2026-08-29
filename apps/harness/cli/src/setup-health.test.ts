import { expect, test } from "bun:test";
import { buildSetupState, formatSetupDoctorReport } from "./setup-health";
import type { PreferencesState, WorkspaceState } from "@hyperfocus/ai-core/protocol";

const baseWorkspace: WorkspaceState = {
  projects: [],
  activeProjectId: undefined
};

const basePreferences: PreferencesState = {
  hasUsableApiKey: false,
  hasStoredApiKey: false,
  hasUsableOpenAiApiKey: false,
  hasStoredOpenAiApiKey: false,
  hasUsableGoogleApiKey: false,
  hasStoredGoogleApiKey: false,
  hasUsableAnthropicApiKey: false,
  hasStoredAnthropicApiKey: false,
  providerBrand: "gpt",
  debugEnabledDefault: false,
  tracePanelDefaultOpen: false,
  subagentWorktreeStrategyDefault: "same-worktree",
  blockChatOnDirtyGitDefault: false,
  dirtyGitChangeLimitDefault: 20,
  autoCompactContextThresholdPercentDefault: 80,
  planExecutionModeDefault: "countdown",
  planExecutionDelaySecondsDefault: 3,
  singleAgentModelPreferenceDefault: "intelligence",
  subagentModelPreferenceDefault: "inference",
  correctnessIterationModeDefault: "ask-before-iterate",
  backgroundJobApprovalPolicyDefault: "ask-risky",
  assistantAutoApproveNonBlockingQuestionsDefault: true,
  maxBackgroundJobsDefault: 10,
  memoryBankEnabledDefault: true,
  memoryBankRecordRunsDefault: true,
  checkCliUpdatesDefault: true,
  attachmentsEnabled: false,
  capabilities: [],
  agentRuntimes: []
};

test("buildSetupState surfaces Chromium install guidance instead of unsupported browser placeholder", async () => {
  const setup = await buildSetupState({
    workspace: baseWorkspace,
    preferences: basePreferences,
    probes: {
      hasGit: true,
      ripgrep: {
        ready: true,
        path: "C:\\rg\\rg.exe"
      },
      browserTools: {
        ready: false,
        playwrightPackageInstalled: true,
        chromiumInstalled: false,
        cachePath: "C:\\Users\\me\\AppData\\Local\\ms-playwright",
        installDependenciesCommand: "bun.cmd install",
        installChromiumCommand: "bun.cmd x playwright install chromium"
      }
    }
  });

  const browserCheck = setup.checks.find((check) => check.id === "browser-tools");
  expect(browserCheck).toBeDefined();
  expect(browserCheck?.status).toBe("warning");
  expect(browserCheck?.title).toBe("Install browser Chromium");
  expect(browserCheck?.primaryAction?.value).toBe("bun.cmd x playwright install chromium");
  expect(browserCheck?.secondaryAction?.kind).toBe("refresh-runtime-health");

  const report = formatSetupDoctorReport(setup);
  expect(report).toContain("Required now");
  expect(report).toContain("Optional capabilities");
  expect(report).toContain("[optional] Install browser Chromium");
  expect(report).toContain("action: Copy Chromium install | bun.cmd x playwright install chromium");
  expect(report.indexOf("[fix] Open a project")).toBeLessThan(report.indexOf("Optional capabilities"));
  expect(report.indexOf("[optional] Install browser Chromium")).toBeGreaterThan(report.indexOf("Optional capabilities"));

  const reportWithUnsupported = formatSetupDoctorReport({
    ...setup,
    checks: [
      ...setup.checks,
      {
        id: "future-capability",
        title: "Future capability",
        summary: "This platform cannot provide it yet.",
        status: "unsupported",
        requiredForFirstTask: false,
        updatedAt: new Date().toISOString()
      }
    ]
  });
  expect(reportWithUnsupported).toContain("Not yet supported");
  expect(reportWithUnsupported).toContain("[na] Future capability");
  expect(reportWithUnsupported.indexOf("Not yet supported")).toBeGreaterThan(reportWithUnsupported.indexOf("Optional capabilities"));
  expect(reportWithUnsupported.indexOf("[na] Future capability")).toBeGreaterThan(reportWithUnsupported.indexOf("Not yet supported"));
});

import { readdirSync } from "node:fs";
import path from "node:path";

export type TestSegment = {
  name: string;
  targets: string[];
  env?: Record<string, string>;
  serial?: boolean;
  isolateTargets?: boolean;
  browser?: boolean;
};

const integrationSensitiveCliTests = new Set([
  // These orchestration fixtures persist many fsynced artifact receipts. Running
  // them alongside other suites measures disk contention against test deadlines.
  normalizePath("apps/harness/cli/src/swarm/execution/integration.test.ts"),
  normalizePath("apps/harness/cli/src/swarm/execution/runner.test.ts"),
  normalizePath("apps/harness/cli/src/swarm/outcome/outcome.test.ts"),
  normalizePath("apps/harness/cli/src/swarm/outcome/repairs.test.ts"),
  normalizePath("apps/harness/cli/src/swarm/outcome/scheduling.test.ts"),
  normalizePath("apps/harness/cli/src/swarm/outcome/deadline.test.ts"),
  normalizePath("apps/harness/cli/src/server-tests/thread-collaboration.test.ts"),
  normalizePath("apps/harness/cli/src/agent-runtimes/cli-session-manager.test.ts"),
  normalizePath("apps/harness/cli/src/background-job-executor.test.ts"),
  normalizePath("apps/harness/cli/src/background-job-scheduler.test.ts"),
  normalizePath("apps/harness/cli/src/branchfs-cleanup.test.ts"),
  normalizePath("apps/harness/cli/src/branchfs-manager.test.ts"),
  normalizePath("apps/harness/cli/src/branchfs-subagent-integration.test.ts"),
  normalizePath("apps/harness/cli/src/git-context.test.ts"),
  normalizePath("apps/harness/cli/src/git-preflight.test.ts"),
  normalizePath("apps/harness/cli/src/launch-harness.test.ts"),
  normalizePath("apps/harness/cli/src/orchestration-tests/pi-orchestrator.test.ts"),
  normalizePath("apps/harness/cli/src/server-tests/assistant-chat-actions.test.ts"),
  normalizePath("apps/harness/cli/src/server-tests/background-run-notifications.test.ts"),
  normalizePath("apps/harness/cli/src/server-tests/browser-approvals.test.ts"),
  normalizePath("apps/harness/cli/src/server-tests/correctness/correctness.test.ts"),
  normalizePath("apps/harness/cli/src/server-tests/execution/execution-main.test.ts"),
  normalizePath("apps/harness/cli/src/server-tests/execution/execution-main-1.test.ts"),
  normalizePath("apps/harness/cli/src/server-tests/preferences/preferences-and-modes.test.ts"),
  normalizePath("apps/harness/cli/src/server-tests/preferences/preferences-and-modes-1.test.ts"),
  normalizePath("apps/harness/cli/src/server-tests/preferences/preferences-and-modes-2.test.ts"),
  normalizePath("apps/harness/cli/src/server-tests/preferences/preferences-and-modes-3.test.ts"),
  normalizePath("apps/harness/cli/src/server-tests/projects/projects-and-history.test.ts"),
  normalizePath("apps/harness/cli/src/server-tests/projects/projects-and-history-1.test.ts"),
  normalizePath("apps/harness/cli/src/server-tests/projects/projects-and-history-2.test.ts"),
  normalizePath("apps/harness/cli/src/server-tests/projects/projects-and-history-3.test.ts"),
  normalizePath("apps/harness/cli/src/server-tests/startup/startup.test.ts"),
  normalizePath("apps/harness/cli/src/server-tests/startup/startup-1.test.ts"),
  normalizePath("apps/harness/cli/src/server-tests/subagents/subagents.test.ts"),
  normalizePath("apps/harness/cli/src/server-tests/subagents/subagents-1.test.ts"),
  normalizePath("apps/harness/cli/src/server-tests/runtime-budget.test.ts"),
  normalizePath("apps/harness/cli/src/server-tests/quality-trace.test.ts"),
  normalizePath("apps/harness/cli/src/terminal/terminal-session-manager.test.ts"),
  normalizePath("apps/harness/cli/src/terminal/terminal-ws-mock-client.test.ts"),
  normalizePath("apps/harness/cli/src/test-support/git-project-fixture.test.ts"),
  normalizePath("apps/harness/cli/src/server-tests/support/server-test-harness.test.ts"),
  normalizePath("apps/harness/cli/src/ui-build.test.ts")
]);

export function shouldUseDefaultTestSegments(forwardedArgs: string[]) {
  return forwardedArgs.length === 0;
}

export function buildDefaultTestSegments(repoRoot: string): TestSegment[] {
  const cliTests = listTestFiles(path.join(repoRoot, "apps", "harness", "cli", "src"))
    .map((filePath) => normalizePath(path.relative(repoRoot, filePath)))
    .sort();
  const coreCliTests = cliTests.filter((filePath) => !integrationSensitiveCliTests.has(filePath));
  const integrationCliTests = cliTests.filter((filePath) => integrationSensitiveCliTests.has(filePath));
  const uiTests = listTestFiles(path.join(repoRoot, "apps", "harness", "ui", "src"))
    .map((filePath) => normalizePath(path.relative(repoRoot, filePath))).sort();
  // Bun module replacements outlive mock.restore; foreign renderer constructors
  // must not replace real modules for another UI suite in the same process.
  const isolatedUiTests = uiTests.filter(filePath => filePath === "apps/harness/ui/src/terminal/renderers/xterm-renderer.test.tsx");

  const segments: TestSegment[] = [
    {
      name: "core",
      targets: [
        normalizePath("apps/harness/scripts"),
        ...coreCliTests
      ],
      env: {
        HARNESS_TEST_SKIP_UI_PRELOAD: "1"
      }
    },
    {
      name: "integration",
      targets: integrationCliTests,
      env: {
        HARNESS_TEST_SKIP_UI_PRELOAD: "1"
      },
      serial: true,
      isolateTargets: true
    },
    {
      name: "ui",
      targets: uiTests.filter(filePath => !isolatedUiTests.some(isolated => isolated === filePath)),
      browser: true,
      serial: true
    },
    {
      name: "ui-foreign-adapters",
      targets: isolatedUiTests,
      browser: true,
      serial: true,
      isolateTargets: true
    }
  ];
  // Bun treats bare paths as repository-wide filters and retains scanned directory
  // handles on Windows. Explicit paths constrain discovery to each owned surface.
  return segments.map((segment) => ({ ...segment, targets: segment.targets.map((target) => `./${target}`) }));
}

function listTestFiles(directory: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...listTestFiles(entryPath));
      continue;
    }
    if (/\.test\.tsx?$/.test(entry.name)) {
      files.push(entryPath);
    }
  }
  return files;
}

function normalizePath(filePath: string) {
  return filePath.replaceAll("\\", "/");
}

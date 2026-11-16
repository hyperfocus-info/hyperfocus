import { spawnBackgroundProcess } from "@hyperfocus/desktop-runtime/process";
import { errorMessage } from "@hyperfocus/utilities/text";
import path from "node:path";
import {
buildBunTestPlan,
createHarnessTestRunRoot,
removeHarnessTestRunRoot,
stripFlag
} from "./testing/test-runner";
import { buildDefaultTestSegments,shouldUseDefaultTestSegments,type TestSegment } from "./testing/test-segments";

const repoRoot = path.resolve(import.meta.dir, "../../..");
const forwardedArgs = process.argv.slice(2);
const plan = buildBunTestPlan(forwardedArgs, process.env);

let exitCode = 0;
const testRunRoot = await createHarnessTestRunRoot();

try {
  if (shouldUseDefaultTestSegments(forwardedArgs)) {
    for (const segment of buildDefaultTestSegments(repoRoot)) {
      console.log(`[test] ${segment.name}`);
      const segmentStart = performance.now();
      const targetGroups = segment.isolateTargets ? segment.targets.map((target) => [target]) : [segment.targets];
      let segmentExitCode = 0;
      for (const targets of targetGroups) {
        const testProcess = spawnBackgroundProcess({
          cmd: [process.execPath, ...buildSegmentBunArgs(plan.bunArgs, segment), ...targets],
          cwd: repoRoot,
          env: { ...process.env, HARNESS_TEST_TMP_ROOT: testRunRoot, ...segment.env },
          stdin: "inherit",
          stdout: "inherit",
          stderr: "inherit"
        });
        const targetExitCode = await testProcess.exited;
        if (targetExitCode !== 0) {
          segmentExitCode = targetExitCode;
        }
      }
      console.log(`[test] ${segment.name} completed in ${Math.round(performance.now() - segmentStart)}ms`);
      if (segmentExitCode !== 0) {
        exitCode = segmentExitCode;
      }
    }
  } else {
    const testProcess = spawnBackgroundProcess({
      cmd: [process.execPath, ...plan.bunArgs],
      cwd: repoRoot,
      env: { ...process.env, HARNESS_TEST_TMP_ROOT: testRunRoot },
      stdin: "inherit",
      stdout: "inherit",
      stderr: "inherit"
    });
    exitCode = await testProcess.exited;
  }
} finally {
  try {
    await removeHarnessTestRunRoot(testRunRoot);
  } catch (error) {
    console.error(`[test] failed to remove run-owned temp root ${testRunRoot}: ${errorMessage(error, { stringify: true })}`);
    exitCode = exitCode || 1;
  }
}

process.exitCode = exitCode;

function buildSegmentBunArgs(bunArgs: string[], segment: TestSegment) {
  const args = segment.browser ? [...bunArgs, "--conditions", "browser"] : bunArgs;
  if (!segment.serial) {
    return args;
  }
  return stripFlag(stripFlag(args, "--parallel"), "--parallel-delay");
}

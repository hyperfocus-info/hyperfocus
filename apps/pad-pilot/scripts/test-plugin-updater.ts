import { runNativeTestTarget } from "./native-test-runner";

try {
  runNativeTestTarget("padpilot-updater-tests");
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}

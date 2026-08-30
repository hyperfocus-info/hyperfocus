import { runNativeTestTargets } from "./native-test-runner";

try {
  runNativeTestTargets(["padpilot-native-tests", "padpilot-processor-tests"]);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}

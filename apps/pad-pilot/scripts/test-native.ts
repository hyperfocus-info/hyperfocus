import path from "node:path";
import {
  processDeadlines,
  runCheckedProcess,
} from "./process-runner";

const nativeTests = [
  "./scripts/test-plugin-native.ts",
  "./scripts/test-plugin-updater.ts",
];

for (const script of nativeTests) {
  runCheckedProcess([process.execPath, "run", script], {
    cwd: path.resolve(import.meta.dir, ".."),
    label: `${script} native test script`,
    timeoutMs: processDeadlines.cmakeBuild + processDeadlines.cmakeConfigure + processDeadlines.nativeTest,
  });
}

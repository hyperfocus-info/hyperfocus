import path from "node:path";
import { spawnSyncWithDeadline } from "./process-runner";

const repositoryRoot = path.resolve(import.meta.dir, "..");
const testFiles: string[] = [];

for (const pattern of ["ui/src/**/*.test.ts", "ui/src/**/*.test.tsx"]) {
  const glob = new Bun.Glob(pattern);
  for await (const path of glob.scan({ cwd: repositoryRoot, onlyFiles: true })) {
    testFiles.push(`./${path.replaceAll("\\", "/")}`);
  }
}

testFiles.sort((left, right) => left.localeCompare(right));
if (testFiles.length === 0) {
  console.error("No UI test files found.");
  process.exit(1);
}

const decoder = new TextDecoder();
let passedTests = 0;

for (const [index, testFile] of testFiles.entries()) {
  const result = spawnSyncWithDeadline(
    [
      process.execPath,
      "test",
      "--conditions",
      "browser",
      "--preload",
      "./ui/src/test-setup.ts",
      testFile,
    ],
    {
      cwd: repositoryRoot,
      label: `${testFile} UI test`,
      maxBuffer: 16 * 1024 * 1024,
      stderr: "pipe",
      stdin: "ignore",
      stdout: "pipe",
      timeoutMs: 120_000,
    },
  );
  const output = `${decoder.decode(result.stdout)}\n${decoder.decode(result.stderr)}`;
  if (result.exitCode !== 0) {
    console.error(`UI test file failed (${index + 1}/${testFiles.length}): ${testFile}`);
    console.error(output.trim());
    process.exit(result.exitCode ?? 1);
  }
  passedTests += output.match(/\(pass\)/g)?.length ?? 0;
}

console.log(`UI tests passed: ${passedTests} tests across ${testFiles.length} isolated files.`);

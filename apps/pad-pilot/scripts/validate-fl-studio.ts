import { randomUUID } from "node:crypto";
import { lstat, mkdir } from "node:fs/promises";
import path from "node:path";

import {
  buildFlStudioProcessCheckCommand,
  buildFlStudioRenderCommand,
  createFlStudioReferenceWaveBytes,
  decodeAudioData,
  evaluateFlStudioCrossVersion,
  evaluateFlStudioHostRender,
  fixturePaths,
  flStudioTargetDefaults,
  type FlStudioTargetId,
  parseFlStudioValidationArguments,
} from "./fl-studio-validation";
import { runCheckedProcess } from "./process-runner";
import { writeFlStudioValidationPresets } from "./generate-fl-studio-validation-presets";
import { waitForProcessWithDeadline } from "@hyperfocus/pad-pilot/subprocess";
import { readBoundedFileBytes } from "@hyperfocus/pad-pilot/bounded-file";

const executableMaximumBytes = 500 * 1024 * 1024;
const fixtureMaximumBytes = 256 * 1024 * 1024;
const renderMaximumBytes = 512 * 1024 * 1024;
const renderDeadlineMs = 15 * 60_000;

type ResolvedTarget = {
  executable: string;
  id: FlStudioTargetId;
  version: string;
};

function selectedTargetIds(only: "all" | FlStudioTargetId) {
  return only === "all" ? ["fl26", "fl21"] as const : [only];
}

function sha256Bytes(bytes: Uint8Array) {
  return new Bun.CryptoHasher("sha256").update(bytes).digest("hex");
}

async function requireRegularFile(filePath: string, maximumBytes: number, label: string) {
  const fileStat = await lstat(filePath);
  if (!fileStat.isFile() || fileStat.isSymbolicLink()) {
    throw new Error(`${label} must be a regular file: ${filePath}`);
  }
  if (fileStat.size <= 0 || fileStat.size > maximumBytes) {
    throw new Error(`${label} is empty or exceeds ${maximumBytes} bytes: ${filePath}`);
  }
}

function readPipedOutput(result: ReturnType<typeof runCheckedProcess>, label: string) {
  if (!result.stdout) throw new Error(`${label} returned no output.`);
  return result.stdout.toString().trim();
}

async function resolveTarget(id: FlStudioTargetId, executableOverride: string) {
  const executable = path.resolve(executableOverride || flStudioTargetDefaults[id]);
  await requireRegularFile(executable, executableMaximumBytes, `${id} executable`);
  const versionResult = runCheckedProcess(
    [
      "powershell.exe",
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      "(Get-Item -LiteralPath $env:PADPILOT_FL_EXECUTABLE).VersionInfo.FileVersion",
    ],
    {
      cwd: path.dirname(executable),
      env: { ...process.env, PADPILOT_FL_EXECUTABLE: executable },
      label: `${id} version discovery`,
      stdout: "pipe",
      timeoutMs: 10_000,
    },
  );
  const version = readPipedOutput(versionResult, `${id} version discovery`);
  const expectedMajor = id === "fl21" ? "21." : "26.";
  if (!version.startsWith(expectedMajor)) {
    throw new Error(`${id} executable reports unexpected version ${version}: ${executable}`);
  }
  return Object.freeze({ executable, id, version }) satisfies ResolvedTarget;
}

function ensureNoRunningFlStudio() {
  const result = runCheckedProcess(
    buildFlStudioProcessCheckCommand(),
    {
      cwd: process.cwd(),
      label: "FL Studio process check",
      stdout: "pipe",
      timeoutMs: 10_000,
    },
  );
  if (readPipedOutput(result, "FL Studio process check")) {
    throw new Error("FL Studio is already running. Close every FL64.exe process before validation.");
  }
}

async function prepareReferenceWave(projectRoot: string, fixtureDirectory: string) {
  const relativeFixtureDirectory = path.relative(projectRoot, fixtureDirectory);
  if (relativeFixtureDirectory.startsWith("..") || path.isAbsolute(relativeFixtureDirectory)) {
    throw new Error("Reference preparation must stay inside the PadPilot repository.");
  }
  await mkdir(fixtureDirectory, { recursive: true });
  const referencePath = fixturePaths(fixtureDirectory, "fl26").reference;
  const expectedBytes = createFlStudioReferenceWaveBytes();
  const expectedHash = sha256Bytes(expectedBytes);
  if (await Bun.file(referencePath).exists()) {
    const existingBytes = await readBoundedFileBytes(referencePath, 2 * 1024 * 1024, "FL Studio reference WAV");
    const existingHash = sha256Bytes(existingBytes);
    if (existingHash !== expectedHash) {
      throw new Error(`FL Studio reference WAV differs from deterministic contract: ${referencePath}`);
    }
  } else {
    await Bun.write(referencePath, expectedBytes);
  }
  const presets = await writeFlStudioValidationPresets(fixtureDirectory);
  console.log(`FL Studio reference ready: ${referencePath}`);
  console.log(`SHA-256: ${expectedHash}`);
  console.log(`FL Studio preset states ready: ${presets.map((preset) => `${preset.id}.preset-code.txt`).join(", ")}`);
  return referencePath;
}

async function probeTarget(target: ResolvedTarget, fixtureDirectory: string) {
  const fixtures = fixturePaths(fixtureDirectory, target.id);
  return Object.freeze({
    executable: target.executable,
    fixtures: {
      controls: await Bun.file(fixtures.controls).exists(),
      unity: await Bun.file(fixtures.unity).exists(),
    },
    id: target.id,
    version: target.version,
  });
}

async function renderFixture(target: ResolvedTarget, fixture: string, outputWave: string) {
  ensureNoRunningFlStudio();
  await requireRegularFile(fixture, fixtureMaximumBytes, `${target.id} fixture`);
  if (await Bun.file(outputWave).exists()) {
    throw new Error(`Refusing to overwrite FL Studio render: ${outputWave}`);
  }
  const command = buildFlStudioRenderCommand(target.executable, fixture, outputWave);
  console.log(`${target.id} render: ${path.basename(fixture)}`);
  const subprocess = Bun.spawn(command, {
    cwd: path.dirname(fixture),
    env: { ...process.env },
    stderr: "inherit",
    stdin: "ignore",
    stdout: "inherit",
  });
  const exitCode = await waitForProcessWithDeadline(
    subprocess,
    renderDeadlineMs,
    `${target.id} ${path.basename(fixture)} render`,
  );
  if (exitCode !== 0) {
    throw new Error(`${target.id} render failed with exit ${exitCode}: ${fixture}`);
  }
  await requireRegularFile(outputWave, renderMaximumBytes, `${target.id} render`);
  return decodeAudioData(await readBoundedFileBytes(outputWave, renderMaximumBytes, `${target.id} render`));
}

async function validateTarget(
  target: ResolvedTarget,
  fixtureDirectory: string,
  outputDirectory: string,
  reference: Awaited<ReturnType<typeof decodeAudioData>>,
) {
  const fixtures = fixturePaths(fixtureDirectory, target.id);
  const unityOutput = path.join(outputDirectory, `${target.id}-unity.wav`);
  const controlsOutput = path.join(outputDirectory, `${target.id}-controls.wav`);
  const unity = await renderFixture(target, fixtures.unity, unityOutput);
  const controls = await renderFixture(target, fixtures.controls, controlsOutput);
  const evaluation = evaluateFlStudioHostRender(reference, { controls, unity });
  return Object.freeze({
    evaluation,
    executable: target.executable,
    outputs: { controls: controlsOutput, unity: unityOutput },
    version: target.version,
  });
}

async function main() {
  if (process.platform !== "win32") {
    throw new Error("FL Studio validation currently supports Windows only.");
  }
  const projectRoot = path.resolve(import.meta.dir, "..");
  const options = parseFlStudioValidationArguments(Bun.argv.slice(2));
  const fixtureDirectory = path.resolve(
    options.fixtureDirectory || path.join(projectRoot, "validation", "fl-studio"),
  );
  const outputRoot = path.resolve(
    options.outputDirectory || path.join(projectRoot, "build", "fl-studio-validation"),
  );
  if (options.action === "prepare") {
    await prepareReferenceWave(projectRoot, fixtureDirectory);
  }

  const targetOverrides = {
    fl21: options.fl21Executable,
    fl26: options.fl26Executable,
  };
  const targets: ResolvedTarget[] = [];
  for (const id of selectedTargetIds(options.only)) {
    targets.push(await resolveTarget(id, targetOverrides[id]));
  }
  const probes = await Promise.all(targets.map((target) => probeTarget(target, fixtureDirectory)));
  console.log(JSON.stringify({ fixtureDirectory, targets: probes }, null, 2));
  if (options.action !== "validate") return;

  const missingFixtures = probes.flatMap((probe) => {
    const paths = fixturePaths(fixtureDirectory, probe.id);
    return [
      ...(!probe.fixtures.unity ? [paths.unity] : []),
      ...(!probe.fixtures.controls ? [paths.controls] : []),
    ];
  });
  if (missingFixtures.length > 0) {
    throw new Error(
      `Missing FL Studio fixtures:\n${missingFixtures.join("\n")}\nSee validation/fl-studio/fixture-instructions.md.`,
    );
  }

  const referencePath = fixturePaths(fixtureDirectory, "fl26").reference;
  await requireRegularFile(referencePath, 2 * 1024 * 1024, "FL Studio reference WAV");
  const expectedReferenceHash = sha256Bytes(createFlStudioReferenceWaveBytes());
  const referenceBytes = await readBoundedFileBytes(referencePath, 2 * 1024 * 1024, "FL Studio reference WAV");
  if (sha256Bytes(referenceBytes) !== expectedReferenceHash) {
    throw new Error(`FL Studio reference WAV checksum mismatch: ${referencePath}`);
  }
  const reference = await decodeAudioData(referenceBytes);
  await mkdir(outputRoot, { recursive: true });
  const runDirectory = path.join(
    outputRoot,
    `run-${new Date().toISOString().replaceAll(":", "-")}-${randomUUID()}`,
  );
  await mkdir(runDirectory);

  const results = new Map<FlStudioTargetId, Awaited<ReturnType<typeof validateTarget>>>();
  for (const target of targets) {
    results.set(target.id, await validateTarget(target, fixtureDirectory, runDirectory, reference));
  }
  const fl21 = results.get("fl21");
  const fl26 = results.get("fl26");
  const crossVersion = fl21 && fl26
    ? evaluateFlStudioCrossVersion(fl21.evaluation, fl26.evaluation)
    : null;
  const report = {
    crossVersion,
    finishedAt: new Date().toISOString(),
    reference: { path: referencePath, sha256: expectedReferenceHash },
    results: Object.fromEntries(results),
    schemaVersion: 1,
  };
  const reportPath = path.join(runDirectory, "report.json");
  await Bun.write(reportPath, `${JSON.stringify(report, null, 2)}\n`);

  const failures = [
    ...[...results].flatMap(([id, result]) => result.evaluation.failures.map((failure) => `${id}: ${failure}`)),
    ...(crossVersion?.failures ?? []),
  ];
  if (failures.length > 0) {
    throw new Error(`FL Studio validation failed:\n${failures.join("\n")}\nReport: ${reportPath}`);
  }
  console.log(`FL Studio validation passed: ${reportPath}`);
}

if (import.meta.main) {
  try {
    await main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}

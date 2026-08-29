export {
  terminateAndReapProcess,
  waitForProcessWithDeadline,
} from "@hyperfocus/pad-pilot/subprocess";

type ProcessOutput = "ignore" | "inherit" | "pipe";

type ProcessDeadlineOptions = {
  cwd: string;
  env?: Record<string, string | undefined>;
  label: string;
  maxBuffer?: number;
  stderr?: ProcessOutput;
  stdin?: ProcessOutput;
  stdout?: ProcessOutput;
  timeoutMs: number;
};

export const processDeadlines = {
  archive: 5 * 60_000,
  cmakeBuild: 30 * 60_000,
  cmakeConfigure: 10 * 60_000,
  nativeTest: 5 * 60_000,
  protoc: 2 * 60_000,
  script: 10 * 60_000,
} as const;

export function cmakeEnvironment() {
  const environment = { ...process.env };
  delete environment.CMAKE_GENERATOR;
  delete environment.CMAKE_GENERATOR_INSTANCE;
  delete environment.CMAKE_GENERATOR_PLATFORM;
  delete environment.CMAKE_GENERATOR_TOOLSET;
  return environment;
}

export function resolveCmakePath() {
  return process.env.PADPILOT_CMAKE ??
    "C:/Program Files/Microsoft Visual Studio/2022/Community/Common7/IDE/CommonExtensions/Microsoft/CMake/CMake/bin/cmake.exe";
}

export function spawnSyncWithDeadline(command: string[], options: ProcessDeadlineOptions) {
  if (command.length === 0 || !command[0]) {
    throw new Error("Process command must not be empty.");
  }
  if (!Number.isSafeInteger(options.timeoutMs) || options.timeoutMs <= 0) {
    throw new Error("Process deadline must be a positive integer.");
  }
  return Bun.spawnSync(command, {
    cwd: options.cwd,
    env: options.env,
    killSignal: "SIGKILL",
    maxBuffer: options.maxBuffer,
    stderr: options.stderr ?? "inherit",
    stdin: options.stdin ?? "ignore",
    stdout: options.stdout ?? "inherit",
    timeout: options.timeoutMs,
  });
}

export function runCheckedProcess(command: string[], options: ProcessDeadlineOptions) {
  const result = spawnSyncWithDeadline(command, options);
  if (result.exitCode !== 0) {
    const outcome = result.signalCode
      ? `signal ${result.signalCode}`
      : `exit ${result.exitCode}`;
    throw new Error(`${options.label} failed (${outcome}; deadline ${options.timeoutMs} ms).`);
  }
  return result;
}

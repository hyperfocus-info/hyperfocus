import { spawnBackgroundProcess, terminateProcessTree } from "@hyperfocus/desktop-runtime/process";
import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { profiles, type ShippingProfile, type ShippingStep, type ShippingTarget } from "./profiles";

type StepResult = ShippingStep & {
  command: string;
  status: "planned" | "passed" | "failed" | "skipped";
  exitCode: number | null;
  durationMs: number;
  error: string | null;
};

export async function validateProfile({ root, profile }: { root: string; profile: ShippingProfile }) {
  for (const document of profile.documents) {
    if (!(await stat(resolve(root, document))).isFile()) throw new Error(`Missing shipping document: ${document}`);
  }
  for (const step of profile.steps) {
    const file = resolve(root, step.directory, "package.json");
    const manifest: unknown = JSON.parse(await readFile(file, "utf8"));
    const command = isRecord(manifest) && isRecord(manifest.scripts) ? manifest.scripts[step.script] : undefined;
    if (typeof command !== "string" || !command.trim()) {
      throw new Error(`Missing script ${step.script} in ${file}`);
    }
  }
}

export async function runShippingProcess({ root, step }: { root: string; step: ShippingStep }) {
  const child = spawnBackgroundProcess({
    cmd: [process.execPath, "run", step.script],
    cwd: resolve(root, step.directory),
    stdin: "ignore",
    // Both child streams go to stderr so --json stdout remains a single document.
    stdout: 2,
    stderr: 2,
    timeout: 5400000,
  });
  try {
    return await child.exited;
  } finally {
    await terminateProcessTree({ process: child });
  }
}

export async function runShippingCheck({ root, target, plan = false, platform = process.platform, run = (step) => runShippingProcess({ root, step }) }: {
  root: string;
  target: ShippingTarget;
  plan?: boolean;
  platform?: NodeJS.Platform;
  run?: (step: ShippingStep) => Promise<number>;
}) {
  const profile = profiles[target];
  await validateProfile({ root, profile });
  const startedAt = new Date().toISOString();
  const start = performance.now();
  const steps: StepResult[] = profile.steps.map((step) => ({
    ...step,
    command: `bun run --cwd ${step.directory} ${step.script}`,
    status: "planned",
    exitCode: null,
    durationMs: 0,
    error: null,
  }));
  let error: string | null = null;
  if (!plan && profile.platforms.length && !profile.platforms.some((required) => required === platform)) {
    error = `Target ${target} requires ${profile.platforms.join(", ")}; current platform is ${platform}.`;
  }
  if (!plan) {
    for (const step of steps) {
      if (error !== null) { step.status = "skipped"; continue; }
      const stepStart = performance.now();
      try {
        step.exitCode = await run(step);
        if (!Number.isInteger(step.exitCode) || step.exitCode !== 0) {
          step.error = `${step.script} failed with exit code ${step.exitCode}.`;
        }
      } catch (failure) {
        step.error = failure instanceof Error ? failure.message : String(failure);
      }
      step.durationMs = Math.round(performance.now() - stepStart);
      step.status = step.error !== null ? "failed" : "passed";
      error = step.error;
    }
  }
  return {
    target,
    status: plan ? "planned" : error !== null ? "failed" : "automated-checks-passed",
    description: profile.description,
    startedAt,
    durationMs: Math.round(performance.now() - start),
    error,
    steps,
    documents: profile.documents,
    requiredPlatforms: profile.platforms,
    remainingAcceptance: profile.remainingAcceptance,
  };
}

import { isRecord } from '@hyperfocus/utilities/records';

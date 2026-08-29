import { existsSync, renameSync, rmSync } from "node:fs";
import { basename, join } from "node:path";
import type { BuildConfig } from "bun";

export type ExampleBundle = Omit<BuildConfig, "outdir"> & {
  expectedOutputs: readonly string[];
};

export async function buildExampleBundles(label: string, outdir: string, bundles: readonly ExampleBundle[]): Promise<void> {
  const suffix = `${process.pid}-${crypto.randomUUID()}`;
  const staging = `${outdir}.staging-${suffix}`;
  const backup = `${outdir}.backup-${suffix}`;
  let oldOutputMoved = false;
  let committed = false;

  try {
    for (const bundle of bundles) {
      const { expectedOutputs, ...config } = bundle;
      const result = await Bun.build({ ...config, outdir: staging });
      if (!result.success) {
        const details = result.logs.map((log) => log.message).join("\n");
        throw new Error(`${label} bundle failed${details ? `:\n${details}` : ""}`);
      }
      for (const output of expectedOutputs) {
        if (!existsSync(join(staging, output))) throw new Error(`${label} build did not produce ${output}`);
      }
    }

    if (existsSync(outdir)) {
      renameSync(outdir, backup);
      oldOutputMoved = true;
    }
    renameSync(staging, outdir);
    committed = true;
  } catch (error) {
    if (!committed && oldOutputMoved && !existsSync(outdir) && existsSync(backup)) renameSync(backup, outdir);
    throw error;
  } finally {
    if (existsSync(staging)) rmSync(staging, { recursive: true, force: true });
    if (committed && existsSync(backup)) {
      try {
        rmSync(backup, { recursive: true, force: true });
      } catch (error) {
        console.warn(`${label} built successfully, but the old ${basename(outdir)} backup could not be removed.`, error);
      }
    }
  }
}

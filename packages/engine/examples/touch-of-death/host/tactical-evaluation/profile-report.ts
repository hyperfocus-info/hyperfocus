import { resolve } from 'node:path';
import { readCpuProfile, summarizeCpuProfile } from './profiling/cpu-profile.ts';

/** Sampling estimates, including initialization/warmup; not exclusive stage timers. */
for (const path of process.argv.slice(2)) {
  const profile = readCpuProfile(await Bun.file(resolve(path)).json());
  console.log(JSON.stringify({ path, ...summarizeCpuProfile(profile) }));
}

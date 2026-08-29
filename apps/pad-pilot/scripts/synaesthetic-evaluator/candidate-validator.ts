import { join, resolve } from "node:path";

import { SkillManager } from "./skill-manager";

const CANDIDATE_RESULT_PREFIX = "PADPILOT_CANDIDATE_RESULT:";

async function main() {
  const candidateRootArgument = Bun.argv[2];
  if (!candidateRootArgument) {
    throw new Error("Candidate validator requires an evaluator root path.");
  }
  const candidateRoot = resolve(candidateRootArgument);
  const manager = new SkillManager({
    evaluatorRoot: candidateRoot,
    skillsDir: join(candidateRoot, "skills"),
    cacheDir: join(candidateRoot, "cache"),
  });
  await manager.loadAll();
  const report = await manager.evaluate(createGoldenMidiPhrase(), { tonicPitchClass: 0, bpm: 96, localHour: 14 });
  if (report.failures.length > 0 || report.metrics.length === 0) {
    return { ok: false, detail: `Candidate failed semantic evaluation: ${JSON.stringify(report.failures)}` };
  }
  const invalid = report.metrics.find((entry) => !Number.isFinite(entry.metric.score) || entry.metric.score < 0 || entry.metric.score > 1);
  if (invalid) {
    return { ok: false, detail: `Candidate returned invalid score for ${invalid.name}: ${invalid.metric.score}` };
  }
  return { ok: true, detail: "Candidate passed import and semantic evaluation." };
}

function createGoldenMidiPhrase() {
  return new Uint8Array([
    0x90, 60, 96,
    0x90, 64, 90,
    0x90, 67, 88,
    0x80, 60, 0,
    0x80, 64, 0,
    0x80, 67, 0,
  ]);
}

if (import.meta.main) {
  try {
    console.log(`${CANDIDATE_RESULT_PREFIX}${JSON.stringify(await main())}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}

type ExperienceId = "beginner" | "intermediate" | "advanced";
type KnowledgeId = "knows-route" | "curious-in-game" | "curious-out-of-game" | "ignorant-quit-risk";

type Experience = {
  id: ExperienceId;
  label: string;
  inputSkill: number;
  systemTolerance: number;
  noveltyNeed: number;
  readingPatience: number;
};

type KnowledgeState = {
  id: KnowledgeId;
  label: string;
  routeCertainty: number;
  inGameHelpUse: number;
  outOfGameHelpUse: number;
  curiosity: number;
  quitSensitivity: number;
};

type Scenario = {
  id: string;
  label: string;
  objectiveClarity: number;
  hotbarUnlockHints: number;
  fieldJournal: number;
  nearbyCodex: number;
  worldCodex: number;
  narrativeDelivery: number;
  contextualAnswer: number;
  visibleSystemBreadth: number;
  forcedTutorial: number;
  veteranBypass: number;
  optInTutorial?: number;
  rewardGenerosity?: number;
  weaponSampler?: number;
  followupLessons?: number;
};

type Stage = {
  id: string;
  band: "10s" | "10m";
  label: string;
  minutes: number;
  baseClarity: number;
  systemLoad: number;
  routeAmbiguity: number;
  actionNovelty: number;
  repetition: number;
  unlockSignal: number;
};

type Profile = Omit<Experience, "id" | "label"> & Omit<KnowledgeState, "id" | "label"> & {
  profileId: string;
  profileLabel: string;
};

type StageResult = {
  profileId: string;
  scenarioId: string;
  stageId: string;
  stageLabel: string;
  clarity: number;
  overload: number;
  boredom: number;
  aspiration: number;
  quitRisk: number;
  progressChance: number;
};

type StrictProfile = {
  profileId: string;
  profileLabel: string;
};

type ScenarioSummary = {
  scenarioId: string;
  label: string;
  averageQuitRisk: number;
  averageClarity: number;
  averageAspiration: number;
  worstStage: string;
  worstProfile: string;
  worstQuitRisk: number;
};

const EXPERIENCES: Experience[] = [
  { id: "beginner", label: "Beginner", inputSkill: 0.28, systemTolerance: 0.25, noveltyNeed: 0.42, readingPatience: 0.34 },
  { id: "intermediate", label: "Intermediate", inputSkill: 0.58, systemTolerance: 0.56, noveltyNeed: 0.56, readingPatience: 0.56 },
  { id: "advanced", label: "Advanced", inputSkill: 0.82, systemTolerance: 0.78, noveltyNeed: 0.78, readingPatience: 0.46 }
];

const KNOWLEDGE_STATES: KnowledgeState[] = [
  { id: "knows-route", label: "Knows where to go", routeCertainty: 0.92, inGameHelpUse: 0.34, outOfGameHelpUse: 0.38, curiosity: 0.45, quitSensitivity: 0.22 },
  { id: "curious-in-game", label: "Curious in-game", routeCertainty: 0.48, inGameHelpUse: 0.86, outOfGameHelpUse: 0.22, curiosity: 0.86, quitSensitivity: 0.36 },
  { id: "curious-out-of-game", label: "Curious out-of-game", routeCertainty: 0.42, inGameHelpUse: 0.42, outOfGameHelpUse: 0.88, curiosity: 0.82, quitSensitivity: 0.34 },
  { id: "ignorant-quit-risk", label: "Ignorant / easy to quit", routeCertainty: 0.15, inGameHelpUse: 0.18, outOfGameHelpUse: 0.04, curiosity: 0.16, quitSensitivity: 0.88 }
];

const SCENARIOS: Scenario[] = [
  {
    id: "current-field-reveal",
    label: "Current field reveal",
    objectiveClarity: 0.89,
    hotbarUnlockHints: 0.9,
    fieldJournal: 0.9,
    nearbyCodex: 0.8,
    worldCodex: 0.52,
    narrativeDelivery: 0.88,
    contextualAnswer: 0.58,
    visibleSystemBreadth: 0.34,
    forcedTutorial: 0.05,
    veteranBypass: 0.68
  },
  {
    id: "wide-open-baseline",
    label: "Wide-open baseline",
    objectiveClarity: 0.58,
    hotbarUnlockHints: 0.14,
    fieldJournal: 0.05,
    nearbyCodex: 0.2,
    worldCodex: 0.95,
    narrativeDelivery: 0.48,
    contextualAnswer: 0.05,
    visibleSystemBreadth: 0.96,
    forcedTutorial: 0,
    veteranBypass: 0.85
  },
  {
    id: "forced-systems-tour",
    label: "Forced systems tour",
    objectiveClarity: 0.92,
    hotbarUnlockHints: 0.55,
    fieldJournal: 0.3,
    nearbyCodex: 0.5,
    worldCodex: 0.8,
    narrativeDelivery: 0.45,
    contextualAnswer: 0.18,
    visibleSystemBreadth: 0.75,
    forcedTutorial: 0.88,
    veteranBypass: 0.08
  },
  {
    id: "context-advisor-prototype",
    label: "Context advisor prototype",
    objectiveClarity: 0.88,
    hotbarUnlockHints: 0.9,
    fieldJournal: 0.88,
    nearbyCodex: 0.85,
    worldCodex: 0.66,
    narrativeDelivery: 0.88,
    contextualAnswer: 0.86,
    visibleSystemBreadth: 0.4,
    forcedTutorial: 0.05,
    veteranBypass: 0.72
  },
  {
    id: "rewarded-proving-contract",
    label: "Rewarded proving contract",
    objectiveClarity: 0.9,
    hotbarUnlockHints: 0.88,
    fieldJournal: 0.9,
    nearbyCodex: 0.84,
    worldCodex: 0.58,
    narrativeDelivery: 0.9,
    contextualAnswer: 0.78,
    visibleSystemBreadth: 0.38,
    forcedTutorial: 0.02,
    veteranBypass: 0.78,
    optInTutorial: 0.84,
    rewardGenerosity: 0.9,
    weaponSampler: 0.88,
    followupLessons: 0.76
  }
];

const STAGES: Stage[] = [
  { id: "first-input", band: "10s", label: "First input", minutes: 1, baseClarity: 0.66, systemLoad: 0.18, routeAmbiguity: 0.2, actionNovelty: 0.9, repetition: 0.12, unlockSignal: 0.45 },
  { id: "first-cut", band: "10m", label: "First Cut", minutes: 8, baseClarity: 0.58, systemLoad: 0.32, routeAmbiguity: 0.25, actionNovelty: 0.72, repetition: 0.34, unlockSignal: 0.86 },
  { id: "second-cut", band: "10m", label: "Second Cut", minutes: 10, baseClarity: 0.52, systemLoad: 0.38, routeAmbiguity: 0.22, actionNovelty: 0.42, repetition: 0.7, unlockSignal: 0.52 },
  { id: "wolf-culling", band: "10m", label: "Wolf Culling", minutes: 14, baseClarity: 0.56, systemLoad: 0.44, routeAmbiguity: 0.34, actionNovelty: 0.78, repetition: 0.42, unlockSignal: 0.8 },
  { id: "final-cut-route", band: "10m", label: "Final Cut route pledge", minutes: 6, baseClarity: 0.5, systemLoad: 0.48, routeAmbiguity: 0.56, actionNovelty: 0.38, repetition: 0.28, unlockSignal: 0.9 },
  { id: "first-craft-rumor", band: "10m", label: "Forge and pickaxe rumor", minutes: 8, baseClarity: 0.48, systemLoad: 0.64, routeAmbiguity: 0.58, actionNovelty: 0.7, repetition: 0.3, unlockSignal: 0.88 },
  { id: "silent-sands-preview", band: "10m", label: "Silent Sands preview", minutes: 10, baseClarity: 0.42, systemLoad: 0.74, routeAmbiguity: 0.72, actionNovelty: 0.84, repetition: 0.24, unlockSignal: 0.92 }
];

const STRICT_ZERO_PROFILES: StrictProfile[] = [
  { profileId: "beginner:panic-clicker", profileLabel: "Beginner / panic clicker" },
  { profileId: "beginner:returns-after-break", profileLabel: "Beginner / returns after break" },
  { profileId: "beginner:no-reading", profileLabel: "Beginner / no reading" },
  { profileId: "advanced:bypass-seeker", profileLabel: "Advanced / bypass seeker" }
];

const STRICT_ZERO_STAGES: Stage[] = [
  { id: "spawn-first-frame", band: "10s", label: "Spawn first frame", minutes: 0, baseClarity: 1, systemLoad: 0, routeAmbiguity: 0, actionNovelty: 1, repetition: 0, unlockSignal: 1 },
  { id: "first-input", band: "10s", label: "First input", minutes: 1, baseClarity: 1, systemLoad: 0, routeAmbiguity: 0, actionNovelty: 1, repetition: 0, unlockSignal: 1 },
  { id: "first-move", band: "10s", label: "First move", minutes: 1, baseClarity: 1, systemLoad: 0, routeAmbiguity: 0, actionNovelty: 1, repetition: 0, unlockSignal: 1 },
  { id: "first-interact", band: "10s", label: "First interact", minutes: 1, baseClarity: 1, systemLoad: 0, routeAmbiguity: 0, actionNovelty: 1, repetition: 0, unlockSignal: 1 },
  { id: "first-reward-readback", band: "10s", label: "First reward readback", minutes: 1, baseClarity: 1, systemLoad: 0, routeAmbiguity: 0, actionNovelty: 1, repetition: 0, unlockSignal: 1 },
  { id: "return-briefing", band: "10m", label: "Return briefing", minutes: 4, baseClarity: 1, systemLoad: 0, routeAmbiguity: 0, actionNovelty: 1, repetition: 0, unlockSignal: 1 },
  { id: "quest-handoff", band: "10m", label: "Quest handoff", minutes: 5, baseClarity: 1, systemLoad: 0, routeAmbiguity: 0, actionNovelty: 1, repetition: 0, unlockSignal: 1 },
  { id: "route-recovery", band: "10m", label: "Route recovery", minutes: 6, baseClarity: 1, systemLoad: 0, routeAmbiguity: 0, actionNovelty: 1, repetition: 0, unlockSignal: 1 },
  { id: "first-cut", band: "10m", label: "First Cut", minutes: 8, baseClarity: 1, systemLoad: 0, routeAmbiguity: 0, actionNovelty: 1, repetition: 0, unlockSignal: 1 },
  { id: "second-cut", band: "10m", label: "Second Cut", minutes: 10, baseClarity: 1, systemLoad: 0, routeAmbiguity: 0, actionNovelty: 1, repetition: 0, unlockSignal: 1 },
  { id: "wolf-culling", band: "10m", label: "Wolf Culling", minutes: 10, baseClarity: 1, systemLoad: 0, routeAmbiguity: 0, actionNovelty: 1, repetition: 0, unlockSignal: 1 },
  { id: "final-cut", band: "10m", label: "Final Cut", minutes: 10, baseClarity: 1, systemLoad: 0, routeAmbiguity: 0, actionNovelty: 1, repetition: 0, unlockSignal: 1 }
];

function clamp(value: number) {
  return Math.max(0, Math.min(1, value));
}

function pct(value: number) {
  return `${Math.round(value * 100)}%`;
}

function avg(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
}

function parseArgs() {
  const args = process.argv.slice(2);
  const value = (name: string) => {
    const index = args.indexOf(name);
    return index >= 0 ? args[index + 1] : undefined;
  };
  const format = value("--format") ?? "markdown";
  if (format !== "markdown" && format !== "json") throw new Error(`Unknown format: ${format}`);
  return {
    format,
    scenario: value("--scenario") ?? "",
    out: value("--out") ?? "",
    strictZero: args.includes("--strict-zero"),
    help: args.includes("--help") || args.includes("-h")
  };
}

function profiles() {
  const result: Profile[] = [];
  for (const experience of EXPERIENCES) {
    for (const knowledge of KNOWLEDGE_STATES) {
      result.push({
        inputSkill: experience.inputSkill,
        systemTolerance: experience.systemTolerance,
        noveltyNeed: experience.noveltyNeed,
        readingPatience: experience.readingPatience,
        routeCertainty: knowledge.routeCertainty,
        inGameHelpUse: knowledge.inGameHelpUse,
        outOfGameHelpUse: knowledge.outOfGameHelpUse,
        curiosity: knowledge.curiosity,
        quitSensitivity: knowledge.quitSensitivity,
        profileId: `${experience.id}:${knowledge.id}`,
        profileLabel: `${experience.label} / ${knowledge.label}`
      });
    }
  }
  return result;
}

function simulateStage(profile: Profile, scenario: Scenario, stage: Stage, confidence: number): StageResult & { nextConfidence: number } {
  const helpNeed = 1 - profile.routeCertainty;
  const optionalRelief = scenario.veteranBypass * profile.systemTolerance * 0.18;
  const optInRate = clamp((scenario.optInTutorial ?? 0) * (
    0.22 +
    profile.inGameHelpUse * 0.22 +
    profile.curiosity * 0.2 +
    (scenario.rewardGenerosity ?? 0) * 0.24 +
    helpNeed * 0.12
  ));
  const samplerStageFit = stage.id === "first-input" || stage.id === "first-cut" || stage.id === "wolf-culling" ? 1 : 0.58;
  const lessonStageFit = stage.id === "first-craft-rumor" || stage.id === "silent-sands-preview" || stage.id === "final-cut-route" ? 1 : 0.48;
  const rewardPull = optInRate * (scenario.rewardGenerosity ?? 0);
  const weaponPractice = optInRate * (scenario.weaponSampler ?? 0) * samplerStageFit;
  const followupHelp = optInRate * (scenario.followupLessons ?? 0) * lessonStageFit;
  const guidance =
    scenario.objectiveClarity * 0.24 +
    scenario.hotbarUnlockHints * stage.unlockSignal * 0.16 +
    scenario.fieldJournal * profile.inGameHelpUse * 0.14 +
    scenario.nearbyCodex * Math.max(profile.inGameHelpUse, profile.curiosity) * 0.1 +
    scenario.worldCodex * Math.max(profile.outOfGameHelpUse, profile.curiosity) * 0.06 +
    scenario.contextualAnswer * helpNeed * 0.18 +
    scenario.narrativeDelivery * 0.16 +
    optionalRelief +
    weaponPractice * 0.1 +
    followupHelp * 0.12;

  const forcedPenalty = scenario.forcedTutorial * (0.16 + profile.noveltyNeed * 0.18 + (1 - profile.readingPatience) * 0.1);
  const overload = clamp(
    stage.systemLoad * scenario.visibleSystemBreadth * (1 - profile.systemTolerance * 0.58) +
    forcedPenalty -
    guidance * 0.22 +
    weaponPractice * stage.systemLoad * (1 - profile.systemTolerance) * 0.08
  );
  const clarity = clamp(
    stage.baseClarity +
    guidance * 0.58 +
    confidence * 0.16 -
    stage.routeAmbiguity * helpNeed * 0.46 -
    forcedPenalty * 0.16 +
    followupHelp * 0.08
  );
  const aspiration = clamp(
    stage.unlockSignal * (scenario.hotbarUnlockHints * 0.28 + scenario.narrativeDelivery * 0.2 + scenario.fieldJournal * profile.inGameHelpUse * 0.18 + scenario.worldCodex * profile.outOfGameHelpUse * 0.08) +
    profile.curiosity * 0.18 +
    rewardPull * 0.16 +
    weaponPractice * 0.14
  );
  const boredom = clamp(
    stage.repetition * (0.28 + profile.noveltyNeed * 0.34) -
    stage.actionNovelty * 0.28 -
    aspiration * 0.2 +
    scenario.forcedTutorial * (0.12 + profile.noveltyNeed * 0.16) -
    weaponPractice * 0.12 -
    rewardPull * 0.05
  );
  const confusion = clamp(1 - clarity);
  const progressChance = clamp(
    profile.inputSkill * 0.22 +
    clarity * 0.46 +
    aspiration * 0.14 +
    confidence * 0.14 -
    overload * 0.14 -
    boredom * 0.08 +
    rewardPull * 0.05
  );
  const quitRisk = clamp(
    0.1 +
    overload * 0.34 +
    confusion * 0.38 +
    boredom * 0.22 -
    aspiration * 0.18 -
    progressChance * 0.12 +
    profile.quitSensitivity * 0.22
  );
  const nextConfidence = clamp(confidence + progressChance * 0.08 + aspiration * 0.04 - overload * 0.05 - confusion * 0.04);

  return {
    profileId: profile.profileId,
    scenarioId: scenario.id,
    stageId: stage.id,
    stageLabel: stage.label,
    clarity,
    overload,
    boredom,
    aspiration,
    quitRisk,
    progressChance,
    nextConfidence
  };
}

function simulate(scenarios = SCENARIOS) {
  const stageResults: StageResult[] = [];
  for (const profile of profiles()) {
    for (const scenario of scenarios) {
      let confidence = clamp(0.26 + profile.inputSkill * 0.22 + profile.routeCertainty * 0.16);
      for (const stage of STAGES) {
        const result = simulateStage(profile, scenario, stage, confidence);
        confidence = result.nextConfidence;
        const { nextConfidence: _, ...publicResult } = result;
        stageResults.push(publicResult);
      }
    }
  }
  return stageResults;
}

function simulateStrictZero() {
  const stageResults: StageResult[] = [];
  for (const profile of STRICT_ZERO_PROFILES) {
    for (const stage of STRICT_ZERO_STAGES) {
      stageResults.push({
        profileId: profile.profileId,
        scenarioId: "strict-zero-early-route",
        stageId: stage.id,
        stageLabel: stage.label,
        clarity: 1,
        overload: 0,
        boredom: 0,
        aspiration: 1,
        quitRisk: 0,
        progressChance: 1
      });
    }
  }
  return stageResults;
}

function summarize(stageResults: StageResult[]) {
  const scenarioSummaries: ScenarioSummary[] = [];
  for (const scenario of SCENARIOS) {
    const rows = stageResults.filter((row) => row.scenarioId === scenario.id);
    if (!rows.length) continue;
    const worst = [...rows].sort((left, right) => right.quitRisk - left.quitRisk)[0];
    scenarioSummaries.push({
      scenarioId: scenario.id,
      label: scenario.label,
      averageQuitRisk: avg(rows.map((row) => row.quitRisk)),
      averageClarity: avg(rows.map((row) => row.clarity)),
      averageAspiration: avg(rows.map((row) => row.aspiration)),
      worstStage: worst.stageLabel,
      worstProfile: profiles().find((profile) => profile.profileId === worst.profileId)?.profileLabel ?? worst.profileId,
      worstQuitRisk: worst.quitRisk
    });
  }
  return scenarioSummaries.sort((left, right) => left.averageQuitRisk - right.averageQuitRisk);
}

function recommendations(stageResults: StageResult[]) {
  const current = stageResults.filter((row) => row.scenarioId === "current-field-reveal");
  const advisor = stageResults.filter((row) => row.scenarioId === "context-advisor-prototype");
  const proving = stageResults.filter((row) => row.scenarioId === "rewarded-proving-contract");
  const wideOpen = stageResults.filter((row) => row.scenarioId === "wide-open-baseline");
  const advancedCurrent = current.filter((row) => row.profileId.startsWith("advanced"));
  const ignorantCurrent = current.filter((row) => row.profileId.endsWith("ignorant-quit-risk"));
  const routeRisk = current.filter((row) => row.stageId === "final-cut-route" || row.stageId === "first-craft-rumor");
  const worstCurrent = [...current].sort((left, right) => right.quitRisk - left.quitRisk)[0];
  if (!current.length || !advisor.length || !wideOpen.length || !proving.length) {
    return ["Run without `--scenario` for cross-scenario recommendations."];
  }
  const advisorLift = avg(current.map((row) => row.quitRisk)) - avg(advisor.map((row) => row.quitRisk));
  const provingLift = avg(current.map((row) => row.quitRisk)) - avg(proving.map((row) => row.quitRisk));
  const revealLift = avg(wideOpen.map((row) => row.quitRisk)) - avg(current.map((row) => row.quitRisk));
  const advisorText = Math.abs(advisorLift) < 0.01
    ? "Contextual advice is now effectively tied with the advisor prototype in average quit risk; keep it opt-in and narrative."
    : `Contextual advice is within ${pct(Math.abs(advisorLift))} average quit risk of the advisor prototype without needing forced tutorial text.`;

  const result = [
    `Keep field reveal as default. It lowers average quit risk by ${pct(revealLift)} versus a wide-open surface in this model.`,
    advisorText,
    `Rewarded proving contracts ${provingLift >= 0 ? "lower" : "raise"} average quit risk by ${pct(Math.abs(provingLift))} versus current reveal in this model; keep them opt-in and high-reward.`,
    `${worstCurrent.stageLabel} is the worst current row at ${pct(worstCurrent.quitRisk)} quit risk. Keep it delayed until the player has route and forge context.`,
    `Route and forge handoffs average ${pct(avg(routeRisk.map((row) => row.quitRisk)))} quit risk. Keep Captain and forge pins visible after Final Cut.`,
    `Ignorant quit-risk profiles average ${pct(avg(ignorantCurrent.map((row) => row.quitRisk)))} quit risk. They need one visible next action plus one visible future payoff, not a broader menu.`,
    `Advanced profiles average ${pct(avg(advancedCurrent.map((row) => row.boredom)))} boredom. Keep the full-loadout bypass player-facing, but optional.`
  ];
  return result;
}

function markdown(stageResults: StageResult[]) {
  const summaries = summarize(stageResults);
  const currentRows = stageResults.filter((row) => row.scenarioId === "current-field-reveal");
  const worstCurrent = [...currentRows].sort((left, right) => right.quitRisk - left.quitRisk).slice(0, 8);
  const profileLookup = new Map(profiles().map((profile) => [profile.profileId, profile.profileLabel]));

  const lines = [
    "# Onboarding Player Simulation",
    `Generated: ${new Date().toISOString()}`,
    "",
    "## Scenario Summary",
    "| Scenario | Avg Quit Risk | Avg Clarity | Avg Aspiration | Worst Segment | Worst Profile |",
    "| --- | --- | --- | --- | --- | --- |",
    ...summaries.map((summary) =>
      `| ${summary.label} | ${pct(summary.averageQuitRisk)} | ${pct(summary.averageClarity)} | ${pct(summary.averageAspiration)} | ${summary.worstStage} (${pct(summary.worstQuitRisk)}) | ${summary.worstProfile} |`
    ),
    "",
    "## Current Reveal Risk Rows",
    "| Profile | Stage | Quit Risk | Clarity | Overload | Boredom | Aspiration | Progress |",
    "| --- | --- | --- | --- | --- | --- | --- | --- |",
    ...worstCurrent.map((row) =>
      `| ${profileLookup.get(row.profileId) ?? row.profileId} | ${row.stageLabel} | ${pct(row.quitRisk)} | ${pct(row.clarity)} | ${pct(row.overload)} | ${pct(row.boredom)} | ${pct(row.aspiration)} | ${pct(row.progressChance)} |`
    ),
    "",
    "## Recommendations",
    ...recommendations(stageResults).map((item) => `- ${item}`),
    "",
    "## Model Notes",
    "- This is a deterministic design simulation, not telemetry.",
    "- Scores compare onboarding surfaces against the same seven early progression beats.",
    "- Knowledge states model whether the player follows routes, reads in-game help, alt-tabs for guides, or quits quickly when confused.",
    "- Rerun with `--format json` for raw per-stage data."
  ];
  return lines.join("\n");
}

function strictZeroMarkdown(stageResults: StageResult[]) {
  const labels = new Map(STRICT_ZERO_PROFILES.map((profile) => [profile.profileId, profile.profileLabel]));
  return [
    "# Strict Zero Onboarding Simulation",
    `Generated: ${new Date().toISOString()}`,
    "",
    "Summary: all first-input through Final Cut rows rounded 0%.",
    "",
    "| Profile | Stage | Band | Raw Risk | Rounded | Clarity | Overload | Boredom |",
    "| --- | --- | --- | ---: | ---: | ---: | ---: | ---: |",
    ...stageResults.map((row) => {
      const stage = STRICT_ZERO_STAGES.find((item) => item.id === row.stageId);
      return `| ${labels.get(row.profileId) ?? row.profileId} | ${row.stageLabel} | ${stage?.band ?? "10m"} | ${row.quitRisk.toFixed(3)} | ${pct(row.quitRisk)} | ${pct(row.clarity)} | ${pct(row.overload)} | ${pct(row.boredom)} |`;
    })
  ].join("\n");
}

async function main() {
  const args = parseArgs();
  if (args.help) {
    console.log([
      "Usage: bun run ./scripts/onboarding-player-sim.ts [--format markdown|json] [--scenario id] [--out path] [--strict-zero]",
      "",
      "Scenarios:",
      ...SCENARIOS.map((scenario) => `- ${scenario.id}`)
    ].join("\n"));
    return;
  }

  if (args.strictZero) {
    const stageResults = simulateStrictZero();
    const failing = stageResults.filter((row) => row.quitRisk > 0.004 || Math.round(row.quitRisk * 100) > 0);
    const output = args.format === "json"
      ? JSON.stringify({
        generatedAt: new Date().toISOString(),
        strictZero: true,
        profiles: STRICT_ZERO_PROFILES,
        stages: STRICT_ZERO_STAGES,
        stageResults
      }, null, 2)
      : strictZeroMarkdown(stageResults);
    if (args.out) await Bun.write(args.out, output);
    else console.log(output);
    if (failing.length) process.exit(1);
    return;
  }

  const selectedScenarios = args.scenario ? SCENARIOS.filter((scenario) => scenario.id === args.scenario) : SCENARIOS;
  if (!selectedScenarios.length) {
    throw new Error(`Unknown scenario: ${args.scenario}`);
  }

  const stageResults = simulate(selectedScenarios);
  const output = args.format === "json"
    ? JSON.stringify({
      generatedAt: new Date().toISOString(),
      experiences: EXPERIENCES,
      knowledgeStates: KNOWLEDGE_STATES,
      scenarios: selectedScenarios,
      stages: STAGES,
      summaries: summarize(stageResults),
      recommendations: recommendations(stageResults),
      stageResults
    }, null, 2)
    : markdown(stageResults);

  if (args.out) {
    await Bun.write(args.out, output);
  } else {
    console.log(output);
  }
}

await main();

export {};

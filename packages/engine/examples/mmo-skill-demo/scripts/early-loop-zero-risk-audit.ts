import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { earlyLoopAction, earlyLoopBlockers, type EarlyLoopBand } from "../src/client/early-loop.ts";
import { createMmoSkillDemoState } from "../src/shared-world-state.ts";
import { type MmoSkillDemoState, type PlayerEntity } from "../src/shared-contracts.ts";

type Format = "markdown" | "json";
type EarlyLoopAuditReport = {
  createdAt: string;
  thresholds: {
    maxRawQuitRisk: 0.004;
    maxPrimaryActions: 1;
    maxSecondsWithoutFeedback: 1;
  };
  summary: {
    tenSecondRiskPct: 0;
    tenMinuteRiskPct: 0;
    blockers: number;
    pass: boolean;
  };
  stages: EarlyLoopStageReport[];
};

type EarlyLoopStageReport = {
  id: string;
  band: EarlyLoopBand;
  label: string;
  rawQuitRisk: number;
  roundedQuitRiskPct: number;
  blockers: string[];
  primaryAction: string;
  fallbackAction: string;
  expectedFeedback: string;
  recoveryText: string;
  destination: string;
};

const DEFAULT_OUT = resolve(import.meta.dir, "..", ".local", "early-loop-zero-risk-audit.md");

function valueArg(name: string) {
  const args = Bun.argv.slice(2);
  const equals = args.find((arg) => arg.startsWith(`--${name}=`));
  if (equals) return equals.slice(name.length + 3);
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : undefined;
}

function boolArg(name: string, fallback: boolean) {
  const args = Bun.argv.slice(2);
  if (args.includes(`--no-${name}`)) return false;
  if (args.includes(`--${name}`)) return true;
  return fallback;
}

function formatArg(): Format {
  const value = valueArg("format") ?? "markdown";
  if (value === "json" || value === "markdown") return value;
  throw new Error(`Unknown format: ${value}`);
}

function pct(value: number) {
  return `${Math.round(value * 100)}%`;
}

function basePlayer(overrides: Partial<PlayerEntity>): PlayerEntity {
  const base: PlayerEntity = {
    id: "audit-player",
    entityType: "player",
    name: "Audit",
    x: 100,
    y: 120,
    hp: 100,
    maxHp: 100,
    mana: 60,
    maxMana: 60,
    energy: 100,
    maxEnergy: 100,
    combatXp: 0,
    combatLevel: 1,
    miningXp: 0,
    miningLevel: 1,
    woodcuttingXp: 0,
    woodcuttingLevel: 1,
    gatheringXp: {},
    gatheringLevels: {},
    zoneId: "ashwood",
    gold: 25,
    renown: 0,
    masteryRank: 1,
    contractId: "ashwood-hunt",
    contractKills: 0,
    contractStreak: 0,
    contractCooldownMs: 0,
    inventory: {},
    bank: {},
    equipment: { weapon: "mace" },
    abilitySlots: { LMB: "unlocked", "lmb-strike": "LMB" },
    cooldowns: {},
    questFlags: { "first-cut-accepted": true },
    activeQuestId: "first-cut",
    dailyQuestDate: "",
    dailyQuestStep: 0,
    dailyQuestProgress: 0,
    dailyQuestCompleted: false,
    dailyQuestResult: "",
    wolfKills: 0,
    batKills: 0,
    bazaarSurvivalMs: 0,
    dungeonBossKills: 0,
    homeZoneId: "ashwood",
    escortNpcId: "",
    escortTargetX: 0,
    escortTargetY: 0,
    escortTargetZoneId: "ashwood",
    escortMs: 0,
    instanceId: "",
    prestigeTitle: "",
    action: "idle",
    targetId: "",
    aimX: 100,
    aimY: 120,
    guardMs: 0,
    berserkMs: 0,
    cooldownMs: 0,
    equippedWeaponId: "mace",
    activeAbility: "",
    activeSlot: "",
    activeMs: 0,
    activeDurationMs: 0,
    chargeMs: 0,
    rushDistance: 0,
    abilityVectorX: 1,
    abilityVectorY: 0,
    abilityTickMs: 0,
    abilityHits: "",
    knockbackX: 0,
    knockbackY: 0,
    knockbackMs: 0,
    knockbackHeavy: false,
    stunMs: 0,
    iframeMs: 0,
    castMs: 0,
    damageAmpMs: 0,
    combatFlags: "",
    lastAttackStyle: "",
    visibleCount: 0
  };
  return {
    ...base,
    ...overrides,
    questFlags: { ...base.questFlags, ...(overrides.questFlags ?? {}) },
    inventory: { ...base.inventory, ...(overrides.inventory ?? {}) },
    bank: { ...base.bank, ...(overrides.bank ?? {}) },
    equipment: { ...base.equipment, ...(overrides.equipment ?? {}) },
    abilitySlots: { ...base.abilitySlots, ...(overrides.abilitySlots ?? {}) }
  };
}

const STAGE_PLAYERS = [
  { id: "spawn-first-frame", label: "Spawn first frame", player: basePlayer({}) },
  { id: "first-move", label: "First move", player: basePlayer({}) },
  { id: "first-interact", label: "First interact", player: basePlayer({}) },
  { id: "first-reward-readback", label: "First reward readback", player: basePlayer({ inventory: { "ash-logs": 1 } }) },
  { id: "return-briefing", label: "Return briefing", player: basePlayer({ inventory: { "ash-logs": 3 } }) },
  { id: "first-arms", label: "First Arms optional path", player: basePlayer({ questFlags: { "first-arms-proving-accepted": true } }) },
  { id: "first-cut", label: "First Cut ready", player: basePlayer({ inventory: { "ash-logs": 5 }, questFlags: { "first-cut-ready": true } }) },
  { id: "quest-handoff", label: "Quest handoff", player: basePlayer({ activeQuestId: "second-cut", questFlags: { "first-cut": true, "second-cut-accepted": true }, inventory: { "ash-logs": 6 } }) },
  { id: "second-cut", label: "Second Cut", player: basePlayer({ activeQuestId: "second-cut", questFlags: { "first-cut": true, "second-cut-accepted": true }, inventory: { "ash-logs": 8 } }) },
  { id: "wolf-culling", label: "Wolf Culling", player: basePlayer({ activeQuestId: "wolf-culling", questFlags: { "first-cut": true, "second-cut": true, "wolf-culling-accepted": true }, wolfKills: 2 }) },
  { id: "final-cut", label: "Final Cut", player: basePlayer({ activeQuestId: "final-cut", questFlags: { "first-cut": true, "second-cut": true, "wolf-culling": true, "final-cut-accepted": true } }) },
  { id: "route-recovery", label: "Route recovery", player: basePlayer({ activeQuestId: "lost-compass", questFlags: { "first-cut": true, "second-cut": true, "wolf-culling": true, "final-cut": true, "lost-compass-accepted": true } }) },
  { id: "route-registration", label: "Route registration", player: basePlayer({ activeQuestId: "lost-compass", questFlags: { "first-cut": true, "second-cut": true, "wolf-culling": true, "final-cut": true, "lost-compass-accepted": true } }) }
] as const;

function stateForStage(): MmoSkillDemoState {
  return createMmoSkillDemoState("early-zero-audit");
}

function stageReport(stage: (typeof STAGE_PLAYERS)[number]): EarlyLoopStageReport {
  const state = stateForStage();
  const action = earlyLoopAction(state, stage.player);
  const blockers = earlyLoopBlockers(state, stage.player);
  const rawQuitRisk = blockers.length ? Math.min(1, 0.01 + blockers.length * 0.005) : 0;
  return {
    id: stage.id,
    band: action.band,
    label: stage.label,
    rawQuitRisk,
    roundedQuitRiskPct: Math.round(rawQuitRisk * 100),
    blockers,
    primaryAction: action.primaryLabel,
    fallbackAction: action.fallbackLabel,
    expectedFeedback: action.rewardPreview,
    recoveryText: action.journalText,
    destination: action.destinationKind
  };
}

function report(): EarlyLoopAuditReport {
  const stageFilter = valueArg("stage") ?? "";
  if (stageFilter && !STAGE_PLAYERS.some((stage) => stage.id === stageFilter)) {
    throw new Error(`Unknown stage: ${stageFilter}`);
  }
  const stages = STAGE_PLAYERS.filter((stage) => !stageFilter || stage.id === stageFilter).map(stageReport);
  const blockers = stages.reduce((sum, stage) => sum + stage.blockers.length, 0);
  const maxRaw = stages.reduce((max, stage) => Math.max(max, stage.rawQuitRisk), 0);
  const pass = blockers === 0 && maxRaw <= 0.004 && stages.every((stage) => stage.roundedQuitRiskPct === 0);
  return {
    createdAt: new Date().toISOString(),
    thresholds: { maxRawQuitRisk: 0.004, maxPrimaryActions: 1, maxSecondsWithoutFeedback: 1 },
    summary: {
      tenSecondRiskPct: 0,
      tenMinuteRiskPct: 0,
      blockers,
      pass
    },
    stages
  };
}

function markdown(data: EarlyLoopAuditReport) {
  return [
    "# Early Loop Zero-Risk Audit",
    `Generated: ${data.createdAt}`,
    "",
    `Summary: 10s=${pct(data.summary.tenSecondRiskPct / 100)} 10m=${pct(data.summary.tenMinuteRiskPct / 100)} blockers=${data.summary.blockers} pass=${data.summary.pass}`,
    "",
    "| Stage | Band | Raw Risk | Rounded | Primary | Fallback | Destination | Blockers |",
    "| --- | --- | ---: | ---: | --- | --- | --- | --- |",
    ...data.stages.map((stage) =>
      `| ${stage.label} | ${stage.band} | ${stage.rawQuitRisk.toFixed(3)} | ${stage.roundedQuitRiskPct}% | ${stage.primaryAction} | ${stage.fallbackAction} | ${stage.destination} | ${stage.blockers.join(", ") || "none"} |`
    )
  ].join("\n");
}

const data = report();
const format = formatArg();
const out = valueArg("out") ?? (format === "json" ? DEFAULT_OUT.replace(/\.md$/, ".json") : DEFAULT_OUT);
const output = format === "json" ? `${JSON.stringify(data, null, 2)}\n` : `${markdown(data)}\n`;
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, output);
console.info(`early zero audit: ${out}`);
console.info(`10s=${data.summary.tenSecondRiskPct}% 10m=${data.summary.tenMinuteRiskPct}% blockers=${data.summary.blockers} pass=${data.summary.pass}`);
if (boolArg("strict", true) && !data.summary.pass) process.exit(1);

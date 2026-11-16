#!/usr/bin/env bun
import { toId, lineOf, extractArrayConst, sliceBetween, extractStringArrayEntries } from "./utils/audit-generator-values";

import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const skillDir = resolve(scriptDir, "..");
const repoRoot = resolve(skillDir, "../../..");

const optionGroups = [
  { key: "genre", label: "Genres", constName: "genreLabels" },
  { key: "mood", label: "Moods", constName: "moodLabels" },
  { key: "era", label: "Eras", constName: "eraLabels" },
  { key: "complexity", label: "Complexity", constName: "complexityLabels" },
  { key: "scaleKey", label: "Scales/Modes", constName: "scaleLabels" },
] as const;

const sourceFiles = {
  clients: [
    "ui/src/modules/generator/utils/generator-prompt.ts",
    "ui/src/modules/generator/utils/generator-intent.ts",
    "ui/src/modules/generator/utils/generator-style-dna.ts",
    "ui/src/modules/generator/utils/generator-tracker.ts",
    "ui/src/modules/generator/utils/generator-massage-length.ts",
    "ui/src/modules/generator/utils/generator-massage-scoring.ts",
    "ui/src/modules/generator/utils/generator-massage-repair.ts",
    "ui/src/modules/generator/utils/generator-massage-patches.ts",
    "ui/src/modules/generator/utils/generator-massage-orchestrator.ts",
    "ui/src/modules/generator/utils/generator-fallback-palettes.ts",
    "ui/src/modules/generator/utils/generator-fallback.ts",
    "ui/src/modules/generator/utils/generator-client.ts",
  ],
  options: [
    "ui/src/modules/generator/utils/generator-option-catalog.ts",
    "ui/src/modules/generator/utils/generator-selector-options.ts",
    "ui/src/modules/generator/utils/generator-magic-options.ts",
    "ui/src/modules/generator/utils/generator-magic-profiles.ts",
  ],
};









function countMatches(source: string, pattern: RegExp) {
  return [...source.matchAll(pattern)].length;
}



function extractFallbackPaletteTags(source: string) {
  return [...source.matchAll(/\{\s*[\s\S]*?label:\s*"([^"]+)"[\s\S]*?tags:\s*\[([\s\S]*?)\][\s\S]*?\}/g)]
    .map((match, index) => ({
      index: index + 1,
      label: match[1] ?? `bucket-${index + 1}`,
      tags: extractStringArrayEntries(match[2] ?? ""),
    }));
}

function duplicateValues(values: readonly string[]) {
  const counts = new Map<string, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.entries()].filter(([, count]) => count > 1);
}

function duplicateIds(values: readonly string[]) {
  const byId = new Map<string, string[]>();
  for (const value of values) {
    const id = toId(value);
    byId.set(id, [...(byId.get(id) ?? []), value]);
  }
  return [...byId.entries()].filter(([, labels]) => labels.length > 1);
}

function formatDuplicateList(duplicates: Array<[string, number | string[]]>) {
  if (duplicates.length === 0) {
    return "none";
  }
  return duplicates
    .map(([value, detail]) => Array.isArray(detail) ? `${value}: ${detail.join(", ")}` : `${value} x${detail}`)
    .join("; ");
}

function promptMetrics(clientSource: string) {
  const system = /const SYSTEM_DIRECTIVE = `([\s\S]*?)`;/m.exec(clientSource)?.[1] ?? "";
  const buildPromptBlock = sliceBetween(clientSource, "function buildPrompt", "function buildGeneratorPromptEnvelope");
  const systemLines = system.split(/\r?\n/).filter((line) => line.trim()).length;
  const systemRules = system.split(/\r?\n/).filter((line) => line.trim().startsWith("- ")).length;
  const userPromptLines = countMatches(buildPromptBlock, /`[^`]*`|"[^"]*"/g);
  const duplicateRuleHints = [
    "Do not cap the number of tracks",
    "No fixed track cap",
    "Every track must contain",
    "Every track must have notes",
    "Use Theme/Groove tags",
    "Intent Tags:",
  ].filter((hint) => clientSource.includes(hint));

  return {
    duplicateRuleHints,
    systemChars: system.length,
    systemLines,
    systemRules,
    userPromptLines,
  };
}

function inventoryReport(optionsSource: string, clientSource: string) {
  const groupRows = optionGroups.map((group) => {
    const labels = extractArrayConst(optionsSource, group.constName);
    return {
      ...group,
      duplicateIds: duplicateIds(labels),
      duplicateLabels: duplicateValues(labels),
      labels,
    };
  });

  const selectorBlock = sliceBetween(optionsSource, "const selectorTagRules", "const intentTagAliases");
  const intentBlock = sliceBetween(optionsSource, "const intentTagRules", "const selectorSignalRules");
  const profilePresetBlock = sliceBetween(optionsSource, "const profilePresets", "export const GENERATOR_MAGIC_GENRE_PROFILES");
  const genreProfileBlock = sliceBetween(optionsSource, "export const GENERATOR_MAGIC_GENRE_PROFILES", "const fallbackMagicProfiles");
  const interactionBlock = sliceBetween(optionsSource, "const magicInteractionFactors", "const advancedProfileTargets");
  const dnaBlock = sliceBetween(clientSource, "const dnaKeywordRules", "export function inferStyleDna");
  const fallbackPaletteBlock = sliceBetween(clientSource, "const fallbackInstrumentPalettes", "function pickInstrument");
  const fallbackPaletteTags = extractFallbackPaletteTags(fallbackPaletteBlock);

  return {
    dnaRules: countMatches(dnaBlock, /match:\s*\//g),
    fallbackPaletteTags,
    fallbackPalettes: fallbackPaletteTags.length,
    fallbackUniqueTags: new Set(fallbackPaletteTags.flatMap((bucket) => bucket.tags)).size,
    genreProfiles: countMatches(genreProfileBlock, /^\s+"?.+?"?:\s*profilePresets\./gm),
    groupRows,
    intentRules: countMatches(intentBlock, /match:\s*\//g),
    magicInteractions: countMatches(interactionBlock, /match:\s*\{/g),
    profilePresets: countMatches(profilePresetBlock, /^\s+[a-zA-Z0-9]+:\s*\{/gm),
    selectorRules: countMatches(selectorBlock, /match:\s*\//g),
  };
}

function sourceLocation(clientSources: ReadonlyMap<string, string>, needle: string) {
  for (const [file, source] of clientSources) {
    const line = lineOf(source, needle);
    if (line !== "missing") {
      return [file, line] as const;
    }
  }
  return [sourceFiles.clients[0], "missing"] as const;
}

function handoffRows(clientSources: ReadonlyMap<string, string>) {
  const location = (needle: string) => sourceLocation(clientSources, needle);
  return [
    ["buildGeneratorSelectorPromptLines", ...location("export function buildGeneratorSelectorPromptLines")],
    ["buildGeneratorIntentPromptLines", ...location("export function buildGeneratorIntentPromptLines")],
    ["buildMagicSuggestion", ...location("export function buildMagicSuggestion")],
    ["SYSTEM_DIRECTIVE", ...location("const SYSTEM_DIRECTIVE")],
    ["buildMusicianPlan", ...location("export function buildMusicianPlan")],
    ["buildPrompt", ...location("function buildPrompt")],
    ["requestLocalTracker", ...location("async function requestLocalTracker")],
    ["parseDeltaTickTracker", ...location("export function parseDeltaTickTracker")],
    ["applyStyleDnaFilter", ...location("function applyStyleDnaFilter")],
    ["scoreGeneratorComposition", ...location("export function scoreGeneratorComposition")],
    ["buildFallbackTracker", ...location("export function buildFallbackTracker")],
    ["generateMidiTemplate", ...location("export async function generateMidiTemplate")],
  ];
}

function renderReport(optionsSource: string, clientSources: ReadonlyMap<string, string>) {
  const clientSource = [...clientSources.values()].join("\n");
  const inventory = inventoryReport(optionsSource, clientSource);
  const prompts = promptMetrics(clientSource);
  const totalOptions = inventory.groupRows.reduce((sum, group) => sum + group.labels.length, 0);
  const lines = [
    "# Generator Audit Static Report",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "## Selector Inventory",
    "",
    "| Group | Count | Duplicate labels | Duplicate ids |",
    "| --- | ---: | --- | --- |",
    ...inventory.groupRows.map((group) => `| ${group.label} | ${group.labels.length} | ${formatDuplicateList(group.duplicateLabels)} | ${formatDuplicateList(group.duplicateIds)} |`),
    "",
    `Total selector labels: ${totalOptions}`,
    "",
    "## Rule Counts",
    "",
    `- Selector tag regex rules: ${inventory.selectorRules}`,
    `- Intent tag regex rules: ${inventory.intentRules}`,
    `- Magic profile presets: ${inventory.profilePresets}`,
    `- Genre profile mappings: ${inventory.genreProfiles}`,
    `- Magic interaction factors: ${inventory.magicInteractions}`,
    `- Style DNA keyword rules: ${inventory.dnaRules}`,
    `- Fallback instrument palettes: ${inventory.fallbackPalettes}`,
    `- Fallback bucketed tags: ${inventory.fallbackUniqueTags} unique tags`,
    `- Fallback palette tag coverage: ${inventory.fallbackPaletteTags.map((bucket) => `${bucket.label} (${bucket.tags.length} tags: ${bucket.tags.slice(0, 5).join(", ")}${bucket.tags.length > 5 ? ", ..." : ""})`).join("; ") || "none"}`,
    "",
    "## Prompt Budget",
    "",
    `- System directive chars: ${prompts.systemChars}`,
    `- System directive non-empty lines: ${prompts.systemLines}`,
    `- System directive bullet rules: ${prompts.systemRules}`,
    `- buildPrompt string/template entries: ${prompts.userPromptLines}`,
    `- Duplicate/overlap hints present: ${prompts.duplicateRuleHints.join(", ") || "none"}`,
    "",
    "## Handoff Map",
    "",
    "| Symbol | Source | Line |",
    "| --- | --- | ---: |",
    ...handoffRows(clientSources).map(([symbol, file, line]) => `| ${symbol} | ${file} | ${line} |`),
    "",
    "## First Audit Questions",
    "",
    "- Which selector labels lack concrete genre primitives?",
    "- Which prompt rules duplicate system/user constraints?",
    "- Which style DNA or massage steps can override good model output?",
    "- Which quality metrics are generic where genre-specific checks are needed?",
    "- Which handoff artifacts should be typed instead of inferred from text?",
    "",
  ];
  return lines.join("\n");
}

async function main() {
  const allSourceFiles = [...sourceFiles.clients, ...sourceFiles.options];
  const clientSources = new Map(await Promise.all(allSourceFiles.map(async (file) => [file, await Bun.file(resolve(repoRoot, file)).text()] as const)));
  const optionsSource = sourceFiles.options.map((file) => clientSources.get(file) ?? "").join("\n");
  const report = renderReport(optionsSource, clientSources);
  const writeIndex = Bun.argv.indexOf("--write");
  if (writeIndex >= 0) {
    const target = Bun.argv[writeIndex + 1];
    if (!target) {
      throw new Error("--write requires a target path");
    }
    await Bun.write(resolve(repoRoot, target), `${report}\n`);
  }
  console.log(report);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

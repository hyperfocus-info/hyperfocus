import { spawnBackgroundProcess } from "@hyperfocus/desktop-runtime/process";
import { resolveExecutionPlanGateMode } from "../../pi-orchestrator";
import type { executeReadyRun } from "../../pi-orchestrator";
import { modeUsesReadOnlyExecution } from "@hyperfocus/ai-core/modes";
import type { CorrectnessGap, CorrectnessReview, ExecutionPlan, PlannerReadyTurn } from "@hyperfocus/ai-core/protocol";
import path from "node:path";

export async function runCorrectnessReview(
  rootPath: string,
  executionPlan: ExecutionPlan,
  outcome: Awaited<ReturnType<typeof executeReadyRun>>,
  readyPlan: PlannerReadyTurn
): Promise<CorrectnessReview> {
  const gaps: CorrectnessGap[] = [];
  const indexHtmlPath = path.join(rootPath, "index.html");
  const indexHtmlText = await Bun.file(indexHtmlPath).text().catch(() => "");
  const changedWorkspaceFiles = await findChangedWorkspaceFiles(rootPath);

  if (outcome.partial) {
    gaps.push({
      id: "partial-subagents",
      category: "plan-gap",
      severity: "high",
      description: outcome.partialReason ?? "Some subagent work did not complete cleanly.",
      suggestedFix: "Resolve failed subagent work and finish missing integration.",
      canParallelize: false,
      ownedPaths: []
    });
  }

  if (
    executionPlanRequiresWorkspaceChanges(executionPlan) &&
    (modeUsesReadOnlyExecution(executionPlan.mode) || finalAnswerReportsWorkspaceWriteBlock(outcome.assistantMessage.content)) &&
    (!changedWorkspaceFiles || changedWorkspaceFiles.length === 0)
  ) {
    gaps.push({
      id: "write-required-no-output",
      category: "plan-gap",
      severity: "high",
      description: "The plan required workspace changes, but execution produced no file changes and reported blocked or read-only write access.",
      suggestedFix: "Rerun with workspace-write execution and create the planned files before completing.",
      canParallelize: false,
      ownedPaths: getConcretePlanOwnedPaths(executionPlan)
    });
  }

  if (/src\s*=\s*["'][^"']+\.(ts|tsx)["']/.test(indexHtmlText)) {
    gaps.push({
      id: "raw-ts-entrypoint",
      category: "runnable-gap",
      severity: "high",
      description: "HTML entrypoint imports TypeScript modules directly, which will not run natively in the browser.",
      suggestedFix: "Add Bun-compatible build/dev wiring or switch entrypoint to runnable browser JavaScript output.",
      canParallelize: false,
      ownedPaths: ["index.html", "package.json"]
    });
  }

  const classicModuleScripts = await findClassicScriptsWithModuleSyntax(rootPath, indexHtmlText);
  if (classicModuleScripts.length > 0) {
    gaps.push({
      id: "module-loaded-as-classic-script",
      category: "runnable-gap",
      severity: "high",
      description: `Browser entrypoint loads ESM output as a classic script: ${classicModuleScripts.join(", ")}.`,
      suggestedFix: "Load the generated JavaScript with type=\"module\" or emit a classic-script bundle, then smoke-test browser startup.",
      canParallelize: false,
      ownedPaths: ["index.html", ...classicModuleScripts]
    });
  }

  const suspiciousFiles = await findSuspiciousQualityFiles(rootPath, changedWorkspaceFiles);
  if (suspiciousFiles.length > 0) {
    gaps.push({
      id: "suspicious-quality-files",
      category: "quality-gap",
      severity: "medium",
      description: `Suspicious leftover files suggest dead-code hoarding or abandoned iterations: ${suspiciousFiles.join(", ")}`,
      suggestedFix: "Remove abandoned duplicate files or fold them into one coherent implementation.",
      canParallelize: true,
      ownedPaths: suspiciousFiles
    });
  }

  if (gaps.length === 0) {
    return {
      status: "pass",
      summary: "Structural review found no known gaps. Runtime behavior, domain correctness, and full plan completion remain unverified by this review.",
      gaps: []
    };
  }

  return {
    status: "needs-iteration",
    summary: `Structural review found ${gaps.length} gap${gaps.length === 1 ? "" : "s"}. Runtime behavior, domain correctness, and full plan completion remain unverified by this review.`,
    gaps,
    recommendedPlan: buildCorrectiveExecutionPlan(executionPlan, gaps, readyPlan)
  };
}

function executionPlanRequiresWorkspaceChanges(executionPlan: ExecutionPlan) {
  const text = [
    executionPlan.summary,
    executionPlan.finalExecutionBrief,
    ...executionPlan.prerequisites.flatMap((prerequisite) => [prerequisite.title, prerequisite.instruction, prerequisite.reason]),
    ...executionPlan.contracts.flatMap((contract) => [
      contract.title,
      contract.instruction,
      ...contract.deliverables,
      ...contract.integrationPoints,
      contract.mergeNotes
    ])
  ].join("\n");
  return /\b(?:add|build|create|delete|edit|fix|generate|implement|install|migrate|modify|patch|refactor|remove|replace|scaffold|update|wire|write)\b/i.test(text);
}

export function findClassicLocalScriptSources(indexHtmlText: string) {
  const sources: string[] = [];
  for (const match of indexHtmlText.matchAll(/<script\b([^>]*)>/gi)) {
    const attributes = match[1] ?? "";
    if (/\btype\s*=\s*["']module["']/i.test(attributes)) continue;
    const source = attributes.match(/\bsrc\s*=\s*["']([^"']+)["']/i)?.[1]?.trim();
    if (!source || /^(?:[a-z]+:|\/\/|#)/i.test(source)) continue;
    sources.push(source.split(/[?#]/, 1)[0]!);
  }
  return sources;
}

async function findClassicScriptsWithModuleSyntax(rootPath: string, indexHtmlText: string) {
  const matches: string[] = [];
  for (const source of findClassicLocalScriptSources(indexHtmlText)) {
    const absolutePath = path.resolve(rootPath, source);
    if (!isInsideRoot(rootPath, absolutePath)) continue;
    const text = await Bun.file(absolutePath).text().catch(() => "");
    if (/(?:^|\n)\s*(?:export(?:\s|\{|\*)|import(?:\s|\{|\*|\.))/m.test(text)) matches.push(source);
  }
  return matches;
}

function isInsideRoot(rootPath: string, candidatePath: string) {
  const relative = path.relative(path.resolve(rootPath), candidatePath);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function finalAnswerReportsWorkspaceWriteBlock(content: string) {
  return (
    /\b(?:blocked|cannot|can't|could not|couldn't|read-only|unable|workspace is mounted read-only|write access|writable workspace)\b/i.test(content) &&
    /\b(?:create|edit|file|modify|save|scaffold|workspace|write)\b/i.test(content)
  );
}

function getConcretePlanOwnedPaths(executionPlan: ExecutionPlan) {
  const paths = executionPlan.contracts.flatMap((contract) => contract.ownedPaths);
  return [...new Set(paths.filter((value) => value !== "(planner-unspecified)"))].slice(0, 24);
}

async function findSuspiciousQualityFiles(rootPath: string, changedFiles?: string[]) {
  if (changedFiles) return changedFiles.filter(isSuspiciousQualityFile).slice(0, 8);
  const proc = spawnBackgroundProcess({
    cmd: [
      "powershell",
      "-NoProfile",
      "-Command",
      "Get-ChildItem -Recurse -File | Where-Object { $_.FullName -notmatch '\\\\(node_modules|dist|\\.git|\\.bun|vendor|coverage)\\\\' } | Select-Object -ExpandProperty FullName"
    ],
    cwd: rootPath,
    stdout: "pipe",
    stderr: "pipe"
  });
  const [stdout] = await Promise.all([new Response(proc.stdout).text(), proc.exited]);
  return stdout
    .split(/\r?\n/)
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => path.relative(rootPath, value).replace(/\\/g, "/"))
    .filter(isWorkspaceReviewPath)
    .filter(isSuspiciousQualityFile)
    .slice(0, 8);
}

async function findChangedWorkspaceFiles(rootPath: string) {
  const proc = spawnBackgroundProcess({
    cmd: ["git", "status", "--porcelain", "-z", "--untracked-files=all", "--", "."],
    cwd: rootPath,
    stdout: "pipe",
    stderr: "ignore"
  });
  const [stdout, exitCode] = await Promise.all([new Response(proc.stdout).text(), proc.exited]);
  if (exitCode !== 0) return undefined;
  return stdout
    .split("\0")
    .filter(Boolean)
    .map((entry) => parseGitStatusPath(entry))
    .filter((value): value is string => Boolean(value))
    .map((value) => value.replace(/\\/g, "/"))
    .filter(isWorkspaceReviewPath);
}

function parseGitStatusPath(entry: string) {
  const value = entry.length >= 4 ? entry.slice(3).trim() : entry.trim();
  const renameSeparator = " -> ";
  return value.includes(renameSeparator) ? value.slice(value.lastIndexOf(renameSeparator) + renameSeparator.length) : value;
}

function isWorkspaceReviewPath(value: string) {
  return !/^(?:node_modules|dist|\.git|\.bun|vendor|coverage)(?:\/|$)/.test(value);
}

function isSuspiciousQualityFile(value: string) {
  return /(?:^|\/)(?:copy|old|backup|tmp|temp)[^/]*\.(?:ts|tsx|js|jsx)$/.test(value);
}

function buildCorrectiveExecutionPlan(basePlan: ExecutionPlan, gaps: CorrectnessGap[], readyPlan: PlannerReadyTurn): ExecutionPlan {
  const usesParallelCorrectiveWork = gaps.some((gap) => gap.canParallelize) && gaps.length > 1;
  const actualSubagentCount = usesParallelCorrectiveWork ? Math.min(10, gaps.length) : 0;
  const targetSubagentCount = gaps.some((gap) => gap.canParallelize) ? Math.min(10, Math.max(2, gaps.length)) : 0;
  return {
    ...basePlan,
    origin: "correctness-followup",
    iteration: basePlan.iteration + 1,
    difficultyScore: estimateCorrectiveDifficulty(gaps, actualSubagentCount),
    summary: gaps.map((gap) => gap.description).join(" "),
    finalExecutionBrief: ["Fix correctness gaps from prior implementation.", ...gaps.map((gap) => `${gap.category}: ${gap.suggestedFix}`)].join("\n"),
    route: usesParallelCorrectiveWork ? "pi-subagents" : "main",
    targetSubagentCount,
    actualSubagentCount,
    gating: {
      ...basePlan.gating,
      mode: resolveExecutionPlanGateMode(basePlan.mode, basePlan.gating.mode, actualSubagentCount)
    },
    prerequisites: basePlan.supervision ? basePlan.prerequisites : [],
    contracts: gaps.map((gap, index) => ({
      taskId: `correctness-${index + 1}`,
      title: gap.category === "runnable-gap" ? "Restore runnable output" : `Resolve ${gap.category}`,
      instruction: gap.suggestedFix,
      contribution: basePlan.supervision ? {
        outcome: basePlan.supervision.outcome, limitingFactor: gap.description, evidence: `Observed ${gap.category}: ${gap.description}`,
        expectedImprovement: gap.suggestedFix, stopWhen: "The same failure recurs without parent-outcome improvement; redirect instead of repeating the repair.",
      } : undefined,
      effortPoints: gap.severity === "high" ? 4 : gap.severity === "medium" ? 3 : 2,
      ownedPaths: gap.ownedPaths.length > 0 ? gap.ownedPaths : readyPlan.subtasks.flatMap((task) => task.id.split("+")).slice(0, 2),
      dependsOnPrerequisiteIds: basePlan.supervision ? basePlan.prerequisites.map(item => item.id) : [],
      deliverables: [gap.description],
      integrationPoints: [],
      verificationScope: basePlan.subagentWorktreeStrategy === "same-worktree" ? "owned-files-only" : "worktree-full",
      verificationCommands: [...new Set(basePlan.contracts.flatMap(contract => contract.verificationCommands))],
      mergeNotes: `Resolve correctness gap: ${gap.description}`
    }))
  };
}

function estimateCorrectiveDifficulty(gaps: CorrectnessGap[], actualSubagentCount: number) {
  const severityScore = gaps.reduce((score, gap) => score + (gap.severity === "high" ? 42 : gap.severity === "medium" ? 18 : 8), 0);
  return Math.max(1, Math.min(100, severityScore + (actualSubagentCount > 0 ? 18 : 0)));
}

import type { Assistant } from "./protocol/assistants";
import { intentContractSchema, type IntentContract } from "./protocol/conversation";
import type { BackgroundJob } from "./protocol/jobs-and-notifications";
import type { IntentArtifactType } from "./protocol/shared";

const DEFAULT_ALLOWED_ADAPTATION =
  "May adapt details within the user's requested scope. Inferred artifact types never authorize extra work or override explicit requirements and exclusions.";

const CODING_PATTERN =
  /\b(apps?|websites?|saas|frontend|backend|api|screens?|components?|software|code|database|solid|react|routes?|pages?)\b/i;
const AUTOMATION_PATTERN = /\b(automation|scripts?|tooling|factory|assistants?|agents?|jobs?|skills?|repeatable|workflows?)\b/i;
const RESEARCH_PATTERN = /\b(research|analy[sz]e|market|compare|scan|investigate|audit|review)\b/i;
const DOCUMENTATION_PATTERN = /\b(doc|docs|documentation|readme|notes|guide|catalog)\b/i;
const TEST_PATTERN = /\b(test|verify|verification|proof|evidence|smoke|typecheck)\b/i;
const QUESTION_PATTERN = /\b(question|ask|blocked|blocker|input needed|approval)\b/i;
const GENERIC_OBJECTIVE_PATTERN =
  /\b(short purpose summary|assistant-owned job created from project chat|project assistant created from thread prompt|global assistant created from thread prompt|no description provided|assistant state persisted)\b/i;
const CHANGE_REQUEST_PATTERN = /^(?:(?:please|then|also)\s+)*(?:builds?|implement|create|make|update|fix|repair|refactor|add|remove|maintain|produce|convert)\b/i;
const DOCUMENTATION_REQUEST_PATTERN = /^(?:(?:please|then|also)\s+)*(?:write|update|create|maintain|produce|fix|add)\s+(?:(?:a|the)\s+)?(?:doc|docs|documentation|readme|notes|guide|catalog)\b/i;
const DEPLOY_REQUEST_PATTERN = /^(?:(?:please|then|also)\s+)*(?:deploy|release|ship|launch)\b/i;
const NON_MUTATING_SCOPE_PATTERN = /\b(?:read[ -]only|(?:research|audit|review|analysis|report|documentation|docs)[ -]only|only (?:research|audit|review|analy[sz]e|report|document))\b/i;

type AssistantIntentSource = Pick<Assistant, "name" | "description" | "jobPrompt">;
type BackgroundJobIntentSource = Pick<BackgroundJob, "name" | "description" | "kind" | "definition">;

export function compileAssistantIntentContract(assistant: AssistantIntentSource): IntentContract {
  const sourcePrompt = joinSections([
    `Assistant: ${assistant.name}`,
    assistant.description ? `Description: ${assistant.description}` : undefined,
    `Job prompt: ${assistant.jobPrompt}`
  ]);

  return buildIntentContract({
    objective: chooseObjective([assistant.description, assistant.jobPrompt, assistant.name]),
    sourcePrompt,
    taskText: authoredTaskText([assistant.description, assistant.jobPrompt])
  });
}

export function compileBackgroundJobIntentContract(job: BackgroundJobIntentSource): IntentContract {
  const definitionPrompt = renderBackgroundJobDefinitionPrompt(job);
  const sourcePrompt = joinSections([
    `Background job: ${job.name}`,
    job.description ? `Description: ${job.description}` : undefined,
    `Definition prompt: ${definitionPrompt}`
  ]);

  return buildIntentContract({
    objective: chooseObjective([job.description, definitionPrompt, job.name]),
    sourcePrompt,
    taskText: authoredTaskText([job.description, job.definition.kind === "ai-routine" ? job.definition.prompt : undefined])
  });
}

export function normalizeIntentContract(contract: IntentContract): IntentContract {
  return intentContractSchema.parse({
    ...contract,
    objective: boundedText(contract.objective, 4000),
    sourcePrompt: boundedText(contract.sourcePrompt, 32000),
    deliverables: boundedUnique(contract.deliverables, 16, 512),
    artifactTypes: uniqueArtifactTypes(contract.artifactTypes).slice(0, 8),
    qualityBar: boundedUnique(contract.qualityBar, 16, 512),
    evidenceRequired: boundedUnique(contract.evidenceRequired, 16, 512),
    nonGoals: boundedUnique(contract.nonGoals, 16, 512),
    stopConditions: boundedUnique(contract.stopConditions, 16, 512),
    allowedAdaptation: boundedText(contract.allowedAdaptation, 2000)
  });
}

export function renderIntentContractPrompt(contract: IntentContract): string {
  const parsed = normalizeIntentContract(contract);
  return [
    "# INTENT CONTRACT",
    "This contract summarizes inferred intent. Explicit user requirements and exclusions remain authoritative; inferred artifact types do not authorize additional work.",
    `Objective: ${parsed.objective}`,
    `Artifact types: ${parsed.artifactTypes.join(", ")}`,
    renderList("Deliverables", parsed.deliverables),
    renderList("Quality bar", parsed.qualityBar),
    renderList("Evidence required", parsed.evidenceRequired),
    parsed.nonGoals.length > 0 ? renderList("Non-goals", parsed.nonGoals) : undefined,
    renderList("Stop conditions", parsed.stopConditions),
    `Allowed adaptation: ${parsed.allowedAdaptation}`,
    "",
    "# SOURCE PROMPT",
    boundedText(parsed.sourcePrompt, 4000)
  ]
    .filter((part): part is string => part !== undefined)
    .join("\n");
}

function buildIntentContract(input: { objective: string; sourcePrompt: string; taskText: string }) {
  const artifactTypes = inferArtifactTypes(input.taskText);
  const coding = artifactTypes.includes("app-code");
  const automation = artifactTypes.includes("automation-code");
  const research = artifactTypes.includes("research");
  const docsOnly = artifactTypes.includes("documentation") && !coding && !automation;
  const deployment = artifactTypes.includes("deployment");

  return normalizeIntentContract({
    objective: input.objective,
    sourcePrompt: input.sourcePrompt,
    deliverables: [
      coding ? "Working app or product code that advances the objective." : undefined,
      automation ? "Reusable automation, assistant job, skill, or script when work is repeatable." : undefined,
      research ? "Findings that answer the requested research or review question." : undefined,
      docsOnly ? "Documentation changes that directly satisfy the requested documentation outcome." : undefined,
      deployment ? "Small launch slice or release-ready increment." : undefined,
      "Evidence showing contract progress, remaining gap, or blocker."
    ].filter((value): value is string => Boolean(value)),
    artifactTypes,
    qualityBar: [
      coding ? "Prefer real behavior changes over prose-only updates." : undefined,
      automation ? "Make repeatable work executable where scope allows." : undefined,
      research ? "Separate evidence, uncertainty, and recommendations; implement only when requested." : undefined,
      docsOnly ? "Keep docs concise, current, and tied to source evidence." : undefined,
      "Respect repository conventions and keep changes scoped to the objective."
    ].filter((value): value is string => Boolean(value)),
    evidenceRequired: [
      coding || automation ? "Relevant tests, typecheck, smoke proof, or explicit blocker." : undefined,
      research ? "Source-backed findings with relevant limitations." : undefined,
      docsOnly ? "Docs changed plus source or blocker that makes docs the valid output." : undefined,
      "Summary of the requested outcome, evidence, and any remaining gap."
    ].filter((value): value is string => Boolean(value)),
    nonGoals: [
      coding || automation ? "Docs-only completion unless docs are requested or implementation is blocked." : undefined,
      "Additional implementation, automation, or deployment not requested by the user.",
      "Unbounded refactors outside the stated objective."
    ].filter((value): value is string => Boolean(value)),
    stopConditions: [
      "Deliverables are produced with required evidence.",
      "Work is blocked by missing user input, environment, or evidence and blocker is recorded.",
      "Further work would exceed the contract objective."
    ],
    allowedAdaptation: DEFAULT_ALLOWED_ADAPTATION
  });
}

function inferArtifactTypes(taskText: string): IntentArtifactType[] {
  const types: IntentArtifactType[] = [];
  // This is a bounded hint router, not a language parser or an authority grant.
  // Excluded clauses and display metadata must never manufacture deliverables.
  const nonMutating = NON_MUTATING_SCOPE_PATTERN.test(taskText);
  const clauses = taskText.split(/[.!?;\n]+/).flatMap((sentence) =>
    sentence.split(/\b(?:do not|don't|never|without|avoid|no|not to)\b/i)[0]!.split(/\b(?:and|then)\b/i)
  ).map((clause) => clause.trim().replace(/^(?:[-*:]\s*)+/, ""));
  for (const clause of clauses) {
    const change = CHANGE_REQUEST_PATTERN.test(clause);
    const research = RESEARCH_PATTERN.test(clause) && (!change || /\b(?:report|findings|analysis)\b/i.test(clause));
    const documentation = DOCUMENTATION_PATTERN.test(clause);
    if (research) types.push("research");
    if (documentation) types.push("documentation");
    if (!nonMutating && change && !research && !DOCUMENTATION_REQUEST_PATTERN.test(clause)) {
      if (CODING_PATTERN.test(clause)) types.push("app-code");
      if (AUTOMATION_PATTERN.test(clause)) types.push("automation-code");
    }
    if (!nonMutating && DEPLOY_REQUEST_PATTERN.test(clause)) types.push("deployment");
    if (TEST_PATTERN.test(clause)) types.push("test-evidence");
    if (QUESTION_PATTERN.test(clause)) types.push("question");
  }
  if (types.includes("app-code") || types.includes("automation-code")) {
    types.push("test-evidence");
  }
  return uniqueArtifactTypes(types.length > 0 ? types : ["unknown"]);
}

function authoredTaskText(parts: Array<string | undefined>) {
  return parts.filter((part) => part?.trim() && !GENERIC_OBJECTIVE_PATTERN.test(part)).join("\n");
}

function renderBackgroundJobDefinitionPrompt(job: BackgroundJobIntentSource) {
  if (job.definition.kind === "ai-routine") {
    return job.definition.prompt;
  }
  return `Shell command: ${[job.definition.executable, ...job.definition.args].join(" ")}`;
}

function chooseObjective(candidates: Array<string | undefined>) {
  const authored = candidates.filter((candidate): candidate is string => Boolean(candidate?.trim() && !GENERIC_OBJECTIVE_PATTERN.test(candidate)));
  // Prefer an actual task over a display summary, without rewarding coding words.
  const objective = authored.find((candidate) => NON_MUTATING_SCOPE_PATTERN.test(candidate)
    || /^(?:build|implement|create|make|update|fix|maintain|produce|ship|research|audit|review|compare|summarize)\b/i.test(candidate.trim())) ?? authored[0];
  return boundedText(objective ?? "Carry out the requested assistant or job work.", 4000);
}

function renderList(label: string, items: string[]) {
  return [`${label}:`, ...items.map((item) => `- ${item}`)].join("\n");
}

function joinSections(parts: Array<string | undefined>) {
  return boundedText(parts.map((part) => part?.trim()).filter((part): part is string => Boolean(part)).join("\n\n"), 32000);
}

function boundedText(value: string, maxLength: number) {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.slice(0, maxLength) || "Unspecified.";
}

function boundedUnique(values: string[], maxItems: number, maxLength: number) {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const value of values) {
    const bounded = boundedText(value, maxLength);
    const key = bounded.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    output.push(bounded);
    if (output.length >= maxItems) {
      break;
    }
  }
  return output.length > 0 ? output : ["Unspecified."];
}

function uniqueArtifactTypes(values: IntentArtifactType[]) {
  return [...new Set(values)];
}

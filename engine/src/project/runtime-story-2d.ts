import {
  createStoryCatalog,
  type DialogueSession,
  type DialogueSnapshot,
  type LocalizedDialogueView,
  type QuestSession,
  type QuestSnapshot,
  type StoryCommand,
  type StoryScalar,
  type StorySource,
} from "../content/story.ts";
import type { SaveJsonValue } from "../save/index.ts";
import type { PlayableProject2D } from "./runtime-2d.ts";
import type { PlayableSaveStateProvider2D } from "./runtime-save-2d.ts";

const MAX_STORY_ACTION_MAPPINGS = 512;
const MAX_PENDING_COMMANDS = 4_096;

export type PlayableStoryChoiceAction2D = { dialogueId: string; nodeId: string; choiceId: string; action: string };
export type PlayableStoryQuestEventAction2D = { questId: string; event: string; action: string; flags?: Record<string, StoryScalar> };

export type PlayableStoryDeclaration2D = {
  version: 1;
  source: StorySource;
  locale: string;
  variables: Record<string, StoryScalar>;
  flags: Record<string, StoryScalar>;
  entryDialogue: string;
  activeQuests: string[];
  advanceAction: string;
  choiceActions: PlayableStoryChoiceAction2D[];
  questEventActions: PlayableStoryQuestEventAction2D[];
};

export type PlayableStoryProject2D = PlayableProject2D & {
  extensions?: { hyperfocusStory?: unknown; [key: string]: unknown };
};

export type PlayableStorySnapshot2D = {
  version: 1;
  locale: string;
  dialogue: DialogueSnapshot;
  quests: QuestSnapshot[];
  previousActions: string[];
  pendingCommands: StoryCommand[];
};

export type PlayableStoryStepResult2D = {
  view: LocalizedDialogueView;
  commands: StoryCommand[];
  quests: QuestSnapshot[];
};

export type PlayableStoryDiagnostic2D = { severity: "error"; code: "invalid-story"; message: string };

export function readPlayableStoryDeclaration2D(project: PlayableStoryProject2D): PlayableStoryDeclaration2D | undefined {
  const raw = project.extensions?.hyperfocusStory;
  if (raw === undefined) return undefined;
  if (!isRecord(raw)) throw new Error("extensions.hyperfocusStory must be an object.");
  exactKeys(raw, ["activeQuests", "advanceAction", "choiceActions", "entryDialogue", "flags", "locale", "questEventActions", "source", "variables", "version"], "extensions.hyperfocusStory");
  if (raw.version !== 1) throw new Error(`Unsupported hyperfocusStory version: ${String(raw.version)}.`);
  if (!isRecord(raw.source)) throw new Error("Story source must be an object.");
  const source = structuredClone(raw.source) as StorySource;
  const catalog = createStoryCatalog(source, {
    maxLocales: 16,
    maxMessagesPerLocale: 10_000,
    maxDialogues: 256,
    maxNodesPerDialogue: 512,
    maxChoicesPerNode: 16,
    maxQuests: 256,
    maxStatesPerQuest: 256,
    maxCommandsPerTransition: 32,
  });
  const locale = id(raw.locale, "Story locale");
  const variables = scalarRecord(raw.variables, "Story variables");
  const flags = scalarRecord(raw.flags, "Story flags");
  const entryDialogue = id(raw.entryDialogue, "Story entryDialogue");
  if (!catalog.dialogueIds.includes(entryDialogue)) throw new Error(`Story entryDialogue references missing dialogue ${entryDialogue}.`);
  if (!Array.isArray(raw.activeQuests) || raw.activeQuests.length > 256) throw new Error("Story activeQuests must be a bounded array.");
  const activeQuests = raw.activeQuests.map((quest) => id(quest, "Active quest"));
  if (new Set(activeQuests).size !== activeQuests.length) throw new Error("Story activeQuests must be unique.");
  for (const quest of activeQuests) if (!catalog.questIds.includes(quest)) throw new Error(`Story activeQuests references missing quest ${quest}.`);
  const advanceAction = mappedAction(project, raw.advanceAction, "Story advanceAction");
  if (!Array.isArray(raw.choiceActions) || raw.choiceActions.length > MAX_STORY_ACTION_MAPPINGS) throw new Error("Story choiceActions must be a bounded array.");
  if (!Array.isArray(raw.questEventActions) || raw.questEventActions.length > MAX_STORY_ACTION_MAPPINGS) throw new Error("Story questEventActions must be a bounded array.");
  const choiceActions = raw.choiceActions.map((candidate, index) => normalizeChoiceAction(project, source, candidate, index));
  const questEventActions = raw.questEventActions.map((candidate, index) => normalizeQuestEventAction(project, source, candidate, index));
  const choiceTargets = choiceActions.map((mapping) => `${mapping.dialogueId}\0${mapping.nodeId}\0${mapping.choiceId}`);
  if (new Set(choiceTargets).size !== choiceTargets.length) throw new Error("Story choice action targets must be unique.");
  const questTargets = questEventActions.map((mapping) => `${mapping.questId}\0${mapping.event}`);
  if (new Set(questTargets).size !== questTargets.length) throw new Error("Story quest event action targets must be unique.");
  const actions = [advanceAction, ...choiceActions.map((mapping) => mapping.action), ...questEventActions.map((mapping) => mapping.action)];
  if (new Set(actions).size !== actions.length) throw new Error("Story action mappings must use distinct project actions.");
  return { version: 1, source, locale, variables, flags, entryDialogue, activeQuests, advanceAction, choiceActions, questEventActions };
}

export function validatePlayableStoryProject2D(project: PlayableStoryProject2D): void {
  readPlayableStoryDeclaration2D(project);
}

export function auditPlayableStoryProject2D(project: PlayableStoryProject2D): PlayableStoryDiagnostic2D[] {
  try {
    validatePlayableStoryProject2D(project);
    return [];
  } catch (cause) {
    return [{ severity: "error", code: "invalid-story", message: cause instanceof Error ? cause.message : String(cause) }];
  }
}

export class PlayableStoryController2D {
  readonly declaration: Readonly<PlayableStoryDeclaration2D>;
  readonly #catalog;
  #dialogue: DialogueSession;
  #quests = new Map<string, QuestSession>();
  #previousActions = new Set<string>();
  #pendingCommands: StoryCommand[] = [];

  constructor(project: PlayableStoryProject2D) {
    const declaration = readPlayableStoryDeclaration2D(project);
    if (!declaration) throw new Error("Project does not declare extensions.hyperfocusStory.");
    this.declaration = Object.freeze(structuredClone(declaration));
    this.#catalog = createStoryCatalog(declaration.source, {
      maxLocales: 16, maxMessagesPerLocale: 10_000, maxDialogues: 256, maxNodesPerDialogue: 512,
      maxChoicesPerNode: 16, maxQuests: 256, maxStatesPerQuest: 256, maxCommandsPerTransition: 32,
    });
    this.#dialogue = this.#newDialogue();
    for (const questId of declaration.activeQuests) this.#quests.set(questId, this.#catalog.startQuest(questId));
  }

  view(): LocalizedDialogueView { return structuredClone(this.#dialogue.view()); }

  questSnapshot(questId: string): QuestSnapshot | undefined {
    const snapshot = this.#quests.get(questId)?.snapshot();
    return snapshot ? structuredClone(snapshot) : undefined;
  }

  step(actions: Iterable<string> = []): PlayableStoryStepResult2D {
    const current = new Set(actions);
    const rising = new Set([...current].filter((action) => !this.#previousActions.has(action)));
    const commands: StoryCommand[] = [];
    const view = this.#dialogue.view();
    if (view.type === "choice") {
      const mapping = this.declaration.choiceActions.find((candidate) => candidate.dialogueId === this.declaration.entryDialogue && candidate.nodeId === view.id && rising.has(candidate.action));
      if (mapping) commands.push(...this.#dialogue.advance(mapping.choiceId), ...this.#settleActions());
    } else if (rising.has(this.declaration.advanceAction)) {
      commands.push(...this.#dialogue.advance(), ...this.#settleActions());
    }
    for (const mapping of this.declaration.questEventActions) {
      if (!rising.has(mapping.action)) continue;
      const quest = this.#quests.get(mapping.questId);
      if (!quest) throw new Error(`Story action references inactive quest ${mapping.questId}.`);
      commands.push(...quest.send(mapping.event, mapping.flags).commands);
    }
    this.#enqueue(commands);
    this.#previousActions = current;
    return { view: this.view(), commands: structuredClone(commands), quests: this.#questSnapshots() };
  }

  drainCommands(): StoryCommand[] {
    const commands = structuredClone(this.#pendingCommands);
    this.#pendingCommands.length = 0;
    return commands;
  }

  snapshot(): PlayableStorySnapshot2D {
    return {
      version: 1,
      locale: this.declaration.locale,
      dialogue: this.#dialogue.snapshot(),
      quests: this.#questSnapshots(),
      previousActions: [...this.#previousActions].sort(compareText),
      pendingCommands: structuredClone(this.#pendingCommands),
    };
  }

  restore(snapshot: PlayableStorySnapshot2D): PlayableStorySnapshot2D {
    if (!isRecord(snapshot) || snapshot.version !== 1 || snapshot.locale !== this.declaration.locale || !isRecord(snapshot.dialogue)) throw new Error("Playable story snapshot is invalid.");
    if (!Array.isArray(snapshot.quests) || snapshot.quests.length !== this.#quests.size || !Array.isArray(snapshot.previousActions) || !Array.isArray(snapshot.pendingCommands) || snapshot.pendingCommands.length > MAX_PENDING_COMMANDS) {
      throw new Error("Playable story snapshot collections are invalid.");
    }
    const dialogue = this.#newDialogue(snapshot.dialogue as DialogueSnapshot);
    const quests = new Map<string, QuestSession>();
    for (const candidate of snapshot.quests) {
      if (!isRecord(candidate) || typeof candidate.questId !== "string" || quests.has(candidate.questId) || !this.#quests.has(candidate.questId)) throw new Error("Playable story snapshot contains an unknown or duplicate quest.");
      quests.set(candidate.questId, this.#catalog.startQuest(candidate.questId, candidate as QuestSnapshot));
    }
    const declaredActions = new Set([this.declaration.advanceAction, ...this.declaration.choiceActions.map((mapping) => mapping.action), ...this.declaration.questEventActions.map((mapping) => mapping.action)]);
    if (quests.size !== this.#quests.size || snapshot.previousActions.some((action) => typeof action !== "string" || !declaredActions.has(action)) || new Set(snapshot.previousActions).size !== snapshot.previousActions.length) throw new Error("Playable story snapshot does not match its declaration.");
    for (const command of snapshot.pendingCommands) if (!isRecord(command) || typeof command.type !== "string" || !command.type) throw new Error("Playable story snapshot contains an invalid pending command.");
    const pending = jsonClone(snapshot.pendingCommands) as StoryCommand[];
    this.#dialogue = dialogue;
    this.#quests = quests;
    this.#previousActions = new Set(snapshot.previousActions);
    this.#pendingCommands = pending;
    return this.snapshot();
  }

  saveStateProvider(): PlayableSaveStateProvider2D {
    return {
      key: "story",
      snapshot: () => jsonClone(this.snapshot()),
      restore: (snapshot) => { this.restore(structuredClone(snapshot) as unknown as PlayableStorySnapshot2D); },
    };
  }

  #newDialogue(snapshot?: DialogueSnapshot) {
    return this.#catalog.startDialogue(this.declaration.entryDialogue, {
      locale: this.declaration.locale,
      variables: this.declaration.variables,
      flags: this.declaration.flags,
      ...(snapshot ? { snapshot } : {}),
    });
  }

  #settleActions() {
    const commands: StoryCommand[] = [];
    for (let count = 0; count < 512; count += 1) {
      if (this.#dialogue.view().type !== "action") return commands;
      commands.push(...this.#dialogue.advance());
    }
    throw new Error("Dialogue action chain exceeds 512 nodes.");
  }

  #questSnapshots() { return [...this.#quests.values()].map((quest) => quest.snapshot()).sort((a, b) => compareText(a.questId, b.questId)); }

  #enqueue(commands: readonly StoryCommand[]) {
    if (this.#pendingCommands.length + commands.length > MAX_PENDING_COMMANDS) throw new Error(`Playable story command queue exceeds ${MAX_PENDING_COMMANDS}; the host must drain commands.`);
    this.#pendingCommands.push(...structuredClone(commands));
  }
}

export function createPlayableStoryController2D(project: PlayableStoryProject2D) {
  return new PlayableStoryController2D(project);
}

function normalizeChoiceAction(project: PlayableStoryProject2D, source: StorySource, value: unknown, index: number): PlayableStoryChoiceAction2D {
  if (!isRecord(value)) throw new Error(`Story choiceActions[${index}] must be an object.`);
  exactKeys(value, ["action", "choiceId", "dialogueId", "nodeId"], `Story choiceActions[${index}]`);
  const dialogueId = id(value.dialogueId, "Story choice dialogueId");
  const nodeId = id(value.nodeId, "Story choice nodeId");
  const choiceId = id(value.choiceId, "Story choice choiceId");
  const node = source.dialogues?.find((dialogue) => dialogue.id === dialogueId)?.nodes.find((candidate) => candidate.id === nodeId);
  if (node?.type !== "choice" || !node.options.some((option) => option.id === choiceId)) throw new Error(`Story choice action references missing choice ${dialogueId}/${nodeId}/${choiceId}.`);
  return { dialogueId, nodeId, choiceId, action: mappedAction(project, value.action, "Story choice action") };
}

function normalizeQuestEventAction(project: PlayableStoryProject2D, source: StorySource, value: unknown, index: number): PlayableStoryQuestEventAction2D {
  if (!isRecord(value)) throw new Error(`Story questEventActions[${index}] must be an object.`);
  const allowed = value.flags === undefined ? ["action", "event", "questId"] : ["action", "event", "flags", "questId"];
  exactKeys(value, allowed, `Story questEventActions[${index}]`);
  const questId = id(value.questId, "Story quest event questId");
  const event = id(value.event, "Story quest event");
  const graph = source.quests?.find((quest) => quest.id === questId);
  if (!graph?.states.some((state) => state.transitions?.some((transition) => transition.event === event))) throw new Error(`Story quest action references missing event ${questId}/${event}.`);
  return { questId, event, action: mappedAction(project, value.action, "Story quest event action"), ...(value.flags === undefined ? {} : { flags: scalarRecord(value.flags, "Story quest event flags") }) };
}

function mappedAction(project: PlayableStoryProject2D, value: unknown, label: string) {
  const action = id(value, label);
  if (!project.settings.input.some((mapping) => mapping.action === action)) throw new Error(`${label} references unmapped project action ${action}.`);
  return action;
}

function scalarRecord(value: unknown, label: string): Record<string, StoryScalar> {
  if (!isRecord(value) || Object.keys(value).length > 128) throw new Error(`${label} must be a bounded scalar object.`);
  const result: Record<string, StoryScalar> = {};
  for (const [key, candidate] of Object.entries(value)) {
    id(key, `${label} key`);
    if (candidate !== null && typeof candidate !== "string" && typeof candidate !== "boolean" && (typeof candidate !== "number" || !Number.isFinite(candidate))) throw new Error(`${label}.${key} must be a finite scalar.`);
    result[key] = candidate as StoryScalar;
  }
  return result;
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[], label: string) {
  const actual = Object.keys(value).sort(compareText);
  const sorted = [...expected].sort(compareText);
  if (actual.length !== sorted.length || actual.some((key, index) => key !== sorted[index])) throw new Error(`${label} has unknown or missing fields.`);
}

function id(value: unknown, label: string): string {
  if (typeof value !== "string" || !value || value.length > 256 || /[\u0000-\u001f]/.test(value)) throw new Error(`${label} is invalid.`);
  return value;
}

function jsonClone(value: unknown): SaveJsonValue { return JSON.parse(JSON.stringify(value)) as SaveJsonValue; }
function isRecord(value: unknown): value is Record<string, unknown> { return Boolean(value && typeof value === "object" && !Array.isArray(value)); }
function compareText(a: string, b: string) { return a < b ? -1 : a > b ? 1 : 0; }

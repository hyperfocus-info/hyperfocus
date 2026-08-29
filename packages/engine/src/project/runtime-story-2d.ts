import {
  createStoryCatalog,
  type DialogueSnapshot,
  type LocalizedDialogueView,
  type QuestSnapshot,
  type StoryCommand,
  type StoryScalar,
  type StorySource,
} from "../content/story.ts";
import { normalizeSaveJson, type SaveJsonValue } from "../save/index.ts";
import type { PlayableProject2D } from "./runtime-2d-contracts.ts";
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
  const source: unknown = structuredClone(raw.source);
  if (!isStorySourceShape(source)) throw new Error("Story source shape is invalid.");
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

export function createPlayableStoryController2D(project: PlayableStoryProject2D) {
    const parsedDeclaration = readPlayableStoryDeclaration2D(project);
    if (!parsedDeclaration) throw new Error("Project does not declare extensions.hyperfocusStory.");
    const declaration = Object.freeze(structuredClone(parsedDeclaration));
    const catalog = createStoryCatalog(declaration.source, {
      maxLocales: 16, maxMessagesPerLocale: 10_000, maxDialogues: 256, maxNodesPerDialogue: 512,
      maxChoicesPerNode: 16, maxQuests: 256, maxStatesPerQuest: 256, maxCommandsPerTransition: 32,
    });
    const newDialogue = (snapshot?: DialogueSnapshot) => catalog.startDialogue(declaration.entryDialogue, {
      locale: declaration.locale,
      variables: declaration.variables,
      flags: declaration.flags,
      ...(snapshot ? { snapshot } : {}),
    });
    let dialogue = newDialogue();
    let quests = new Map(declaration.activeQuests.map((questId) => [questId, catalog.startQuest(questId)]));
    let previousActions = new Set<string>();
    let pendingCommands: StoryCommand[] = [];

  const questSnapshots = () => [...quests.values()].map((quest) => quest.snapshot()).sort((a, b) => compareText(a.questId, b.questId));
  const view = (): LocalizedDialogueView => structuredClone(dialogue.view());
  const enqueue = (commands: readonly StoryCommand[]) => {
    if (pendingCommands.length + commands.length > MAX_PENDING_COMMANDS) throw new Error(`Playable story command queue exceeds ${MAX_PENDING_COMMANDS}; the host must drain commands.`);
    pendingCommands.push(...structuredClone(commands));
  };
  const settleActions = () => {
    const commands: StoryCommand[] = [];
    for (let count = 0; count < 512; count += 1) {
      if (dialogue.view().type !== "action") return commands;
      commands.push(...dialogue.advance());
    }
    throw new Error("Dialogue action chain exceeds 512 nodes.");
  };

  const snapshot = (): PlayableStorySnapshot2D => ({
    version: 1,
    locale: declaration.locale,
    dialogue: dialogue.snapshot(),
    quests: questSnapshots(),
    previousActions: [...previousActions].sort(compareText),
    pendingCommands: structuredClone(pendingCommands),
  });

  const restore = (value: unknown): PlayableStorySnapshot2D => {
    const restored = parseStorySnapshot(value);
    if (restored.locale !== declaration.locale) throw new Error("Playable story snapshot is invalid.");
    if (restored.quests.length !== quests.size) throw new Error("Playable story snapshot collections are invalid.");
    const restoredDialogue = newDialogue(restored.dialogue);
    const restoredQuests = new Map<string, ReturnType<typeof catalog.startQuest>>();
    for (const candidate of restored.quests) {
      if (restoredQuests.has(candidate.questId) || !quests.has(candidate.questId)) throw new Error("Playable story snapshot contains an unknown or duplicate quest.");
      restoredQuests.set(candidate.questId, catalog.startQuest(candidate.questId, candidate));
    }
    const declaredActions = new Set([declaration.advanceAction, ...declaration.choiceActions.map((mapping) => mapping.action), ...declaration.questEventActions.map((mapping) => mapping.action)]);
    if (restoredQuests.size !== quests.size || restored.previousActions.some((action) => !declaredActions.has(action)) || new Set(restored.previousActions).size !== restored.previousActions.length) {
      throw new Error("Playable story snapshot does not match its declaration.");
    }
    dialogue = restoredDialogue;
    quests = restoredQuests;
    previousActions = new Set(restored.previousActions);
    pendingCommands = structuredClone(restored.pendingCommands);
    return snapshot();
  };

  return Object.freeze({
    declaration,
    view,
    snapshot,
    restore,
    questSnapshot(questId: string): QuestSnapshot | undefined {
      const snapshot = quests.get(questId)?.snapshot();
      return snapshot ? structuredClone(snapshot) : undefined;
    },
    step(actions: Iterable<string> = []): PlayableStoryStepResult2D {
    const current = new Set(actions);
    const rising = new Set([...current].filter((action) => !previousActions.has(action)));
    const commands: StoryCommand[] = [];
    const currentView = dialogue.view();
    if (currentView.type === "choice") {
      const mapping = declaration.choiceActions.find((candidate) => candidate.dialogueId === declaration.entryDialogue && candidate.nodeId === currentView.id && rising.has(candidate.action));
      if (mapping) commands.push(...dialogue.advance(mapping.choiceId), ...settleActions());
    } else if (rising.has(declaration.advanceAction)) {
      commands.push(...dialogue.advance(), ...settleActions());
    }
    for (const mapping of declaration.questEventActions) {
      if (!rising.has(mapping.action)) continue;
      const quest = quests.get(mapping.questId);
      if (!quest) throw new Error(`Story action references inactive quest ${mapping.questId}.`);
      commands.push(...quest.send(mapping.event, mapping.flags).commands);
    }
    enqueue(commands);
    previousActions = current;
    return { view: view(), commands: structuredClone(commands), quests: questSnapshots() };
    },

    drainCommands(): StoryCommand[] {
      const commands = structuredClone(pendingCommands);
      pendingCommands.length = 0;
      return commands;
    },

    saveStateProvider(): PlayableSaveStateProvider2D {
      return {
        key: "story",
        snapshot: () => jsonClone(snapshot()),
        restore,
      };
    },
  });
}

export type PlayableStoryController2D = ReturnType<typeof createPlayableStoryController2D>;

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
    if (!isStoryScalar(candidate)) throw new Error(`${label}.${key} must be a finite scalar.`);
    result[key] = candidate;
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

function isStoryScalar(value: unknown): value is StoryScalar {
  return value === null || typeof value === "string" || typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value));
}

function isStorySourceShape(value: unknown): value is StorySource {
  if (!isRecord(value) || typeof value.defaultLocale !== "string" || !Array.isArray(value.locales)) return false;
  if (!value.locales.every((locale) => isRecord(locale) && typeof locale.locale === "string" && isRecord(locale.messages))) return false;
  if (value.dialogues !== undefined && (!Array.isArray(value.dialogues) || !value.dialogues.every((dialogue) => {
    if (!isRecord(dialogue) || typeof dialogue.id !== "string" || typeof dialogue.start !== "string" || !Array.isArray(dialogue.nodes)) return false;
    return dialogue.nodes.every((node) => isRecord(node) && typeof node.id === "string" && typeof node.type === "string");
  }))) return false;
  if (value.quests !== undefined && (!Array.isArray(value.quests) || !value.quests.every((quest) => {
    if (!isRecord(quest) || typeof quest.id !== "string" || typeof quest.start !== "string" || !Array.isArray(quest.states)) return false;
    return quest.states.every((state) => isRecord(state) && typeof state.id === "string");
  }))) return false;
  return true;
}

function isDialogueSnapshot(value: unknown): value is DialogueSnapshot {
  return isRecord(value)
    && value.version === 1
    && typeof value.dialogueId === "string"
    && typeof value.nodeId === "string"
    && typeof value.complete === "boolean";
}

function isQuestSnapshot(value: unknown): value is QuestSnapshot {
  return isRecord(value)
    && value.version === 1
    && typeof value.questId === "string"
    && typeof value.stateId === "string"
    && typeof value.complete === "boolean"
    && typeof value.revision === "number"
    && Number.isSafeInteger(value.revision)
    && value.revision >= 0;
}

function isContentValue(value: unknown, ancestors = new WeakSet<object>()): boolean {
  if (isStoryScalar(value)) return true;
  if (typeof value !== "object" || value === null || ancestors.has(value)) return false;
  ancestors.add(value);
  const valid = Array.isArray(value)
    ? value.every((entry) => isContentValue(entry, ancestors))
    : Object.values(value).every((entry) => isContentValue(entry, ancestors));
  ancestors.delete(value);
  return valid;
}

function isStoryCommand(value: unknown): value is StoryCommand {
  return isRecord(value)
    && typeof value.type === "string"
    && value.type.length > 0
    && (value.data === undefined || (isRecord(value.data) && isContentValue(value.data)));
}

function parseStorySnapshot(value: unknown): PlayableStorySnapshot2D {
  if (!isRecord(value) || value.version !== 1 || typeof value.locale !== "string" || !isDialogueSnapshot(value.dialogue)) {
    throw new Error("Playable story snapshot is invalid.");
  }
  if (!Array.isArray(value.quests) || !value.quests.every(isQuestSnapshot)
    || !Array.isArray(value.previousActions) || value.previousActions.some((action) => typeof action !== "string")
    || !Array.isArray(value.pendingCommands) || value.pendingCommands.length > MAX_PENDING_COMMANDS || !value.pendingCommands.every(isStoryCommand)) {
    throw new Error("Playable story snapshot collections are invalid.");
  }
  return {
    version: 1,
    locale: value.locale,
    dialogue: structuredClone(value.dialogue),
    quests: structuredClone(value.quests),
    previousActions: [...value.previousActions],
    pendingCommands: structuredClone(value.pendingCommands)
  };
}

function jsonClone(value: unknown): SaveJsonValue { return normalizeSaveJson(value); }
function isRecord(value: unknown): value is Record<string, unknown> { return Boolean(value && typeof value === "object" && !Array.isArray(value)); }
function compareText(a: string, b: string) { return a < b ? -1 : a > b ? 1 : 0; }

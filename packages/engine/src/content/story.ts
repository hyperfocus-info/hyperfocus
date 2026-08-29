import type { ContentValue } from "./scene-prefab.ts";

export type StoryScalar = string | number | boolean | null;
export type StoryVariables = Readonly<Record<string, StoryScalar>>;
export type LocalizedMessage = string | { zero?: string; one: string; other: string };
export type LocalizationBundle = { locale: string; messages: Record<string, LocalizedMessage> };

export type StoryCondition = { key: string; equals: StoryScalar };
export type StoryCommand = { type: string; data?: Record<string, ContentValue> };

export type DialogueLineNode = {
  id: string;
  type: "line";
  textKey: string;
  speaker?: string;
  next?: string;
};

export type DialogueChoice = {
  id: string;
  textKey: string;
  next: string;
  condition?: StoryCondition;
  commands?: StoryCommand[];
};

export type DialogueChoiceNode = { id: string; type: "choice"; options: DialogueChoice[] };
export type DialogueActionNode = { id: string; type: "action"; command: StoryCommand; next?: string };
export type DialogueEndNode = { id: string; type: "end" };
export type DialogueNode = DialogueLineNode | DialogueChoiceNode | DialogueActionNode | DialogueEndNode;
export type DialogueGraph = { id: string; start: string; nodes: DialogueNode[] };

export type QuestTransition = {
  event: string;
  target: string;
  condition?: StoryCondition;
  commands?: StoryCommand[];
};
export type QuestState = { id: string; terminal?: boolean; transitions?: QuestTransition[] };
export type QuestGraph = { id: string; start: string; states: QuestState[] };

export type StorySource = {
  defaultLocale: string;
  locales: LocalizationBundle[];
  dialogues?: DialogueGraph[];
  quests?: QuestGraph[];
};

export type StoryLimits = {
  maxLocales?: number;
  maxMessagesPerLocale?: number;
  maxDialogues?: number;
  maxNodesPerDialogue?: number;
  maxChoicesPerNode?: number;
  maxQuests?: number;
  maxStatesPerQuest?: number;
  maxCommandsPerTransition?: number;
};

export type LocalizedDialogueView =
  | { id: string; type: "line"; text: string; speaker?: string }
  | { id: string; type: "choice"; options: Array<{ id: string; text: string }> }
  | { id: string; type: "action"; command: StoryCommand }
  | { id: string; type: "end" };

export type DialogueSnapshot = { version: 1; dialogueId: string; nodeId: string; complete: boolean };
export type QuestSnapshot = { version: 1; questId: string; stateId: string; complete: boolean; revision: number };

const DEFAULT_LIMITS: Required<StoryLimits> = {
  maxLocales: 64,
  maxMessagesPerLocale: 50_000,
  maxDialogues: 4_096,
  maxNodesPerDialogue: 4_096,
  maxChoicesPerNode: 64,
  maxQuests: 4_096,
  maxStatesPerQuest: 2_048,
  maxCommandsPerTransition: 128,
};

export function createStoryCatalog(sourceInput: StorySource, limitsInput: StoryLimits = {}) {
  const limits = resolveLimits(limitsInput);
  const source = structuredClone(sourceInput);
  const locales = new Map<string, Map<string, LocalizedMessage>>();
  const dialogues = new Map<string, DialogueGraph>();
  const dialogueNodes = new Map<string, Map<string, DialogueNode>>();
  const quests = new Map<string, QuestGraph>();
  const questStates = new Map<string, Map<string, QuestState>>();

  const format = (locale: string, key: string, variables: StoryVariables = {}) => {
    const message = locales.get(locale)?.get(key) ?? locales.get(source.defaultLocale)?.get(key);
    if (message === undefined) throw new Error(`Missing localized message: ${key}`);
    const template = typeof message === "string"
      ? message
      : selectPlural(message, variables.count);
    return template.replace(/\{([A-Za-z][A-Za-z0-9_.-]{0,127})\}/g, (_, name: string) => {
      if (!Object.hasOwn(variables, name)) throw new Error(`Missing localization variable ${name} for ${key}`);
      const value = variables[name];
      if (value === null) return "";
      return String(value);
    });
  };

  const assertTextKey = (key: string, owner: string) => {
    assertId(key, `Text key in ${owner}`);
    if (!locales.get(source.defaultLocale)?.has(key)) throw new Error(`${owner} references missing default-locale message ${key}`);
  };

  const validateDialogue = (graph: DialogueGraph) => {
    assertId(graph.id, "Dialogue id");
    if (dialogues.has(graph.id)) throw new Error(`Duplicate dialogue: ${graph.id}`);
    if (!Array.isArray(graph.nodes) || graph.nodes.length === 0 || graph.nodes.length > limits.maxNodesPerDialogue) {
      throw new RangeError(`Dialogue ${graph.id} has an invalid node count`);
    }
    const nodes = new Map<string, DialogueNode>();
    for (const node of graph.nodes) {
      assertId(node.id, `Node id in ${graph.id}`);
      if (nodes.has(node.id)) throw new Error(`Duplicate dialogue node: ${graph.id}/${node.id}`);
      nodes.set(node.id, node);
    }
    if (!nodes.has(graph.start)) throw new Error(`Dialogue ${graph.id} starts at missing node ${graph.start}`);
    for (const node of graph.nodes) {
      if (node.type === "line") {
        assertTextKey(node.textKey, graph.id);
        if (node.next !== undefined) assertReference(nodes, node.next, `Dialogue ${graph.id}/${node.id}`);
      } else if (node.type === "choice") {
        if (!node.options.length || node.options.length > limits.maxChoicesPerNode) throw new RangeError(`Dialogue choice ${graph.id}/${node.id} has an invalid option count`);
        const optionIds = new Set<string>();
        for (const option of node.options) {
          assertId(option.id, `Choice id in ${graph.id}/${node.id}`);
          if (optionIds.has(option.id)) throw new Error(`Duplicate choice ${graph.id}/${node.id}/${option.id}`);
          optionIds.add(option.id);
          assertTextKey(option.textKey, graph.id);
          assertReference(nodes, option.next, `Choice ${graph.id}/${node.id}/${option.id}`);
          validateCondition(option.condition);
          validateCommands(option.commands, limits.maxCommandsPerTransition);
        }
      } else if (node.type === "action") {
        validateCommand(node.command);
        if (node.next !== undefined) assertReference(nodes, node.next, `Dialogue ${graph.id}/${node.id}`);
      } else if (node.type !== "end") {
        throw new TypeError(`Unsupported dialogue node type in ${graph.id}`);
      }
    }
    dialogues.set(graph.id, graph);
    dialogueNodes.set(graph.id, nodes);
  };

  const validateQuest = (graph: QuestGraph) => {
    assertId(graph.id, "Quest id");
    if (quests.has(graph.id)) throw new Error(`Duplicate quest: ${graph.id}`);
    if (!Array.isArray(graph.states) || graph.states.length === 0 || graph.states.length > limits.maxStatesPerQuest) {
      throw new RangeError(`Quest ${graph.id} has an invalid state count`);
    }
    const states = new Map<string, QuestState>();
    for (const state of graph.states) {
      assertId(state.id, `State id in ${graph.id}`);
      if (states.has(state.id)) throw new Error(`Duplicate quest state: ${graph.id}/${state.id}`);
      states.set(state.id, state);
    }
    if (!states.has(graph.start)) throw new Error(`Quest ${graph.id} starts at missing state ${graph.start}`);
    for (const state of graph.states) {
      const events = new Set<string>();
      if (state.terminal && state.transitions?.length) throw new Error(`Terminal quest state ${graph.id}/${state.id} cannot have transitions`);
      for (const transition of state.transitions ?? []) {
        assertId(transition.event, `Quest event in ${graph.id}/${state.id}`);
        if (events.has(transition.event)) throw new Error(`Quest ${graph.id}/${state.id} has ambiguous event ${transition.event}`);
        events.add(transition.event);
        assertReference(states, transition.target, `Quest ${graph.id}/${state.id}`);
        validateCondition(transition.condition);
        validateCommands(transition.commands, limits.maxCommandsPerTransition);
      }
    }
    quests.set(graph.id, graph);
    questStates.set(graph.id, states);
  };

  assertId(source.defaultLocale, "Default locale");
  if (!Array.isArray(source.locales) || source.locales.length === 0 || source.locales.length > limits.maxLocales) {
    throw new RangeError(`Locale count must be between 1 and ${limits.maxLocales}`);
  }
  for (const bundle of source.locales) {
    assertId(bundle.locale, "Locale");
    if (locales.has(bundle.locale)) throw new Error(`Duplicate locale: ${bundle.locale}`);
    const entries = Object.entries(bundle.messages ?? {});
    if (entries.length > limits.maxMessagesPerLocale) throw new RangeError(`Locale ${bundle.locale} exceeds its message limit`);
    const messages = new Map<string, LocalizedMessage>();
    for (const [key, message] of entries) {
      assertId(key, "Localization key");
      validateMessage(message, `${bundle.locale}/${key}`);
      messages.set(key, message);
    }
    locales.set(bundle.locale, messages);
  }
  if (!locales.has(source.defaultLocale)) throw new Error(`Default locale is missing: ${source.defaultLocale}`);
  const sourceDialogues = source.dialogues ?? [];
  if (sourceDialogues.length > limits.maxDialogues) throw new RangeError("Dialogue count exceeds its limit");
  for (const graph of sourceDialogues) validateDialogue(graph);
  const sourceQuests = source.quests ?? [];
  if (sourceQuests.length > limits.maxQuests) throw new RangeError("Quest count exceeds its limit");
  for (const graph of sourceQuests) validateQuest(graph);

  return Object.freeze({
    get localeIds() { return [...locales.keys()]; },
    get dialogueIds() { return [...dialogues.keys()]; },
    get questIds() { return [...quests.keys()]; },
    format,
    startDialogue(dialogueId: string, options: { locale?: string; variables?: StoryVariables; flags?: StoryVariables; snapshot?: DialogueSnapshot } = {}) {
      const graph = dialogues.get(dialogueId);
      const nodes = dialogueNodes.get(dialogueId);
      if (!graph || !nodes) throw new Error(`Unknown dialogue: ${dialogueId}`);
      return createDialogueSession(format, graph, nodes, options);
    },
    startQuest(questId: string, snapshot?: QuestSnapshot) {
      const graph = quests.get(questId);
      const states = questStates.get(questId);
      if (!graph || !states) throw new Error(`Unknown quest: ${questId}`);
      return createQuestSession(graph, states, snapshot);
    },
  });
}

export type StoryCatalog = ReturnType<typeof createStoryCatalog>;

function createDialogueSession(
  format: StoryCatalog["format"],
  graph: DialogueGraph,
  nodes: ReadonlyMap<string, DialogueNode>,
  options: { locale?: string; variables?: StoryVariables; flags?: StoryVariables; snapshot?: DialogueSnapshot },
) {
    let nodeId: string;
    let complete = false;
    const snapshot = options.snapshot;
    if (snapshot) {
      if (snapshot.version !== 1 || snapshot.dialogueId !== graph.id || !nodes.has(snapshot.nodeId) || typeof snapshot.complete !== "boolean") {
        throw new Error(`Invalid dialogue snapshot for ${graph.id}`);
      }
      nodeId = snapshot.nodeId;
      complete = snapshot.complete;
    } else nodeId = graph.start;
    const locale = options.locale ?? "";
    const variables = { ...(options.variables ?? {}) };
    const flags = { ...(options.flags ?? {}) };

  const view = (): LocalizedDialogueView => {
    const node = nodes.get(nodeId);
    if (!node) throw new Error(`Dialogue ${graph.id} points to missing node ${nodeId}`);
    if (node.type === "line") {
      return { id: node.id, type: "line", text: format(locale, node.textKey, variables), ...(node.speaker ? { speaker: node.speaker } : {}) };
    }
    if (node.type === "choice") {
      return {
        id: node.id,
        type: "choice",
        options: node.options.filter((option) => matches(option.condition, flags)).map((option) => ({
          id: option.id,
          text: format(locale, option.textKey, variables),
        })),
      };
    }
    if (node.type === "action") return { id: node.id, type: "action", command: structuredClone(node.command) };
    return { id: node.id, type: "end" };
  };

  const advance = (choiceId?: string): StoryCommand[] => {
    if (complete) return [];
    const node = nodes.get(nodeId);
    if (!node) throw new Error(`Dialogue ${graph.id} points to missing node ${nodeId}`);
    if (node.type === "end") {
      complete = true;
      return [];
    }
    if (node.type === "choice") {
      const option = node.options.find((candidate) => candidate.id === choiceId && matches(candidate.condition, flags));
      if (!option) throw new Error(`Choice is unavailable in ${graph.id}/${node.id}: ${String(choiceId)}`);
      nodeId = option.next;
      return structuredClone(option.commands ?? []);
    }
    nodeId = node.next ?? node.id;
    if (node.next === undefined) complete = true;
    return node.type === "action" ? [structuredClone(node.command)] : [];
  };

  return Object.freeze({
    view,
    advance,
    snapshot(): DialogueSnapshot { return { version: 1, dialogueId: graph.id, nodeId, complete }; },
  });
}

export type DialogueSession = ReturnType<typeof createDialogueSession>;

function createQuestSession(graph: QuestGraph, states: ReadonlyMap<string, QuestState>, snapshot?: QuestSnapshot) {
    let stateId: string;
    let revision = 0;
    if (snapshot) {
      const state = states.get(snapshot.stateId);
      if (snapshot.version !== 1 || snapshot.questId !== graph.id || !state || !Number.isSafeInteger(snapshot.revision) || snapshot.revision < 0 || typeof snapshot.complete !== "boolean" || snapshot.complete !== (state.terminal === true)) {
        throw new Error(`Invalid quest snapshot for ${graph.id}`);
      }
      stateId = snapshot.stateId;
      revision = snapshot.revision;
    } else stateId = graph.start;

  return Object.freeze({
    send(event: string, flags: StoryVariables = {}): { changed: boolean; commands: StoryCommand[] } {
    assertId(event, "Quest event");
    const state = states.get(stateId);
    if (!state) throw new Error(`Quest ${graph.id} points to missing state ${stateId}`);
    const transition = state.transitions?.find((candidate) => candidate.event === event && matches(candidate.condition, flags));
    if (!transition) return { changed: false, commands: [] };
    stateId = transition.target;
    revision += 1;
    return { changed: true, commands: structuredClone(transition.commands ?? []) };
    },

    snapshot(): QuestSnapshot {
      const state = states.get(stateId);
      if (!state) throw new Error(`Quest ${graph.id} points to missing state ${stateId}`);
      return { version: 1, questId: graph.id, stateId, complete: state.terminal === true, revision };
    },
  });
}

export type QuestSession = ReturnType<typeof createQuestSession>;

function selectPlural(message: Exclude<LocalizedMessage, string>, count: StoryScalar | undefined) {
  if (typeof count !== "number" || !Number.isFinite(count)) throw new Error("Plural messages require a finite numeric count variable");
  if (count === 0 && message.zero !== undefined) return message.zero;
  return count === 1 ? message.one : message.other;
}

function matches(condition: StoryCondition | undefined, flags: StoryVariables) {
  return !condition || (Object.hasOwn(flags, condition.key) && flags[condition.key] === condition.equals);
}

function validateMessage(message: LocalizedMessage, owner: string) {
  if (typeof message === "string") {
    if (message.length > 100_000) throw new RangeError(`Localized message is too long: ${owner}`);
    return;
  }
  if (!message || typeof message.one !== "string" || typeof message.other !== "string" || (message.zero !== undefined && typeof message.zero !== "string")) {
    throw new TypeError(`Invalid plural message: ${owner}`);
  }
}

function validateCondition(condition: StoryCondition | undefined) {
  if (!condition) return;
  assertId(condition.key, "Condition key");
  if (condition.equals !== null && !["string", "number", "boolean"].includes(typeof condition.equals)) throw new TypeError("Condition values must be scalar");
  if (typeof condition.equals === "number" && !Number.isFinite(condition.equals)) throw new TypeError("Condition numbers must be finite");
}

function validateCommands(commands: StoryCommand[] | undefined, maximum: number) {
  if (!commands) return;
  if (!Array.isArray(commands) || commands.length > maximum) throw new RangeError(`Command count exceeds ${maximum}`);
  for (const command of commands) validateCommand(command);
}

function validateCommand(command: StoryCommand) {
  assertId(command?.type, "Command type");
  if (command.data !== undefined) validatePortableValue(command.data, 0, { nodes: 0 });
}

function validatePortableValue(value: unknown, depth: number, state: { nodes: number }) {
  state.nodes += 1;
  if (state.nodes > 10_000) throw new RangeError("Command data exceeds 10,000 values");
  if (depth > 32) throw new RangeError("Command data exceeds 32 levels");
  if (value === null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("Command data numbers must be finite");
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) validatePortableValue(item, depth + 1, state);
    return;
  }
  if (typeof value !== "object" || Object.getPrototypeOf(value) !== Object.prototype) throw new TypeError("Command data must contain only portable JSON values");
  for (const [key, item] of Object.entries(value)) {
    assertId(key, "Command data key");
    validatePortableValue(item, depth + 1, state);
  }
}

function assertReference<T>(entries: ReadonlyMap<string, T>, id: string, owner: string) {
  if (!entries.has(id)) throw new Error(`${owner} references missing id ${id}`);
}

function assertId(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > 256 || /[\u0000-\u001f]/.test(value)) throw new Error(`${label} is invalid`);
}

function resolveLimits(limits: StoryLimits): Required<StoryLimits> {
  const result = { ...DEFAULT_LIMITS, ...limits };
  for (const [name, value] of Object.entries(result)) {
    if (!Number.isSafeInteger(value) || value <= 0) throw new RangeError(`${name} must be a positive safe integer`);
  }
  return result;
}

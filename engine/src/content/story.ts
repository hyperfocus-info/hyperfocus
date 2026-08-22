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

export class StoryCatalog {
  private readonly source: StorySource;
  private readonly limits: Required<StoryLimits>;
  private readonly locales = new Map<string, Map<string, LocalizedMessage>>();
  private readonly dialogues = new Map<string, DialogueGraph>();
  private readonly dialogueNodes = new Map<string, Map<string, DialogueNode>>();
  private readonly quests = new Map<string, QuestGraph>();
  private readonly questStates = new Map<string, Map<string, QuestState>>();

  constructor(source: StorySource, limits: StoryLimits = {}) {
    this.limits = resolveLimits(limits);
    this.source = structuredClone(source);
    this.validate();
  }

  get localeIds() { return [...this.locales.keys()]; }
  get dialogueIds() { return [...this.dialogues.keys()]; }
  get questIds() { return [...this.quests.keys()]; }

  format(locale: string, key: string, variables: StoryVariables = {}) {
    const message = this.locales.get(locale)?.get(key) ?? this.locales.get(this.source.defaultLocale)?.get(key);
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
  }

  startDialogue(dialogueId: string, options: { locale?: string; variables?: StoryVariables; flags?: StoryVariables; snapshot?: DialogueSnapshot } = {}) {
    const graph = this.dialogues.get(dialogueId);
    if (!graph) throw new Error(`Unknown dialogue: ${dialogueId}`);
    return new DialogueSession(this, graph, this.dialogueNodes.get(dialogueId)!, options);
  }

  startQuest(questId: string, snapshot?: QuestSnapshot) {
    const graph = this.quests.get(questId);
    if (!graph) throw new Error(`Unknown quest: ${questId}`);
    return new QuestSession(graph, this.questStates.get(questId)!, snapshot);
  }

  private validate() {
    assertId(this.source.defaultLocale, "Default locale");
    if (!Array.isArray(this.source.locales) || this.source.locales.length === 0 || this.source.locales.length > this.limits.maxLocales) {
      throw new RangeError(`Locale count must be between 1 and ${this.limits.maxLocales}`);
    }
    for (const bundle of this.source.locales) {
      assertId(bundle.locale, "Locale");
      if (this.locales.has(bundle.locale)) throw new Error(`Duplicate locale: ${bundle.locale}`);
      const entries = Object.entries(bundle.messages ?? {});
      if (entries.length > this.limits.maxMessagesPerLocale) throw new RangeError(`Locale ${bundle.locale} exceeds its message limit`);
      const messages = new Map<string, LocalizedMessage>();
      for (const [key, message] of entries) {
        assertId(key, "Localization key");
        validateMessage(message, `${bundle.locale}/${key}`);
        messages.set(key, message);
      }
      this.locales.set(bundle.locale, messages);
    }
    if (!this.locales.has(this.source.defaultLocale)) throw new Error(`Default locale is missing: ${this.source.defaultLocale}`);

    const dialogues = this.source.dialogues ?? [];
    if (dialogues.length > this.limits.maxDialogues) throw new RangeError("Dialogue count exceeds its limit");
    for (const graph of dialogues) this.validateDialogue(graph);
    const quests = this.source.quests ?? [];
    if (quests.length > this.limits.maxQuests) throw new RangeError("Quest count exceeds its limit");
    for (const graph of quests) this.validateQuest(graph);
  }

  private validateDialogue(graph: DialogueGraph) {
    assertId(graph.id, "Dialogue id");
    if (this.dialogues.has(graph.id)) throw new Error(`Duplicate dialogue: ${graph.id}`);
    if (!Array.isArray(graph.nodes) || graph.nodes.length === 0 || graph.nodes.length > this.limits.maxNodesPerDialogue) {
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
        this.assertTextKey(node.textKey, graph.id);
        if (node.next !== undefined) assertReference(nodes, node.next, `Dialogue ${graph.id}/${node.id}`);
      } else if (node.type === "choice") {
        if (!node.options.length || node.options.length > this.limits.maxChoicesPerNode) throw new RangeError(`Dialogue choice ${graph.id}/${node.id} has an invalid option count`);
        const optionIds = new Set<string>();
        for (const option of node.options) {
          assertId(option.id, `Choice id in ${graph.id}/${node.id}`);
          if (optionIds.has(option.id)) throw new Error(`Duplicate choice ${graph.id}/${node.id}/${option.id}`);
          optionIds.add(option.id);
          this.assertTextKey(option.textKey, graph.id);
          assertReference(nodes, option.next, `Choice ${graph.id}/${node.id}/${option.id}`);
          validateCondition(option.condition);
          validateCommands(option.commands, this.limits.maxCommandsPerTransition);
        }
      } else if (node.type === "action") {
        validateCommand(node.command);
        if (node.next !== undefined) assertReference(nodes, node.next, `Dialogue ${graph.id}/${node.id}`);
      } else if (node.type !== "end") {
        throw new TypeError(`Unsupported dialogue node type in ${graph.id}: ${String((node as { type?: unknown }).type)}`);
      }
    }
    this.dialogues.set(graph.id, graph);
    this.dialogueNodes.set(graph.id, nodes);
  }

  private validateQuest(graph: QuestGraph) {
    assertId(graph.id, "Quest id");
    if (this.quests.has(graph.id)) throw new Error(`Duplicate quest: ${graph.id}`);
    if (!Array.isArray(graph.states) || graph.states.length === 0 || graph.states.length > this.limits.maxStatesPerQuest) {
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
        validateCommands(transition.commands, this.limits.maxCommandsPerTransition);
      }
    }
    this.quests.set(graph.id, graph);
    this.questStates.set(graph.id, states);
  }

  private assertTextKey(key: string, owner: string) {
    assertId(key, `Text key in ${owner}`);
    if (!this.locales.get(this.source.defaultLocale)!.has(key)) throw new Error(`${owner} references missing default-locale message ${key}`);
  }
}

export class DialogueSession {
  private nodeId: string;
  private complete = false;
  private readonly locale: string;
  private readonly variables: StoryVariables;
  private readonly flags: StoryVariables;

  constructor(
    private readonly catalog: StoryCatalog,
    private readonly graph: DialogueGraph,
    private readonly nodes: ReadonlyMap<string, DialogueNode>,
    options: { locale?: string; variables?: StoryVariables; flags?: StoryVariables; snapshot?: DialogueSnapshot },
  ) {
    const snapshot = options.snapshot;
    if (snapshot) {
      if (snapshot.version !== 1 || snapshot.dialogueId !== graph.id || !nodes.has(snapshot.nodeId) || typeof snapshot.complete !== "boolean") {
        throw new Error(`Invalid dialogue snapshot for ${graph.id}`);
      }
      this.nodeId = snapshot.nodeId;
      this.complete = snapshot.complete;
    } else this.nodeId = graph.start;
    this.locale = options.locale ?? "";
    this.variables = { ...(options.variables ?? {}) };
    this.flags = { ...(options.flags ?? {}) };
  }

  view(): LocalizedDialogueView {
    const node = this.nodes.get(this.nodeId)!;
    if (node.type === "line") {
      return { id: node.id, type: "line", text: this.catalog.format(this.locale, node.textKey, this.variables), ...(node.speaker ? { speaker: node.speaker } : {}) };
    }
    if (node.type === "choice") {
      return {
        id: node.id,
        type: "choice",
        options: node.options.filter((option) => matches(option.condition, this.flags)).map((option) => ({
          id: option.id,
          text: this.catalog.format(this.locale, option.textKey, this.variables),
        })),
      };
    }
    if (node.type === "action") return { id: node.id, type: "action", command: structuredClone(node.command) };
    return { id: node.id, type: "end" };
  }

  advance(choiceId?: string): StoryCommand[] {
    if (this.complete) return [];
    const node = this.nodes.get(this.nodeId)!;
    if (node.type === "end") {
      this.complete = true;
      return [];
    }
    if (node.type === "choice") {
      const option = node.options.find((candidate) => candidate.id === choiceId && matches(candidate.condition, this.flags));
      if (!option) throw new Error(`Choice is unavailable in ${this.graph.id}/${node.id}: ${String(choiceId)}`);
      this.nodeId = option.next;
      return structuredClone(option.commands ?? []);
    }
    this.nodeId = node.next ?? node.id;
    if (node.next === undefined) this.complete = true;
    return node.type === "action" ? [structuredClone(node.command)] : [];
  }

  snapshot(): DialogueSnapshot {
    return { version: 1, dialogueId: this.graph.id, nodeId: this.nodeId, complete: this.complete };
  }
}

export class QuestSession {
  private stateId: string;
  private revision = 0;

  constructor(
    private readonly graph: QuestGraph,
    private readonly states: ReadonlyMap<string, QuestState>,
    snapshot?: QuestSnapshot,
  ) {
    if (snapshot) {
      if (snapshot.version !== 1 || snapshot.questId !== graph.id || !states.has(snapshot.stateId) || !Number.isSafeInteger(snapshot.revision) || snapshot.revision < 0 || typeof snapshot.complete !== "boolean" || snapshot.complete !== (states.get(snapshot.stateId)!.terminal === true)) {
        throw new Error(`Invalid quest snapshot for ${graph.id}`);
      }
      this.stateId = snapshot.stateId;
      this.revision = snapshot.revision;
    } else this.stateId = graph.start;
  }

  send(event: string, flags: StoryVariables = {}): { changed: boolean; commands: StoryCommand[] } {
    assertId(event, "Quest event");
    const state = this.states.get(this.stateId)!;
    const transition = state.transitions?.find((candidate) => candidate.event === event && matches(candidate.condition, flags));
    if (!transition) return { changed: false, commands: [] };
    this.stateId = transition.target;
    this.revision += 1;
    return { changed: true, commands: structuredClone(transition.commands ?? []) };
  }

  snapshot(): QuestSnapshot {
    return { version: 1, questId: this.graph.id, stateId: this.stateId, complete: this.states.get(this.stateId)!.terminal === true, revision: this.revision };
  }
}

export function createStoryCatalog(source: StorySource, limits?: StoryLimits) {
  return new StoryCatalog(source, limits);
}

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

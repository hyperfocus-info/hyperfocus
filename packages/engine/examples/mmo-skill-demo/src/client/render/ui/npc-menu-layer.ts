import { clampLowerFirst as clamp } from "@hyperfocus/utilities/math";

import { type MmoSkillDemoInput, type MmoSkillDemoState, type NpcEntity, type PlayerEntity } from "../../../shared-contracts.ts";
import {
  activeNpcFromReplicatedState,
  buildDialogViewModel,
  buildMarketplaceViewModel,
  highlightKindForWord,
  marketActionInput,
  playerCanReachNpc,
  type DialogTopic,
  type DialogViewModel,
  type MarketplaceViewModel,
  type MarketItem,
  type MenuInputDevice,
  type MenuMode
} from "./npc-menu-data.ts";
import { ensureNpcMenuStyles } from "./npc-menu-styles.ts";

type GamepadButtonSnapshot = { pressed?: boolean; value?: number };
type MenuGamepad = {
  axes?: readonly unknown[];
  buttons?: readonly GamepadButtonSnapshot[];
};

export type NpcMenuLayer = {
  isActive(): boolean;
  close(): void;
  handleKeyboard(event: KeyboardEvent): boolean;
  handleControllerCommand(command: ControllerCommand): boolean;
  handleController(gamepad: MenuGamepad | undefined, timeMs: number): boolean;
  update(state: MmoSkillDemoState, player: PlayerEntity | undefined, device: MenuInputDevice, timeMs: number, triggerInput?: MmoSkillDemoInput): void;
};

type NpcMenuLayerOptions = {
  queueInput: (input: MmoSkillDemoInput) => void;
  closeUtilityPanels?: () => void;
};

type MarketPane = "buy" | "sell";
export type ControllerCommand = "up" | "down" | "left" | "right" | "confirm" | "back";

const CONTROLLER_DEADZONE = 0.05;
const GRID_COLUMNS = 4;

export function createNpcMenuLayer(host: HTMLElement, options: NpcMenuLayerOptions): NpcMenuLayer {
  const doc = host.ownerDocument;
  ensureNpcMenuStyles(doc);

  const root = doc.createElement("section");
  root.className = "mmo-npc-menu-layer";
  root.hidden = true;
  root.setAttribute("aria-live", "polite");
  host.append(root);

  let mode: MenuMode = "closed";
  let activeNpcId = "";
  let dialogIndex = 0;
  let marketPane: MarketPane = "buy";
  let buyIndex = 0;
  let sellIndex = 0;
  let lastRenderKey = "";
  let lastDevice: MenuInputDevice = "keyboard";
  let suppressAutoOpenUntilMs = 0;
  const controllerInput = createControllerInput();
  let latestState: MmoSkillDemoState | undefined;
  let latestPlayer: PlayerEntity | undefined;

  function setMode(nextMode: MenuMode, npcId = activeNpcId) {
    if (mode === nextMode && activeNpcId === npcId) return;
    mode = nextMode;
    activeNpcId = nextMode === "closed" ? "" : npcId;
    dialogIndex = 0;
    buyIndex = 0;
    sellIndex = 0;
    marketPane = "buy";
    lastRenderKey = "";
    root.hidden = mode === "closed";
    root.dataset.mode = mode;
    if (mode !== "closed") options.closeUtilityPanels?.();
  }

  function close() {
    if (mode === "closed") return;
    setMode("closed", "");
    suppressAutoOpenUntilMs = performance.now() + 450;
  }

  function openDialog(npc: NpcEntity) {
    setMode("dialog", npc.id);
  }

  function openMarketplace(npcId = activeNpcId) {
    if (!npcId) return;
    setMode("marketplace", npcId);
  }

  function activeNpc(state: MmoSkillDemoState) {
    return activeNpcId ? state.npcs?.[activeNpcId] : undefined;
  }

  function focusedMarketIndex() {
    return marketPane === "buy" ? buyIndex : sellIndex;
  }

  function setFocusedMarketIndex(value: number, view: MarketplaceViewModel) {
    const items = marketPane === "buy" ? view.buyItems : view.sellItems;
    const max = Math.max(0, items.length - 1);
    if (marketPane === "buy") buyIndex = clamp(value, 0, max);
    else sellIndex = clamp(value, 0, max);
  }

  function moveDialog(delta: number, view: DialogViewModel) {
    dialogIndex = wrappedIndex(dialogIndex + delta, view.topics.length);
    lastRenderKey = "";
  }

  function moveMarket(delta: number, view: MarketplaceViewModel) {
    setFocusedMarketIndex(focusedMarketIndex() + delta, view);
    lastRenderKey = "";
  }

  function switchMarketPane(nextPane: MarketPane, view: MarketplaceViewModel) {
    marketPane = nextPane;
    setFocusedMarketIndex(focusedMarketIndex(), view);
    lastRenderKey = "";
  }

  function activateDialogTopic(topic: DialogTopic) {
    if (topic.disabled) return;
    if (topic.kind === "close") {
      close();
      return;
    }
    if (topic.kind === "open-market") {
      openMarketplace();
      return;
    }
    if (topic.input) options.queueInput(topic.input);
  }

  function activateMarketItem(view: MarketplaceViewModel) {
    const items = marketPane === "buy" ? view.buyItems : view.sellItems;
    const item = items[focusedMarketIndex()];
    if (!item || item.disabled) return;
    options.queueInput(marketActionInput(marketPane, view.npcId, item.itemId));
  }

  const renderContext: NpcMenuRenderContext = {
    doc,
    root,
    dialogIndex: () => dialogIndex,
    marketPane: () => marketPane,
    buyIndex: () => buyIndex,
    sellIndex: () => sellIndex,
    focusedMarketIndex,
    lastDevice: () => lastDevice,
    setDialogIndex(index) {
      dialogIndex = index;
      lastRenderKey = "";
    },
    setMarketSelection(pane, index) {
      marketPane = pane;
      if (pane === "buy") buyIndex = index;
      else sellIndex = index;
      lastRenderKey = "";
    },
    close,
    activateDialogTopic,
    activateMarketItem
  };
  function update(state: MmoSkillDemoState, player: PlayerEntity | undefined, device: MenuInputDevice, timeMs: number, triggerInput?: MmoSkillDemoInput) {
    latestState = state;
    latestPlayer = player;
    lastDevice = device;
    const triggeredNpc = activeNpcFromInput(state, triggerInput) ?? activeNpcFromReplicatedState(state, player);
    if (triggeredNpc && (mode === "closed" || (activeNpcId && activeNpcId !== triggeredNpc.id)) && timeMs >= suppressAutoOpenUntilMs) {
      openDialog(triggeredNpc);
    }
    if (mode === "closed") return;
    const npc = activeNpc(state);
    if (!playerCanReachNpc(player, npc)) {
      close();
      return;
    }
    if (!player || !npc) return;
    if (mode === "dialog") {
      const view = buildDialogViewModel(state, player, npc);
      dialogIndex = clamp(dialogIndex, 0, Math.max(0, view.topics.length - 1));
      const renderKey = `${mode}:${device}:${activeNpcId}:${dialogIndex}:${dialogModelKey(view)}`;
      if (renderKey === lastRenderKey) return;
      lastRenderKey = renderKey;
      renderNpcDialog(renderContext, view);
      return;
    }
    const view = buildMarketplaceViewModel(player, npc);
    buyIndex = clamp(buyIndex, 0, Math.max(0, view.buyItems.length - 1));
    sellIndex = clamp(sellIndex, 0, Math.max(0, view.sellItems.length - 1));
    const renderKey = `${mode}:${device}:${activeNpcId}:${marketPane}:${buyIndex}:${sellIndex}:${marketModelKey(view)}`;
    if (renderKey === lastRenderKey) return;
    lastRenderKey = renderKey;
    renderNpcMarketplace(renderContext, view);
  }

  function currentViewState() {
    const state = latestState;
    const player = latestPlayer;
    const npc = state ? activeNpc(state) : undefined;
    if (!state || !player || !npc) return undefined;
    return mode === "dialog" ? buildDialogViewModel(state, player, npc) : buildMarketplaceViewModel(player, npc);
  }

  const interactionHandlers = createNpcMenuInteractionHandlers({
    mode: () => mode,
    dialogIndex: () => dialogIndex,
    controllerInput,
    currentViewState,
    close,
    moveDialog,
    moveMarket,
    switchMarketPane,
    activateDialogTopic,
    activateMarketItem,
    renderDialog: (view) => renderNpcDialog(renderContext, view),
    renderMarketplace: (view) => renderNpcMarketplace(renderContext, view)
  });
  return {
    isActive: () => mode !== "closed",
    close,
    ...interactionHandlers,
    update
  };
}

type NpcMenuInteractionContext = {
  mode: () => MenuMode;
  dialogIndex: () => number;
  controllerInput: ReturnType<typeof createControllerInput>;
  currentViewState: () => DialogViewModel | MarketplaceViewModel | undefined;
  close(): void;
  moveDialog(delta: number, view: DialogViewModel): void;
  moveMarket(delta: number, view: MarketplaceViewModel): void;
  switchMarketPane(pane: MarketPane, view: MarketplaceViewModel): void;
  activateDialogTopic(topic: DialogTopic): void;
  activateMarketItem(view: MarketplaceViewModel): void;
  renderDialog(view: DialogViewModel): void;
  renderMarketplace(view: MarketplaceViewModel): void;
};

function createNpcMenuInteractionHandlers(context: NpcMenuInteractionContext) {
  function handleKeyboard(event: KeyboardEvent) {
    if (context.mode() === "closed") return false;
    const state = context.currentViewState();
    if (!state) return false;
    const code = event.code;
    const handled =
      code === "ArrowUp" || code === "ArrowDown" || code === "ArrowLeft" || code === "ArrowRight" ||
      code === "Enter" || code === "NumpadEnter" || code === "Escape" || code === "Backspace";
    if (!handled) return false;
    event.preventDefault();
    event.stopPropagation();
    if (code === "Escape" || code === "Backspace") {
      if (!event.repeat) context.close();
      return true;
    }
    if (context.mode() === "dialog" && "topics" in state) {
      if (code === "ArrowUp") context.moveDialog(-1, state);
      else if (code === "ArrowDown") context.moveDialog(1, state);
      else if ((code === "Enter" || code === "NumpadEnter") && !event.repeat) {
        const topic = state.topics[context.dialogIndex()] ?? state.topics[0];
        if (topic) context.activateDialogTopic(topic);
      }
      context.renderDialog(state);
      return true;
    }
    if (context.mode() === "marketplace" && "buyItems" in state) {
      if (code === "ArrowLeft") context.switchMarketPane("buy", state);
      else if (code === "ArrowRight") context.switchMarketPane("sell", state);
      else if (code === "ArrowUp") context.moveMarket(-GRID_COLUMNS, state);
      else if (code === "ArrowDown") context.moveMarket(GRID_COLUMNS, state);
      else if ((code === "Enter" || code === "NumpadEnter") && !event.repeat) context.activateMarketItem(state);
      context.renderMarketplace(state);
    }
    return true;
  }

  function handleController(gamepad: MenuGamepad | undefined, timeMs: number) {
    if (context.mode() === "closed") {
      context.controllerInput.reset(gamepad);
      return false;
    }
    const view = context.currentViewState();
    const command = context.controllerInput.read(gamepad, timeMs);
    if (!command || !view) return true;
    return handleControllerCommand(command);
  }

  function handleControllerCommand(command: ControllerCommand) {
    if (context.mode() === "closed") return false;
    const view = context.currentViewState();
    if (!view) return true;
    if (command === "back") {
      context.close();
      return true;
    }
    if (context.mode() === "dialog" && "topics" in view) {
      if (command === "up") context.moveDialog(-1, view);
      else if (command === "down") context.moveDialog(1, view);
      else if (command === "confirm") {
        const topic = view.topics[context.dialogIndex()] ?? view.topics[0];
        if (topic) context.activateDialogTopic(topic);
      }
      context.renderDialog(view);
      return true;
    }
    if (context.mode() === "marketplace" && "buyItems" in view) {
      if (command === "left") context.switchMarketPane("buy", view);
      else if (command === "right") context.switchMarketPane("sell", view);
      else if (command === "up") context.moveMarket(-GRID_COLUMNS, view);
      else if (command === "down") context.moveMarket(GRID_COLUMNS, view);
      else if (command === "confirm") context.activateMarketItem(view);
      context.renderMarketplace(view);
    }
    return true;
  }

  return { handleKeyboard, handleController, handleControllerCommand };
}

type NpcMenuRenderContext = {
  doc: Document;
  root: HTMLElement;
  dialogIndex: () => number;
  marketPane: () => MarketPane;
  buyIndex: () => number;
  sellIndex: () => number;
  focusedMarketIndex: () => number;
  lastDevice: () => MenuInputDevice;
  setDialogIndex(index: number): void;
  setMarketSelection(pane: MarketPane, index: number): void;
  close(): void;
  activateDialogTopic(topic: DialogTopic): void;
  activateMarketItem(view: MarketplaceViewModel): void;
};

function renderNpcDialog(context: NpcMenuRenderContext, view: DialogViewModel) {
  const { doc } = context;
  const dialogIndex = context.dialogIndex();
  const topic = view.topics[dialogIndex] ?? view.topics[0];
  const frame = doc.createElement("article");
  frame.className = "mmo-dialog-frame";
  frame.style.setProperty("--npc-accent", view.accent);
  frame.setAttribute("role", "dialog");
  frame.setAttribute("aria-label", `${view.name} dialog`);

  const portrait = doc.createElement("aside");
  portrait.className = "mmo-dialog-portrait";
  const imageWrap = doc.createElement("div");
  imageWrap.className = "mmo-dialog-portrait-image";
  const img = doc.createElement("img");
  img.src = view.portraitSrc;
  img.alt = "";
  img.decoding = "async";
  imageWrap.append(img);
  const name = doc.createElement("strong");
  name.textContent = view.name;
  const subtitle = doc.createElement("span");
  subtitle.textContent = view.subtitle;
  portrait.append(imageWrap, name, subtitle);

  const bodyWrap = doc.createElement("div");
  bodyWrap.className = "mmo-dialog-body";
  const speech = doc.createElement("div");
  speech.className = "mmo-dialog-speech";
  appendHighlightedText(speech, topic?.body || view.body);
  const topics = doc.createElement("div");
  topics.className = "mmo-dialog-topics";
  topics.setAttribute("role", "listbox");
  topics.setAttribute("aria-label", "Dialog topics");
  view.topics.forEach((entry, index) => {
    const button = doc.createElement("button");
    button.className = `mmo-dialog-topic${index === dialogIndex ? " is-focused" : ""}`;
    button.type = "button";
    button.disabled = Boolean(entry.disabled);
    button.setAttribute("role", "option");
    button.setAttribute("aria-selected", index === dialogIndex ? "true" : "false");
    const label = doc.createElement("span");
    label.className = "mmo-dialog-topic-label";
    label.textContent = entry.label;
    const meta = doc.createElement("span");
    meta.className = "mmo-dialog-topic-meta";
    meta.textContent = entry.description;
    button.replaceChildren(label, meta);
    button.addEventListener("pointermove", () => {
      if (context.dialogIndex() === index) return;
      context.setDialogIndex(index);
      renderNpcDialog(context, view);
    });
    button.addEventListener("click", () => context.activateDialogTopic(entry));
    topics.append(button);
  });
  bodyWrap.append(speech, topics, renderPrompt(doc, promptText(context.lastDevice())));

  const closeButton = doc.createElement("button");
  closeButton.className = "mmo-npc-menu-close";
  closeButton.type = "button";
  closeButton.title = "Close";
  closeButton.setAttribute("aria-label", "Close dialog");
  closeButton.textContent = "X";
  closeButton.addEventListener("click", context.close);
  frame.append(portrait, bodyWrap, closeButton);
  context.root.replaceChildren(frame);
}

function renderNpcMarketplace(context: NpcMenuRenderContext, view: MarketplaceViewModel) {
  const { doc } = context;
  const shell = doc.createElement("article");
  shell.className = "mmo-market-frame";
  shell.setAttribute("role", "dialog");
  shell.setAttribute("aria-label", "Marketplace");

  const header = doc.createElement("header");
  header.className = "mmo-market-header";
  const titleWrap = doc.createElement("div");
  const title = doc.createElement("h2");
  title.textContent = view.title;
  const subtitle = doc.createElement("p");
  subtitle.textContent = view.subtitle;
  titleWrap.append(title, subtitle);
  const wallet = doc.createElement("div");
  wallet.className = "mmo-market-wallet";
  wallet.textContent = `${view.gold}g`;
  const closeButton = doc.createElement("button");
  closeButton.className = "mmo-npc-menu-close";
  closeButton.type = "button";
  closeButton.title = "Close";
  closeButton.setAttribute("aria-label", "Close marketplace");
  closeButton.textContent = "X";
  closeButton.addEventListener("click", context.close);
  header.append(titleWrap, wallet, closeButton);

  const panes = doc.createElement("div");
  panes.className = "mmo-market-panes";
  panes.append(
    renderMarketPane(context, "buy", "Merchant Stock", view.buyItems, view),
    renderMarketPane(context, "sell", "Player Inventory", view.sellItems, view)
  );

  const action = doc.createElement("footer");
  action.className = "mmo-market-action";
  const pane = context.marketPane();
  const item = (pane === "buy" ? view.buyItems : view.sellItems)[context.focusedMarketIndex()];
  action.textContent = item
    ? `${pane === "buy" ? "Buy" : "Sell"} ${item.name} ${pane === "buy" ? `${item.price}g` : `${item.sellPrice}g`}${item.reason ? ` | ${item.reason}` : ""}`
    : pane === "buy" ? "No stock selected" : "No carried item selected";
  action.append(renderPrompt(doc, promptText(context.lastDevice())));
  shell.append(header, panes, action);
  context.root.replaceChildren(shell);
}

function renderMarketPane(
  context: NpcMenuRenderContext,
  pane: MarketPane,
  titleText: string,
  items: MarketItem[],
  view: MarketplaceViewModel
) {
  const { doc } = context;
  const paneNode = doc.createElement("section");
  paneNode.className = `mmo-market-pane${context.marketPane() === pane ? " is-active-pane" : ""}`;
  const heading = doc.createElement("h3");
  heading.textContent = titleText;
  const grid = doc.createElement("div");
  grid.className = "mmo-market-grid";
  const empty = doc.createElement("div");
  empty.className = "mmo-market-empty";
  empty.textContent = pane === "buy" ? "No stock." : "Nothing sellable carried.";
  if (!items.length) grid.append(empty);
  items.forEach((item, index) => {
    const focused = context.marketPane() === pane && index === (pane === "buy" ? context.buyIndex() : context.sellIndex());
    const button = doc.createElement("button");
    button.className = `mmo-market-item rarity-${item.rarity}${focused ? " is-focused" : ""}`;
    button.type = "button";
    button.disabled = Boolean(item.disabled);
    button.title = item.reason ? `${item.name}: ${item.reason}` : item.description;
    const icon = doc.createElement("img");
    icon.src = item.iconSrc;
    icon.alt = "";
    icon.loading = "lazy";
    const count = doc.createElement("span");
    count.className = "mmo-market-count";
    count.textContent = item.quantity > 0 ? String(item.quantity) : "";
    const price = doc.createElement("span");
    price.className = "mmo-market-price";
    price.textContent = pane === "buy" ? `${item.price}g` : `${item.sellPrice}g`;
    button.append(icon, count, price);
    button.addEventListener("pointermove", () => {
      const alreadyFocused =
        context.marketPane() === pane && index === (pane === "buy" ? context.buyIndex() : context.sellIndex());
      if (alreadyFocused) return;
      context.setMarketSelection(pane, index);
      renderNpcMarketplace(context, view);
    });
    button.addEventListener("click", () => {
      context.setMarketSelection(pane, index);
      context.activateMarketItem(view);
    });
    grid.append(button);
  });
  paneNode.append(heading, grid);
  return paneNode;
}

function createControllerInput() {
  let previousButtons = new Set<number>();
  let heldAxisCommand = "";
  let nextAxisRepeatMs = 0;

  function pressedButtons(gamepad: MenuGamepad | undefined) {
    const pressed = new Set<number>();
    const buttons = gamepad?.buttons ?? [];
    for (let i = 0; i < buttons.length; i += 1) {
      const button = buttons[i];
      if (button && (button.pressed || (button.value ?? 0) > 0.45)) pressed.add(i);
    }
    return pressed;
  }

  function axisCommand(gamepad: MenuGamepad | undefined): ControllerCommand | undefined {
    const axes = gamepad?.axes ?? [];
    const axis = (index: number) => {
      const value = axes[index];
      return typeof value === "number" && Number.isFinite(value) ? value : 0;
    };
    const x = Math.abs(axis(0)) >= Math.abs(axis(2)) ? axis(0) : axis(2);
    const y = Math.abs(axis(1)) >= Math.abs(axis(3)) ? axis(1) : axis(3);
    if (Math.abs(x) < CONTROLLER_DEADZONE && Math.abs(y) < CONTROLLER_DEADZONE) return undefined;
    if (Math.abs(x) > Math.abs(y)) return x > 0 ? "right" : "left";
    return y > 0 ? "down" : "up";
  }

  function reset(gamepad: MenuGamepad | undefined) {
    previousButtons = pressedButtons(gamepad);
    heldAxisCommand = "";
    nextAxisRepeatMs = 0;
  }

  function read(gamepad: MenuGamepad | undefined, timeMs: number): ControllerCommand | undefined {
    const current = pressedButtons(gamepad);
    const edge = (index: number) => current.has(index) && !previousButtons.has(index);
    previousButtons = current;
    if (edge(1)) return "back";
    if (edge(0)) return "confirm";
    if (edge(12)) return "up";
    if (edge(13)) return "down";
    if (edge(14)) return "left";
    if (edge(15)) return "right";
    const axis = axisCommand(gamepad);
    if (!axis) {
      heldAxisCommand = "";
      nextAxisRepeatMs = 0;
      return undefined;
    }
    if (axis !== heldAxisCommand || timeMs >= nextAxisRepeatMs) {
      heldAxisCommand = axis;
      nextAxisRepeatMs = timeMs + (nextAxisRepeatMs ? 135 : 260);
      return axis;
    }
    return undefined;
  }

  return { read, reset };
}

function renderPrompt(doc: Document, text: string) {
  const prompt = doc.createElement("div");
  prompt.className = "mmo-npc-menu-prompt";
  prompt.textContent = text;
  return prompt;
}

function promptText(device: MenuInputDevice) {
  return device === "controller"
    ? "[D-Pad/Stick] Move  [A] Confirm  [B] Back"
    : "[Arrow Keys] Move  [Enter] Confirm  [Esc] Back";
}

function appendHighlightedText(target: HTMLElement, text: string) {
  const doc = target.ownerDocument;
  target.replaceChildren();
  const terms = [
    "Void Resistant Cloak",
    "Overgrown Thicket",
    "Sunken Bazaar",
    "Port Marrow",
    "Glade Berries",
    "Cinder Ale",
    "Speed Potion",
    "Ring Of Focus",
    "Silk Thread",
    "Iron Ore",
    "Ash Logs",
    "Mining Boots",
    "Ironcrag",
    "Ashwood",
    "Oakhaven",
    "Crags",
    "Bazaar",
    "Aetheria",
    "Gold",
    "Renown",
    "Pickaxe",
    "quest",
    "contract",
    "proof",
    "guild",
    "route",
    "danger",
    "ready",
    "complete"
  ];
  const pattern = new RegExp(`(${terms.map(escapeRegExp).join("|")})`, "gi");
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > last) target.append(doc.createTextNode(text.slice(last, index)));
    const span = doc.createElement("span");
    span.className = `mmo-dialog-highlight mmo-dialog-highlight-${highlightKindForWord(match[0]) || "quest"}`;
    span.textContent = match[0];
    target.append(span);
    last = index + match[0].length;
  }
  if (last < text.length) target.append(doc.createTextNode(text.slice(last)));
}

function dialogModelKey(view: DialogViewModel) {
  return `${view.name}:${view.subtitle}:${view.body}:${view.topics.map((topic) => `${topic.id}:${topic.label}:${topic.body}:${topic.disabled ? 1 : 0}`).join("|")}`;
}

function marketModelKey(view: MarketplaceViewModel) {
  return `${view.gold}:${view.buyItems.map(itemKey).join("|")}:${view.sellItems.map(itemKey).join("|")}`;
}

function itemKey(item: MarketItem) {
  return `${item.itemId}:${item.quantity}:${item.price}:${item.sellPrice}:${item.disabled ? 1 : 0}:${item.reason ?? ""}`;
}

function activeNpcFromInput(state: MmoSkillDemoState, input: MmoSkillDemoInput | undefined) {
  if (!input?.targetId) return undefined;
  if (input.action !== "interact" && input.action !== "travel" && input.action !== "bank" && input.action !== "trade") return undefined;
  const npc = state.npcs?.[input.targetId];
  if (!npc || npc.hp <= 0) return undefined;
  return npc.role === "quest" ||
    npc.role === "trainer" ||
    npc.role === "bank" ||
    npc.role === "merchant" ||
    npc.role === "travel" ||
    npc.role === "contract" ||
    npc.role === "crafting" ||
    npc.role === "home" ||
    npc.role === "hidden"
    ? npc
    : undefined;
}

function wrappedIndex(index: number, length: number) {
  if (length <= 0) return 0;
  return ((index % length) + length) % length;
}



function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

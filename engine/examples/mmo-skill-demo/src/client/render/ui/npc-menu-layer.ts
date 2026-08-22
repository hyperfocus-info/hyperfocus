import type { MmoSkillDemoInput, MmoSkillDemoState, NpcEntity, PlayerEntity } from "../../../shared.ts";
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

type GamepadButtonSnapshot = { pressed?: boolean; value?: number };
type MenuGamepad = {
  axes?: readonly number[];
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

const STYLE_ID = "mmo-npc-menu-layer-style";
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
  let previousControllerButtons = new Set<number>();
  let heldAxisCommand = "";
  let nextAxisRepeatMs = 0;
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

  function renderPrompt(text: string) {
    const prompt = doc.createElement("div");
    prompt.className = "mmo-npc-menu-prompt";
    prompt.textContent = text;
    return prompt;
  }

  function promptText() {
    return lastDevice === "controller"
      ? "[D-Pad/Stick] Move  [A] Confirm  [B] Back"
      : "[Arrow Keys] Move  [Enter] Confirm  [Esc] Back";
  }

  function renderDialog(view: DialogViewModel) {
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
        if (dialogIndex === index) return;
        dialogIndex = index;
        lastRenderKey = "";
        renderCurrentView(view);
      });
      button.addEventListener("click", () => activateDialogTopic(entry));
      topics.append(button);
    });
    bodyWrap.append(speech, topics, renderPrompt(promptText()));

    const closeButton = doc.createElement("button");
    closeButton.className = "mmo-npc-menu-close";
    closeButton.type = "button";
    closeButton.title = "Close";
    closeButton.setAttribute("aria-label", "Close dialog");
    closeButton.textContent = "X";
    closeButton.addEventListener("click", close);

    frame.append(portrait, bodyWrap, closeButton);
    root.replaceChildren(frame);
  }

  function renderCurrentView(view: DialogViewModel | MarketplaceViewModel) {
    const npc = { id: view.npcId };
    if (mode === "dialog" && "topics" in view) renderDialog(view);
    else if (mode === "marketplace" && "buyItems" in view) renderMarketplace(view);
    activeNpcId = npc.id;
  }

  function renderMarketplace(view: MarketplaceViewModel) {
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
    closeButton.addEventListener("click", close);
    header.append(titleWrap, wallet, closeButton);

    const panes = doc.createElement("div");
    panes.className = "mmo-market-panes";
    panes.append(
      renderMarketPane("buy", "Merchant Stock", view.buyItems, view),
      renderMarketPane("sell", "Player Inventory", view.sellItems, view)
    );

    const action = doc.createElement("footer");
    action.className = "mmo-market-action";
    const item = (marketPane === "buy" ? view.buyItems : view.sellItems)[focusedMarketIndex()];
    action.textContent = item
      ? `${marketPane === "buy" ? "Buy" : "Sell"} ${item.name} ${marketPane === "buy" ? `${item.price}g` : `${item.sellPrice}g`}${item.reason ? ` | ${item.reason}` : ""}`
      : marketPane === "buy" ? "No stock selected" : "No carried item selected";
    action.append(renderPrompt(promptText()));

    shell.append(header, panes, action);
    root.replaceChildren(shell);
  }

  function renderMarketPane(pane: MarketPane, titleText: string, items: MarketItem[], view: MarketplaceViewModel) {
    const paneNode = doc.createElement("section");
    paneNode.className = `mmo-market-pane${marketPane === pane ? " is-active-pane" : ""}`;
    const heading = doc.createElement("h3");
    heading.textContent = titleText;
    const grid = doc.createElement("div");
    grid.className = "mmo-market-grid";
    const empty = doc.createElement("div");
    empty.className = "mmo-market-empty";
    empty.textContent = pane === "buy" ? "No stock." : "Nothing sellable carried.";
    if (!items.length) grid.append(empty);
    items.forEach((item, index) => {
      const focused = marketPane === pane && index === (pane === "buy" ? buyIndex : sellIndex);
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
        const alreadyFocused = marketPane === pane && index === (pane === "buy" ? buyIndex : sellIndex);
        if (alreadyFocused) return;
        marketPane = pane;
        if (pane === "buy") buyIndex = index;
        else sellIndex = index;
        lastRenderKey = "";
        renderMarketplace(view);
      });
      button.addEventListener("click", () => {
        marketPane = pane;
        if (pane === "buy") buyIndex = index;
        else sellIndex = index;
        activateMarketItem(view);
      });
      grid.append(button);
    });
    paneNode.append(heading, grid);
    return paneNode;
  }

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
    const view = mode === "dialog" ? buildDialogViewModel(state, player, npc) : buildMarketplaceViewModel(player, npc);
    if (mode === "dialog" && "topics" in view) dialogIndex = clamp(dialogIndex, 0, Math.max(0, view.topics.length - 1));
    if (mode === "marketplace" && "buyItems" in view) {
      buyIndex = clamp(buyIndex, 0, Math.max(0, view.buyItems.length - 1));
      sellIndex = clamp(sellIndex, 0, Math.max(0, view.sellItems.length - 1));
    }
    const renderKey = mode === "dialog"
      ? `${mode}:${device}:${activeNpcId}:${dialogIndex}:${dialogModelKey(view as DialogViewModel)}`
      : `${mode}:${device}:${activeNpcId}:${marketPane}:${buyIndex}:${sellIndex}:${marketModelKey(view as MarketplaceViewModel)}`;
    if (renderKey === lastRenderKey) return;
    lastRenderKey = renderKey;
    if (mode === "dialog") renderDialog(view as DialogViewModel);
    else renderMarketplace(view as MarketplaceViewModel);
  }

  function handleKeyboard(event: KeyboardEvent) {
    if (mode === "closed") return false;
    const state = currentViewState();
    if (!state) return false;
    const code = event.code;
    const handled = code === "ArrowUp" ||
      code === "ArrowDown" ||
      code === "ArrowLeft" ||
      code === "ArrowRight" ||
      code === "Enter" ||
      code === "NumpadEnter" ||
      code === "Escape" ||
      code === "Backspace";
    if (!handled) return false;
    event.preventDefault();
    event.stopPropagation();
    if (code === "Escape" || code === "Backspace") {
      if (!event.repeat) close();
      return true;
    }
    if (mode === "dialog" && "topics" in state) {
      if (code === "ArrowUp") moveDialog(-1, state);
      else if (code === "ArrowDown") moveDialog(1, state);
      else if ((code === "Enter" || code === "NumpadEnter") && !event.repeat) activateDialogTopic(state.topics[dialogIndex] ?? state.topics[0]);
      renderDialog(state);
      return true;
    }
    if (mode === "marketplace" && "buyItems" in state) {
      if (code === "ArrowLeft") switchMarketPane("buy", state);
      else if (code === "ArrowRight") switchMarketPane("sell", state);
      else if (code === "ArrowUp") moveMarket(-GRID_COLUMNS, state);
      else if (code === "ArrowDown") moveMarket(GRID_COLUMNS, state);
      else if ((code === "Enter" || code === "NumpadEnter") && !event.repeat) activateMarketItem(state);
      renderMarketplace(state);
      return true;
    }
    return true;
  }

  function currentViewState() {
    const state = latestState;
    const player = latestPlayer;
    const npc = state ? activeNpc(state) : undefined;
    if (!state || !player || !npc) return undefined;
    return mode === "dialog" ? buildDialogViewModel(state, player, npc) : buildMarketplaceViewModel(player, npc);
  }

  function handleController(gamepad: MenuGamepad | undefined, timeMs: number) {
    if (mode === "closed") {
      previousControllerButtons = pressedButtons(gamepad);
      heldAxisCommand = "";
      return false;
    }
    const view = currentViewState();
    const command = controllerCommand(gamepad, timeMs);
    if (!command || !view) return true;
    return handleControllerCommand(command);
  }

  function handleControllerCommand(command: ControllerCommand) {
    if (mode === "closed") return false;
    const view = currentViewState();
    if (!view) return true;
    if (command === "back") {
      close();
      return true;
    }
    if (mode === "dialog" && "topics" in view) {
      if (command === "up") moveDialog(-1, view);
      else if (command === "down") moveDialog(1, view);
      else if (command === "confirm") activateDialogTopic(view.topics[dialogIndex] ?? view.topics[0]);
      renderDialog(view);
      return true;
    }
    if (mode === "marketplace" && "buyItems" in view) {
      if (command === "left") switchMarketPane("buy", view);
      else if (command === "right") switchMarketPane("sell", view);
      else if (command === "up") moveMarket(-GRID_COLUMNS, view);
      else if (command === "down") moveMarket(GRID_COLUMNS, view);
      else if (command === "confirm") activateMarketItem(view);
      renderMarketplace(view);
      return true;
    }
    return true;
  }

  function controllerCommand(gamepad: MenuGamepad | undefined, timeMs: number): ControllerCommand | undefined {
    const current = pressedButtons(gamepad);
    const edge = (index: number) => current.has(index) && !previousControllerButtons.has(index);
    previousControllerButtons = current;
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

  function axisCommand(gamepad: MenuGamepad | undefined): ControllerCommand | undefined {
    const axes = gamepad?.axes ?? [];
    const x = Math.abs(axes[0] ?? 0) >= Math.abs(axes[2] ?? 0) ? axes[0] ?? 0 : axes[2] ?? 0;
    const y = Math.abs(axes[1] ?? 0) >= Math.abs(axes[3] ?? 0) ? axes[1] ?? 0 : axes[3] ?? 0;
    if (Math.abs(x) < CONTROLLER_DEADZONE && Math.abs(y) < CONTROLLER_DEADZONE) return undefined;
    if (Math.abs(x) > Math.abs(y)) return x > 0 ? "right" : "left";
    return y > 0 ? "down" : "up";
  }

  function pressedButtons(gamepad: MenuGamepad | undefined) {
    const pressed = new Set<number>();
    const buttons = gamepad?.buttons ?? [];
    for (let i = 0; i < buttons.length; i += 1) {
      const button = buttons[i];
      if (button && (button.pressed || (button.value ?? 0) > 0.45)) pressed.add(i);
    }
    return pressed;
  }

  return {
    isActive: () => mode !== "closed",
    close,
    handleKeyboard,
    handleControllerCommand,
    handleController,
    update
  };
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

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function ensureNpcMenuStyles(doc: Document) {
  if (doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
.mmo-npc-menu-layer {
  box-sizing: border-box;
  display: grid;
  inset: 18px;
  align-items: end;
  justify-items: center;
  pointer-events: none;
  position: fixed;
  z-index: 40;
}
.mmo-npc-menu-layer[hidden] { display: none; }
.mmo-dialog-frame,
.mmo-market-frame {
  backdrop-filter: blur(18px) saturate(132%);
  background:
    linear-gradient(135deg, rgba(15, 22, 27, 0.86), rgba(20, 16, 25, 0.78)),
    radial-gradient(circle at 14% 10%, color-mix(in srgb, var(--npc-accent, #f4d36b) 26%, transparent), transparent 32%);
  border: 1px solid rgba(225, 239, 243, 0.34);
  border-radius: 8px;
  box-shadow: 0 28px 70px rgba(0,0,0,0.46), inset 0 0 0 1px rgba(255,255,255,0.08);
  box-sizing: border-box;
  color: #f5f3e8;
  font-family: Inter, ui-sans-serif, system-ui, sans-serif;
  pointer-events: auto;
  position: relative;
}
.mmo-dialog-frame {
  display: grid;
  gap: 18px;
  grid-template-columns: 230px minmax(320px, 620px);
  margin-bottom: min(8vh, 54px);
  max-width: min(980px, calc(100vw - 36px));
  padding: 16px 18px;
  width: min(980px, calc(100vw - 36px));
}
.mmo-dialog-portrait {
  align-content: start;
  background: linear-gradient(180deg, rgba(6, 12, 17, 0.78), rgba(16, 23, 22, 0.68));
  border: 1px solid color-mix(in srgb, var(--npc-accent, #f4d36b) 72%, white 12%);
  border-radius: 8px;
  box-shadow: inset 0 0 0 1px rgba(255,255,255,0.08), 0 0 28px color-mix(in srgb, var(--npc-accent, #f4d36b) 18%, transparent);
  display: grid;
  gap: 8px;
  min-width: 0;
  padding: 12px;
}
.mmo-dialog-portrait-image {
  aspect-ratio: 1;
  background: radial-gradient(circle at 50% 25%, color-mix(in srgb, var(--npc-accent, #73e2ff) 22%, #0b1115), #071016 76%);
  border: 2px solid color-mix(in srgb, var(--npc-accent, #73e2ff) 82%, white 10%);
  border-radius: 7px;
  display: grid;
  overflow: hidden;
  place-items: center;
}
.mmo-dialog-portrait img {
  height: 104%;
  image-rendering: auto;
  object-fit: contain;
  width: 104%;
}
.mmo-dialog-portrait strong {
  color: #ffd36a;
  font: 900 18px/1.1 Inter, ui-sans-serif, system-ui, sans-serif;
  overflow-wrap: anywhere;
}
.mmo-dialog-portrait span {
  color: #b8c9cf;
  font-size: 12px;
  line-height: 1.2;
}
.mmo-dialog-body {
  align-content: start;
  display: grid;
  gap: 12px;
  min-width: 0;
}
.mmo-dialog-speech {
  background: linear-gradient(180deg, rgba(20, 27, 35, 0.82), rgba(17, 22, 22, 0.74));
  border: 1px solid rgba(218, 235, 241, 0.34);
  border-radius: 8px;
  box-shadow: inset 0 0 0 1px rgba(255,255,255,0.06);
  color: #f6f0e3;
  font: 500 19px/1.28 Inter, ui-sans-serif, system-ui, sans-serif;
  min-height: 118px;
  overflow-wrap: anywhere;
  padding: 20px 22px;
}
.mmo-dialog-highlight {
  font-weight: 900;
  text-shadow: 0 0 14px currentColor;
}
.mmo-dialog-highlight-item { color: #ffd36a; }
.mmo-dialog-highlight-place { color: #55ddea; }
.mmo-dialog-highlight-quest { color: #9fe889; }
.mmo-dialog-topics {
  display: grid;
  gap: 8px;
}
.mmo-dialog-topic {
  align-items: center;
  background: linear-gradient(90deg, rgba(19, 27, 36, 0.88), rgba(17, 29, 25, 0.78));
  border: 1px solid rgba(201, 222, 229, 0.28);
  border-radius: 7px;
  color: #f5f3e8;
  cursor: pointer;
  display: grid;
  gap: 2px;
  grid-template-columns: minmax(0, 1fr);
  min-height: 46px;
  padding: 8px 14px;
  text-align: left;
}
.mmo-dialog-topic.is-focused {
  border-color: #55ddea;
  box-shadow: 0 0 0 2px rgba(85,221,234,0.62), 0 0 24px rgba(85,221,234,0.28);
}
.mmo-dialog-topic:hover {
  border-color: rgba(85,221,234,0.54);
  box-shadow: inset 0 0 0 1px rgba(85,221,234,0.22);
}
.mmo-dialog-topic-label {
  font-size: 16px;
  font-weight: 800;
  overflow-wrap: anywhere;
}
.mmo-dialog-topic-meta {
  color: #b8c9cf;
  font-size: 11px;
  overflow-wrap: anywhere;
}
.mmo-npc-menu-close {
  background: rgba(5, 8, 10, 0.56);
  border: 1px solid rgba(255,255,255,0.22);
  border-radius: 999px;
  color: #f5f3e8;
  cursor: pointer;
  font: 900 12px/1 Inter, ui-sans-serif, system-ui, sans-serif;
  height: 28px;
  position: absolute;
  right: 10px;
  top: 10px;
  width: 28px;
}
.mmo-npc-menu-close:hover {
  border-color: #ff8b7a;
  color: #ffb3a6;
}
.mmo-npc-menu-prompt {
  color: #d9e7e9;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0;
  opacity: 0.86;
  text-align: right;
}
.mmo-market-frame {
  display: grid;
  gap: 12px;
  margin-bottom: min(6vh, 42px);
  max-width: min(980px, calc(100vw - 36px));
  padding: 14px;
  width: min(980px, calc(100vw - 36px));
}
.mmo-market-header {
  align-items: center;
  display: grid;
  gap: 14px;
  grid-template-columns: minmax(0, 1fr) auto 28px;
  padding-right: 34px;
}
.mmo-market-header h2 {
  color: #f5f3e8;
  font-size: 24px;
  line-height: 1.05;
  margin: 0;
  overflow-wrap: anywhere;
}
.mmo-market-header p {
  color: #b8c9cf;
  font-size: 12px;
  margin: 4px 0 0;
}
.mmo-market-wallet {
  background: linear-gradient(180deg, #ffd36a, #bb7e2a);
  border-radius: 999px;
  color: #17100a;
  font-size: 13px;
  font-weight: 900;
  min-width: 72px;
  padding: 6px 12px;
  text-align: center;
}
.mmo-market-panes {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}
.mmo-market-pane {
  background: rgba(8, 13, 16, 0.54);
  border: 1px solid rgba(201, 222, 229, 0.26);
  border-radius: 8px;
  display: grid;
  gap: 10px;
  min-width: 0;
  padding: 10px;
}
.mmo-market-pane.is-active-pane {
  border-color: rgba(85,221,234,0.64);
  box-shadow: inset 0 0 0 1px rgba(85,221,234,0.18);
}
.mmo-market-pane h3 {
  color: #d9e7e9;
  font-size: 14px;
  margin: 0;
  text-align: center;
}
.mmo-market-grid {
  display: grid;
  gap: 9px;
  grid-template-columns: repeat(4, minmax(58px, 1fr));
  min-height: 210px;
}
.mmo-market-item {
  aspect-ratio: 1;
  background: radial-gradient(circle at 50% 24%, rgba(255,255,255,0.10), rgba(8,12,14,0.92) 70%);
  border: 1px solid rgba(195, 211, 217, 0.32);
  border-radius: 7px;
  color: #f5f3e8;
  cursor: pointer;
  display: grid;
  overflow: hidden;
  padding: 6px;
  place-items: center;
  position: relative;
}
.mmo-market-item:disabled {
  cursor: not-allowed;
  opacity: 0.48;
}
.mmo-market-item img {
  height: 68%;
  object-fit: contain;
  width: 68%;
}
.mmo-market-item.rarity-common { border-color: rgba(205,216,218,0.35); }
.mmo-market-item.rarity-uncommon { border-color: rgba(143, 232, 137, 0.72); }
.mmo-market-item.rarity-rare { border-color: rgba(85, 221, 234, 0.78); }
.mmo-market-item.rarity-epic { border-color: rgba(212, 155, 231, 0.86); }
.mmo-market-item.is-focused {
  border-color: #55ddea;
  box-shadow: 0 0 0 2px rgba(85,221,234,0.78), 0 0 24px rgba(85,221,234,0.28);
}
.mmo-market-count,
.mmo-market-price {
  border-radius: 999px;
  font-size: 10px;
  font-weight: 900;
  line-height: 1;
  padding: 3px 5px;
  position: absolute;
}
.mmo-market-count {
  background: rgba(8, 12, 14, 0.78);
  color: #d9e7e9;
  right: 5px;
  top: 5px;
}
.mmo-market-price {
  background: linear-gradient(180deg, #ffd36a, #b47a2c);
  bottom: 5px;
  color: #17100a;
  right: 5px;
}
.mmo-market-empty {
  align-items: center;
  color: #9fb0b6;
  display: grid;
  font-size: 12px;
  grid-column: 1 / -1;
  justify-items: center;
}
.mmo-market-action {
  align-items: center;
  background: linear-gradient(90deg, rgba(28, 80, 47, 0.78), rgba(14, 36, 32, 0.76));
  border: 1px solid rgba(108, 232, 134, 0.66);
  border-radius: 8px;
  color: #e8ffe8;
  display: grid;
  font-size: 15px;
  font-weight: 800;
  gap: 4px;
  min-height: 54px;
  padding: 8px 14px;
  text-align: center;
}
@media (max-width: 760px) {
  .mmo-npc-menu-layer {
    align-items: end stretch;
    inset: 10px;
  }
  .mmo-dialog-frame {
    grid-template-columns: 1fr;
    margin-bottom: 0;
    max-height: calc(100vh - 20px);
    overflow: auto;
    padding: 12px;
    width: 100%;
  }
  .mmo-dialog-portrait {
    grid-template-columns: 82px minmax(0, 1fr);
  }
  .mmo-dialog-portrait-image {
    grid-row: span 2;
  }
  .mmo-dialog-speech {
    font-size: 16px;
    min-height: 92px;
    padding: 14px;
  }
  .mmo-market-frame {
    margin-bottom: 0;
    max-height: calc(100vh - 20px);
    overflow: auto;
    width: 100%;
  }
  .mmo-market-panes {
    grid-template-columns: 1fr;
  }
  .mmo-market-grid {
    grid-template-columns: repeat(4, minmax(48px, 1fr));
    min-height: 124px;
  }
  .mmo-market-header h2 {
    font-size: 20px;
  }
}
`;
  (doc.head ?? doc.documentElement).append(style);
}

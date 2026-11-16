import type { MmoUiController } from "./core.ts"
import { renderMmoLogin } from "./mmo-login.ts"
import { createMmoUiShellApi } from "./mmo-shell-api.ts"
import type { MmoUiShellRenderers, MmoUiShellState, MmoUiShellView } from "./mmo-shell-api.ts"
import type {  MmoUiPanelPayload, MmoUiShell, MmoUiShellConfig, MmoUiTheme } from "./mmo-shell-contracts.ts"
import type {

  MmoUiEquipmentPayload,
  MmoUiHotbarPayload,
  MmoUiInventoryPayload,
  MmoUiLoginPayload,
  MmoUiToolbarPayload
} from "./model.ts"

export {
  createHtmlDialog,
  createHtmlTooltip,
  createHtmlTooltipOutlet,
  defaultHtmlDialogTheme,
  defaultHtmlTooltipTheme,
  showHtmlDialog,
} from "./html-overlays.ts"
export type {
  HtmlDialog,
  HtmlDialogButton,
  HtmlDialogButtonTone,
  HtmlDialogCloseReason,
  HtmlDialogConfig,
  HtmlDialogContent,
  HtmlDialogElements,
  HtmlDialogResult,
  HtmlDialogTheme,
  HtmlTooltip,
  HtmlTooltipConfig,
  HtmlTooltipContent,
  HtmlTooltipElements,
  HtmlTooltipOutlet,
  HtmlTooltipOutletConfig,
  HtmlTooltipPayload,
  HtmlTooltipPlacement,
  HtmlTooltipTheme,
  HtmlTooltipTrigger,
  HtmlTooltipTriggerInput,
} from "./html-overlays.ts"

export { connectUiRenderer, createMmoUiController } from "./core.ts"
export {
  applyEngineUiTheme,
  createEngineUiControlStyles,
  createEngineUiThemeVariables,
  createRovingFocusController,
  createSingleOpenPanelState,
  defaultEngineUiTheme,
  ensureEngineUiControlStyles,
  resolveEngineUiTheme
} from "./controls.ts"
export type {
  ConnectedUiRenderer,
  MmoUiController,
  MmoUiControllerActions,
  MmoUiControllerConfig,
  MmoUiControllerState,
  UiController,
  UiRenderAdapter
} from "./core.ts"
export type {
  EngineUiControlStyleOptions,
  EngineUiTheme,
  EngineUiThemeVariableOptions,
  EnsureEngineUiControlStyleOptions,
  RovingFocusController,
  RovingFocusControllerConfig,
  SingleOpenPanelState,
  SingleOpenPanelStateConfig
} from "./controls.ts"
export type {
  MmoUiDebugEntry,
  MmoUiEquipmentPayload,
  MmoUiEquipmentSlot,
  MmoUiHotbarPayload,
  MmoUiHotbarSlot,
  MmoUiInventoryItem,
  MmoUiInventoryPayload,
  MmoUiLoginPayload,
  MmoUiStatEntry,
  MmoUiToolbarAction,
  MmoUiToolbarPayload,
  MmoUiTone
} from "./model.ts"

export type { MmoUiLoginConfig } from "./mmo-login.ts"
export type {
  MmoUiDebugConfig,
  MmoUiEquipmentConfig,
  MmoUiHotbarConfig,
  MmoUiInventoryConfig,
  MmoUiPanelConfig,
  MmoUiPanelPayload,
  MmoUiShell,
  MmoUiShellConfig,
  MmoUiShellElements,
  MmoUiStatsConfig,
  MmoUiTheme
} from "./mmo-shell-contracts.ts"

export const darkFantasyMmoUiTheme: MmoUiTheme = {
  surface: "#16120f",
  surfaceAlt: "#241a17",
  border: "#6f5532",
  accent: "#d8b56a",
  accentSoft: "#4a3422",
  text: "#f3ead7",
  muted: "#b9a98e",
  danger: "#d96b5f",
  success: "#8bbf7f",
  shadow: "0 18px 60px rgba(0, 0, 0, 0.42)",
  fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
  radius: "8px",
  zIndex: 20
}

const styleId = "catalog-engine-mmo-ui"

interface MmoUiShellRendererOptions {
  doc: Document
  config: MmoUiShellConfig
  controller: MmoUiController | undefined
  state: MmoUiShellState
  view: MmoUiShellView
  emitLogin(payload: MmoUiLoginPayload): void
  emitToolbar(payload: MmoUiToolbarPayload): void
  emitInventory(payload: MmoUiInventoryPayload): void
  emitEquipment(payload: MmoUiEquipmentPayload): void
  emitHotbar(payload: MmoUiHotbarPayload): void
  togglePanel(id: string): void
}

function createMmoUiShellRenderers(options: MmoUiShellRendererOptions): MmoUiShellRenderers {
  const { config, controller, doc, state, view } = options
  const renderLogin = () => renderMmoLogin(doc, view.login, config.login, controller, options.emitLogin)

  function renderToolbar() {
    const actions = state.toolbarActions.map((action) => {
      const button = doc.createElement("button")
      button.className = `ce-mmo-tool${action.active ? " is-active" : ""}`
      button.type = "button"
      button.disabled = action.disabled ?? false
      button.title = action.title ?? action.label
      button.setAttribute("aria-label", action.title ?? action.label)
      button.textContent = action.label
      const renderedIcon = config.renderToolbarIcon?.({ action, document: doc })
      if (action.icon || renderedIcon) {
        const icon = createElement(doc, "span", "ce-mmo-tool-icon")
        icon.setAttribute("aria-hidden", "true")
        // Icons are untrusted UI data. Treat strings as text instead of parsing markup.
        if (renderedIcon) icon.appendChild(renderedIcon.cloneNode(true))
        else icon.textContent = action.icon ?? ""
        const label = createElement(doc, "span", "ce-mmo-tool-label", action.label)
        replace(button, icon, label)
      }
      button.addEventListener("click", () => {
        if (!action.disabled) options.emitToolbar({ id: action.id, action })
      })
      return button
    })
    replace(view.toolbar, ...actions)
  }

  function renderPanels() {
    const panelNodes = state.panelConfigs.map((panel) => {
      const article = createElement(doc, "article", "ce-mmo-panel")
      const header = createElement(doc, "button", "ce-mmo-panel-header")
      const open = state.openPanels.has(panel.id)
      header.type = "button"
      header.setAttribute("aria-expanded", String(open))
      const title = createElement(doc, "span", "ce-mmo-panel-title", panel.title)
      const toggle = createElement(doc, "span", "ce-mmo-panel-toggle", open ? "x" : "+")
      header.title = open ? `Close ${panel.title}` : `Open ${panel.title}`
      append(header, title, toggle)
      header.addEventListener("click", () => options.togglePanel(panel.id))
      article.appendChild(header)
      if (open) {
        const bodyNode = createElement(doc, "div", "ce-mmo-panel-body")
        if (typeof panel.content === "string" || panel.content === undefined) bodyNode.textContent = panel.content ?? ""
        else bodyNode.appendChild(panel.content)
        article.appendChild(bodyNode)
      }
      return article
    })
    replace(view.panels, ...panelNodes)
  }

  function renderInventory() {
    const title = widgetTitle(doc, config.inventory?.title ?? "Inventory")
    const grid = createElement(doc, "div", "ce-mmo-slot-grid")
    const nodes = state.inventoryItems.map((item) => {
      const button = doc.createElement("button")
      button.className = `ce-mmo-item ce-rarity-${item.rarity ?? "common"}`
      button.type = "button"
      button.disabled = item.disabled ?? false
      button.title = item.description ?? item.name
      button.textContent = `${item.icon ? `${item.icon} ` : ""}${item.name}${item.quantity ? ` x${item.quantity}` : ""}`
      button.addEventListener("click", () => {
        if (!item.disabled) options.emitInventory({ id: item.id, item })
      })
      return button
    })
    replace(grid, ...(nodes.length ? nodes : [emptyState(doc, config.inventory?.emptyText ?? "No items")]))
    replace(view.inventory, title, grid)
  }

  function renderEquipment() {
    const title = widgetTitle(doc, config.equipment?.title ?? "Equipment")
    const grid = createElement(doc, "div", "ce-mmo-slot-grid")
    const nodes = state.equipmentSlots.map((slot) => {
      const button = doc.createElement("button")
      button.className = "ce-mmo-slot"
      button.type = "button"
      button.disabled = slot.locked ?? false
      button.textContent = `${slot.label}: ${slot.item?.name ?? "Empty"}`
      button.addEventListener("click", () => {
        if (!slot.locked) options.emitEquipment({ id: slot.id, slot })
      })
      return button
    })
    replace(grid, ...(nodes.length ? nodes : [emptyState(doc, "No slots")]))
    replace(view.equipment, title, grid)
  }

  function renderHotbar() {
    const nodes = state.hotbarSlots.map((slot) => {
      const button = doc.createElement("button")
      button.className = "ce-mmo-hotbar-slot"
      button.type = "button"
      button.disabled = slot.disabled ?? false
      const label = slot.item?.name ?? slot.label ?? "Empty"
      const binding = slot.binding ? `[${slot.binding}] ` : ""
      const cooldown = slot.cooldown && slot.cooldown > 0 ? ` (${Math.ceil(slot.cooldown)}s)` : ""
      button.textContent = `${binding}${label}${cooldown}`
      button.addEventListener("click", () => {
        if (!slot.disabled) options.emitHotbar({ id: slot.id, slot })
      })
      return button
    })
    replace(view.hotbar, ...nodes)
  }

  function renderStats() {
    const title = widgetTitle(doc, config.stats?.title ?? "Stats")
    const rows = state.statEntries.map((entry) => {
      const row = createElement(doc, "div", `ce-mmo-stat ce-tone-${entry.tone ?? "normal"}`)
      append(row, createElement(doc, "span", "ce-mmo-stat-label", entry.label), createElement(doc, "span", "ce-mmo-stat-value", String(entry.value)))
      if (typeof entry.value === "number" && typeof entry.max === "number" && entry.max > 0) {
        const bar = createElement(doc, "span", "ce-mmo-meter")
        const fill = createElement(doc, "span", "ce-mmo-meter-fill")
        setStyle(fill, "width", `${Math.max(0, Math.min(1, entry.value / entry.max)) * 100}%`)
        bar.appendChild(fill)
        row.appendChild(bar)
      }
      return row
    })
    replace(view.stats, title, ...(rows.length ? rows : [emptyState(doc, "No stats")]))
  }

  function renderDebug() {
    const title = widgetTitle(doc, config.debug?.title ?? "Debug")
    const rows = state.debugEntries.map((entry) => {
      const row = createElement(doc, "div", "ce-mmo-debug-row")
      append(row, createElement(doc, "span", "ce-mmo-debug-label", entry.label), createElement(doc, "span", "ce-mmo-debug-value", String(entry.value ?? "")))
      return row
    })
    replace(view.debug, title, ...(rows.length ? rows : [emptyState(doc, "No debug data")]))
  }

  function renderAll() {
    renderLogin()
    renderToolbar()
    renderPanels()
    renderInventory()
    renderEquipment()
    renderHotbar()
    renderStats()
    renderDebug()
  }

  return { renderLogin, renderToolbar, renderPanels, renderInventory, renderEquipment, renderHotbar, renderStats, renderDebug, renderAll }
}

export function createMmoUiShell(config: MmoUiShellConfig = {}): MmoUiShell {
  const doc = config.document ?? config.root?.ownerDocument ?? globalThis.document
  if (!doc) throw new Error("createMmoUiShell requires a DOM document or root element")
  const controller = config.controller
  const initialState = controller?.getSnapshot()
  ensureBaseStyle(doc)

  const host = config.root ?? doc.createElement("div")
  const shell = createElement(doc, "div", "ce-mmo-shell")
  const login = createElement(doc, "section", "ce-mmo-login")
  const chrome = createElement(doc, "section", "ce-mmo-chrome")
  const topbar = createElement(doc, "div", "ce-mmo-topbar")
  const heading = createElement(doc, "div", "ce-mmo-title", initialState?.title ?? config.title ?? "MMO Realm")
  const status = createElement(doc, "div", "ce-mmo-status", initialState?.status ?? config.status ?? "Ready")
  const toolbar = createElement(doc, "nav", "ce-mmo-toolbar")
  const body = createElement(doc, "section", "ce-mmo-body")
  const panels = createElement(doc, "section", "ce-mmo-panels")
  const sidebar = createElement(doc, "aside", "ce-mmo-sidebar")
  const inventory = createElement(doc, "section", "ce-mmo-widget ce-mmo-inventory")
  const equipment = createElement(doc, "section", "ce-mmo-widget ce-mmo-equipment")
  const stats = createElement(doc, "section", "ce-mmo-widget ce-mmo-stats")
  const debug = createElement(doc, "section", "ce-mmo-widget ce-mmo-debug")
  const hotbar = createElement(doc, "section", "ce-mmo-hotbar")

  append(topbar, heading, status)
  append(chrome, topbar, toolbar)
  append(sidebar, inventory, equipment, stats, debug)
  append(body, panels, sidebar)
  append(shell, login, chrome, body, hotbar)
  host.appendChild(shell)

  const view: MmoUiShellView = { host, shell, login, toolbar, panels, inventory, equipment, hotbar, stats, debug, status, heading }
  const panelConfigs = [...(initialState?.panels ?? config.panels ?? [])]
  const state: MmoUiShellState = {
    controllerState: initialState,
    toolbarActions: [...(initialState?.toolbar ?? config.toolbar ?? [])],
    panelConfigs,
    inventoryItems: [...(initialState?.inventory ?? config.inventory?.items ?? [])],
    equipmentSlots: [...(initialState?.equipment ?? config.equipment?.slots ?? [])],
    hotbarSlots: [...(initialState?.hotbar ?? config.hotbar?.slots ?? [])],
    statEntries: [...(initialState?.stats ?? config.stats?.entries ?? [])],
    debugEntries: [...(initialState?.debug ?? config.debug?.entries ?? [])],
    openPanels: new Set(initialState?.openPanelIds ?? panelConfigs.filter((panel) => panel.open ?? true).map((panel) => panel.id))
  }

  function emitLogin(payload: MmoUiLoginPayload) {
    if (controller && !controller.actions.login(payload.playerName)) return
    config.login && config.login.onSubmit?.(payload)
    config.onLogin?.(payload)
  }

  function emitToolbar(payload: MmoUiToolbarPayload) {
    if (controller && !controller.actions.selectToolbarAction(payload.id)) return
    config.onToolbarAction?.(payload)
  }

  function emitPanel(payload: MmoUiPanelPayload) {
    config.onPanelToggle?.(payload)
  }

  function emitInventory(payload: MmoUiInventoryPayload) {
    if (controller && !controller.actions.selectInventoryItem(payload.id)) return
    config.inventory?.onSelectItem?.(payload)
    config.onInventoryItem?.(payload)
  }

  function emitEquipment(payload: MmoUiEquipmentPayload) {
    if (controller && !controller.actions.selectEquipmentSlot(payload.id)) return
    config.equipment?.onSelectSlot?.(payload)
    config.onEquipmentSlot?.(payload)
  }

  function emitHotbar(payload: MmoUiHotbarPayload) {
    if (controller && !controller.actions.activateHotbarSlot(payload.id)) return
    config.hotbar?.onActivate?.(payload)
    config.onHotbarActivate?.(payload)
  }

  let renderers: MmoUiShellRenderers
  function setPanelOpen(id: string, open: boolean) {
    const panel = state.panelConfigs.find((candidate) => candidate.id === id)
    if (!panel) return
    if (controller) {
      if (controller.actions.setPanelOpen(id, open)) emitPanel({ id, panel, open })
      return
    }
    if (open) state.openPanels.add(id)
    else state.openPanels.delete(id)
    renderers.renderPanels()
    emitPanel({ id, panel, open })
  }

  const togglePanel = (id: string) => setPanelOpen(id, !state.openPanels.has(id))
  renderers = createMmoUiShellRenderers({
    doc,
    config,
    controller,
    state,
    view,
    emitLogin,
    emitToolbar,
    emitInventory,
    emitEquipment,
    emitHotbar,
    togglePanel
  })

  function syncFromController() {
    if (!controller) return
    const next = controller.getSnapshot()
    const previous = state.controllerState
    state.controllerState = next
    if (next.title !== previous?.title) heading.textContent = next.title
    if (next.status !== previous?.status) status.textContent = next.status
    if (next.loginVisible !== previous?.loginVisible) renderers.renderLogin()
    if (next.toolbar !== previous?.toolbar) {
      state.toolbarActions = [...next.toolbar]
      renderers.renderToolbar()
    }
    if (next.panels !== previous?.panels || next.openPanelIds !== previous?.openPanelIds) {
      state.panelConfigs = [...next.panels]
      state.openPanels = new Set(next.openPanelIds)
      renderers.renderPanels()
    }
    if (next.inventory !== previous?.inventory) {
      state.inventoryItems = [...next.inventory]
      renderers.renderInventory()
    }
    if (next.equipment !== previous?.equipment) {
      state.equipmentSlots = [...next.equipment]
      renderers.renderEquipment()
    }
    if (next.hotbar !== previous?.hotbar) {
      state.hotbarSlots = [...next.hotbar]
      renderers.renderHotbar()
    }
    if (next.stats !== previous?.stats) {
      state.statEntries = [...next.stats]
      renderers.renderStats()
    }
    if (next.debug !== previous?.debug) {
      state.debugEntries = [...next.debug]
      renderers.renderDebug()
    }
  }

  function setTheme(theme?: Partial<MmoUiTheme>) {
    const next = { ...darkFantasyMmoUiTheme, ...(theme ?? {}) }
    for (const [key, value] of Object.entries(next)) setStyle(shell, "--ce-mmo-" + toKebabCase(key), String(value))
  }

  let unsubscribeController = () => {}
  const api = createMmoUiShellApi({
    controller,
    state,
    view,
    renderers,
    setPanelOpen,
    togglePanel,
    setTheme,
    unsubscribeController: () => unsubscribeController()
  })
  setTheme(config.theme)
  renderers.renderAll()
  unsubscribeController = controller?.subscribe(syncFromController) ?? (() => {})
  return api
}

function createElement<K extends keyof HTMLElementTagNameMap>(
  doc: Document,
  tagName: K,
  className: string,
  textContent?: string
): HTMLElementTagNameMap[K] {
  const element = doc.createElement(tagName)
  element.className = className
  if (textContent !== undefined) element.textContent = textContent
  return element
}

function append(parent: Node, ...children: Node[]) {
  for (const child of children) parent.appendChild(child)
}

function replace(parent: Element, ...children: Node[]) {
  parent.replaceChildren(...children)
}

function widgetTitle(doc: Document, text: string) {
  return createElement(doc, "h2", "ce-mmo-widget-title", text)
}

function emptyState(doc: Document, text: string) {
  return createElement(doc, "div", "ce-mmo-empty", text)
}

function setStyle(element: Pick<HTMLElement, "style">, property: string, value: string) {
  element.style.setProperty(property, value)
}

function toKebabCase(value: string) {
  return value.replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`)
}

const mmoBaseStyle = `
.ce-mmo-shell {
  box-sizing: border-box;
  color: var(--ce-mmo-text);
  display: grid;
  font-family: var(--ce-mmo-font-family);
  gap: 10px;
  grid-template-rows: auto auto 1fr auto;
  min-height: 100%;
  position: relative;
  z-index: var(--ce-mmo-z-index);
}
.ce-mmo-shell *, .ce-mmo-shell *::before, .ce-mmo-shell *::after { box-sizing: border-box; }
.ce-mmo-login-form, .ce-mmo-chrome, .ce-mmo-panel, .ce-mmo-widget, .ce-mmo-hotbar {
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--ce-mmo-surface) 94%, white 4%), color-mix(in srgb, var(--ce-mmo-surface) 92%, black 18%));
  border: 1px solid color-mix(in srgb, var(--ce-mmo-border) 82%, var(--ce-mmo-accent) 18%);
  border-radius: var(--ce-mmo-radius);
  box-shadow: var(--ce-mmo-shadow);
}
.ce-mmo-login-form { align-items: end; display: flex; flex-wrap: wrap; gap: 10px; padding: 12px; }
.ce-mmo-login-title { color: var(--ce-mmo-accent); font-weight: 700; min-width: 120px; }
.ce-mmo-field { display: grid; gap: 4px; min-width: 180px; }
.ce-mmo-field-label, .ce-mmo-status, .ce-mmo-empty, .ce-mmo-debug-label { color: var(--ce-mmo-muted); font-size: 12px; }
.ce-mmo-input, .ce-mmo-button, .ce-mmo-tool, .ce-mmo-panel-header, .ce-mmo-item, .ce-mmo-slot, .ce-mmo-hotbar-slot {
  border: 1px solid var(--ce-mmo-border);
  border-radius: calc(var(--ce-mmo-radius) - 2px);
  color: var(--ce-mmo-text);
  font: inherit;
}
.ce-mmo-input { background: var(--ce-mmo-surface-alt); padding: 8px 10px; }
.ce-mmo-button, .ce-mmo-tool, .ce-mmo-panel-header, .ce-mmo-item, .ce-mmo-slot, .ce-mmo-hotbar-slot {
  background: color-mix(in srgb, var(--ce-mmo-accent-soft) 84%, black 16%);
  cursor: pointer;
  padding: 8px 10px;
}
.ce-mmo-primary, .ce-mmo-tool.is-active {
  background: linear-gradient(180deg, var(--ce-mmo-accent), color-mix(in srgb, var(--ce-mmo-accent) 72%, #6d461f));
  color: #1b130d;
  font-weight: 700;
}
.ce-mmo-button:disabled, .ce-mmo-tool:disabled, .ce-mmo-item:disabled, .ce-mmo-slot:disabled, .ce-mmo-hotbar-slot:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}
.ce-mmo-login-message { color: var(--ce-mmo-danger); min-height: 18px; min-width: 120px; }
.ce-mmo-chrome { display: grid; gap: 10px; padding: 8px; }
.ce-mmo-topbar { align-items: center; display: flex; gap: 12px; justify-content: space-between; }
.ce-mmo-title { color: var(--ce-mmo-accent); font-weight: 800; letter-spacing: 0; }
.ce-mmo-toolbar, .ce-mmo-hotbar { display: flex; flex-wrap: wrap; gap: 6px; }
.ce-mmo-tool {
  align-items: center;
  display: inline-grid;
  gap: 3px;
  justify-items: center;
  min-height: 38px;
  min-width: 38px;
  padding: 5px 7px;
}
.ce-mmo-tool-icon {
  display: inline-grid;
  height: 20px;
  place-items: center;
  width: 20px;
}
.ce-mmo-tool-icon svg {
  display: block;
  height: 20px;
  stroke: currentColor;
  width: 20px;
}
.ce-mmo-tool-label {
  font-size: 10px;
  font-weight: 800;
  line-height: 1;
}
.ce-mmo-body { align-items: start; display: grid; gap: 12px; grid-template-columns: minmax(0, 1fr) minmax(220px, 320px); }
.ce-mmo-panels, .ce-mmo-sidebar { display: grid; gap: 10px; }
.ce-mmo-panel, .ce-mmo-widget { overflow: hidden; }
.ce-mmo-panel-header {
  align-items: center;
  background: linear-gradient(180deg, color-mix(in srgb, var(--ce-mmo-surface-alt) 92%, white 6%), var(--ce-mmo-surface-alt));
  border: 0;
  border-radius: 0;
  color: var(--ce-mmo-accent);
  display: grid;
  gap: 10px;
  grid-template-columns: minmax(0, 1fr) auto;
  font-weight: 700;
  text-align: left;
  width: 100%;
}
.ce-mmo-panel-title { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ce-mmo-panel-toggle {
  border: 1px solid color-mix(in srgb, var(--ce-mmo-border) 72%, var(--ce-mmo-accent));
  border-radius: 999px;
  display: inline-grid;
  height: 22px;
  place-items: center;
  width: 22px;
}
.ce-mmo-panel-body, .ce-mmo-widget { padding: 10px; }
.ce-mmo-widget-title { color: var(--ce-mmo-accent); font-size: 13px; margin: 0 0 8px; }
.ce-mmo-slot-grid { display: grid; gap: 6px; grid-template-columns: repeat(auto-fit, minmax(96px, 1fr)); }
.ce-mmo-item, .ce-mmo-slot, .ce-mmo-hotbar-slot { min-height: 38px; text-align: left; }
.ce-rarity-rare, .ce-rarity-epic, .ce-rarity-legendary { border-color: var(--ce-mmo-accent); }
.ce-mmo-stat, .ce-mmo-debug-row { display: grid; gap: 4px; grid-template-columns: 1fr auto; padding: 5px 0; }
.ce-mmo-meter { background: var(--ce-mmo-surface-alt); border-radius: 999px; grid-column: 1 / -1; height: 6px; overflow: hidden; }
.ce-mmo-meter-fill { background: var(--ce-mmo-accent); display: block; height: 100%; }
.ce-tone-danger .ce-mmo-meter-fill { background: var(--ce-mmo-danger); }
.ce-tone-success .ce-mmo-meter-fill { background: var(--ce-mmo-success); }
@media (max-width: 720px) {
  .ce-mmo-body { grid-template-columns: 1fr; }
}
`
function ensureBaseStyle(doc: Document) {
  if (doc.getElementById?.(styleId)) return
  const style = doc.createElement("style")
  style.id = styleId; style.textContent = mmoBaseStyle
  const parent = doc.head ?? doc.documentElement
  parent?.appendChild(style)
}

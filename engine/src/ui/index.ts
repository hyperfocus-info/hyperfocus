import type { MmoUiController } from "./core.ts"
import type {
  MmoUiDebugEntry,
  MmoUiEquipmentPayload,
  MmoUiEquipmentSlot,
  MmoUiHotbarPayload,
  MmoUiHotbarSlot,
  MmoUiInventoryItem,
  MmoUiInventoryPayload,
  MmoUiLoginPayload,
  MmoUiPanelData,
  MmoUiStatEntry,
  MmoUiToolbarAction,
  MmoUiToolbarPayload,
  MmoUiTone
} from "./model.ts"

export { connectUiRenderer, createMmoUiController } from "./core.ts"
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

export interface MmoUiTheme {
  surface: string
  surfaceAlt: string
  border: string
  accent: string
  accentSoft: string
  text: string
  muted: string
  danger: string
  success: string
  shadow: string
  fontFamily: string
  radius: string
  zIndex: number
}

export interface MmoUiLoginConfig {
  title?: string
  nameLabel?: string
  namePlaceholder?: string
  defaultName?: string
  submitLabel?: string
  hidden?: boolean
  message?: string
  onSubmit?: (payload: MmoUiLoginPayload) => void
}

export interface MmoUiPanelConfig extends MmoUiPanelData<string | Node> {}

export interface SingleOpenPanelState<TPanel extends string = string> {
  readonly activePanel: TPanel | ""
  isPanel(value: string): value is TPanel
  open(name: string): TPanel | ""
  toggle(name: string): TPanel | ""
  close(): ""
  panelIds(): TPanel[]
}

export interface SingleOpenPanelStateConfig<TPanel extends string = string> {
  panels: readonly TPanel[]
  initialPanel?: string
}

export interface RovingFocusControllerConfig<TElement extends HTMLElement = HTMLElement> {
  getTargets: () => readonly (TElement | null | undefined)[]
  focusClass?: string
  initialIndex?: number
  root?: Pick<ParentNode, "querySelectorAll">
  document?: Pick<Document, "activeElement">
  preventScroll?: boolean
  shouldFocus?: () => boolean
  isAvailable?: (target: TElement) => boolean
  onFocus?: (target: TElement, index: number, targets: readonly TElement[]) => void
}

export interface RovingFocusController<TElement extends HTMLElement = HTMLElement> {
  readonly index: number
  targets(): TElement[]
  focus(index: number): TElement | undefined
  move(delta: number): TElement | undefined
  activate(): TElement | undefined
  clear(): void
}

export interface EngineUiTheme {
  surface: string
  surfaceAlt: string
  border: string
  accent: string
  accentText: string
  text: string
  muted: string
  danger: string
  success: string
  shadow: string
  focusRing: string
  controlSurface: string
  controlSurfaceHover: string
  controlBorder: string
  controlText: string
  inputSurface: string
  fontFamily: string
  radius: string
  disabledOpacity: number
  zIndex: number
}

export interface EngineUiThemeVariableOptions {
  prefix?: string
}

export interface EngineUiControlStyleOptions extends EngineUiThemeVariableOptions {
  classPrefix?: string
  selectorScope?: string
}

export interface EnsureEngineUiControlStyleOptions extends EngineUiControlStyleOptions {
  document?: Document
  styleId?: string
}

export interface MmoUiInventoryConfig {
  title?: string
  emptyText?: string
  items?: readonly MmoUiInventoryItem[]
  onSelectItem?: (payload: MmoUiInventoryPayload) => void
}

export interface MmoUiEquipmentConfig {
  title?: string
  slots?: readonly MmoUiEquipmentSlot[]
  onSelectSlot?: (payload: MmoUiEquipmentPayload) => void
}

export interface MmoUiHotbarConfig {
  slots?: readonly MmoUiHotbarSlot[]
  onActivate?: (payload: MmoUiHotbarPayload) => void
}

export interface MmoUiStatsConfig {
  title?: string
  entries?: readonly MmoUiStatEntry[]
}

export interface MmoUiDebugConfig {
  title?: string
  entries?: readonly MmoUiDebugEntry[]
}

export interface MmoUiPanelPayload {
  id: string
  panel: MmoUiPanelConfig
  open: boolean
}

export interface MmoUiShellConfig {
  root?: HTMLElement
  document?: Document
  title?: string
  status?: string
  theme?: Partial<MmoUiTheme>
  login?: false | MmoUiLoginConfig
  toolbar?: readonly MmoUiToolbarAction[]
  panels?: readonly MmoUiPanelConfig[]
  inventory?: MmoUiInventoryConfig
  equipment?: MmoUiEquipmentConfig
  hotbar?: MmoUiHotbarConfig
  stats?: MmoUiStatsConfig
  debug?: MmoUiDebugConfig
  controller?: MmoUiController<string | Node>
  onLogin?: (payload: MmoUiLoginPayload) => void
  onToolbarAction?: (payload: MmoUiToolbarPayload) => void
  onPanelToggle?: (payload: MmoUiPanelPayload) => void
  onInventoryItem?: (payload: MmoUiInventoryPayload) => void
  onEquipmentSlot?: (payload: MmoUiEquipmentPayload) => void
  onHotbarActivate?: (payload: MmoUiHotbarPayload) => void
}

export interface MmoUiShellElements {
  host: HTMLElement
  shell: HTMLElement
  login: HTMLElement
  toolbar: HTMLElement
  panels: HTMLElement
  inventory: HTMLElement
  equipment: HTMLElement
  hotbar: HTMLElement
  stats: HTMLElement
  debug: HTMLElement
  status: HTMLElement
}

export interface MmoUiShell {
  root: HTMLElement
  elements: MmoUiShellElements
  mount(target: HTMLElement): HTMLElement
  destroy(): void
  setTheme(theme?: Partial<MmoUiTheme>): void
  setStatus(status: string): void
  setLoginVisible(visible: boolean): void
  setToolbarActions(actions: readonly MmoUiToolbarAction[]): void
  setPanels(panels: readonly MmoUiPanelConfig[]): void
  setPanelOpen(id: string, open: boolean): void
  togglePanel(id: string): void
  setInventoryItems(items: readonly MmoUiInventoryItem[]): void
  setEquipmentSlots(slots: readonly MmoUiEquipmentSlot[]): void
  setHotbarSlots(slots: readonly MmoUiHotbarSlot[]): void
  setStats(entries: readonly MmoUiStatEntry[]): void
  setDebugEntries(entries: readonly MmoUiDebugEntry[]): void
}

export type HtmlDialogContent = string | Node | readonly (string | Node)[]
export type HtmlDialogCloseReason = "button" | "cancel" | "close"
export type HtmlDialogButtonTone = "normal" | "danger"

export interface HtmlDialogTheme {
  surface: string
  surfaceAlt: string
  border: string
  accent: string
  accentText: string
  text: string
  muted: string
  danger: string
  shadow: string
  backdrop: string
  fontFamily: string
  radius: string
  zIndex: number
}

export interface HtmlDialogButton<TValue extends string = string> {
  value: TValue
  label: string
  title?: string
  disabled?: boolean
  active?: boolean
  autoFocus?: boolean
  tone?: HtmlDialogButtonTone
}

export interface HtmlDialogResult<TValue extends string = string> {
  reason: HtmlDialogCloseReason
  value?: TValue
  button?: HtmlDialogButton<TValue>
}

export interface HtmlDialogConfig<TValue extends string = string> {
  document?: Document
  root?: HTMLElement
  title?: string
  description?: string
  content?: HtmlDialogContent
  buttons?: readonly HtmlDialogButton<TValue>[]
  closeLabel?: string
  closeOnBackdrop?: boolean
  closeOnCancel?: boolean
  modal?: boolean
  theme?: Partial<HtmlDialogTheme>
  onAction?: (result: HtmlDialogResult<TValue>) => void
  onClose?: (result: HtmlDialogResult<TValue>) => void
}

export interface HtmlDialogElements {
  dialog: HTMLDialogElement
  header: HTMLElement
  title: HTMLElement
  description: HTMLElement
  content: HTMLElement
  actions: HTMLElement
  close: HTMLButtonElement
}

export interface HtmlDialog<TValue extends string = string> {
  root: HTMLDialogElement
  elements: HtmlDialogElements
  open(config?: Partial<HtmlDialogConfig<TValue>>): void
  close(value?: TValue, reason?: HtmlDialogCloseReason): void
  destroy(): void
  setTitle(title?: string): void
  setDescription(description?: string): void
  setContent(content?: HtmlDialogContent): void
  setButtons(buttons?: readonly HtmlDialogButton<TValue>[]): void
  setTheme(theme?: Partial<HtmlDialogTheme>): void
}

export type HtmlTooltipContent = string | Node | readonly (string | Node)[]
export type HtmlTooltipPlacement = "top" | "right" | "bottom" | "left"
export type HtmlTooltipTrigger = "hover" | "focus" | "manual"
export type HtmlTooltipTriggerInput = HtmlTooltipTrigger | readonly HtmlTooltipTrigger[]

export interface HtmlTooltipTheme {
  surface: string
  border: string
  text: string
  muted: string
  shadow: string
  fontFamily: string
  radius: string
  zIndex: number
  maxWidth: string
}

export interface HtmlTooltipPayload {
  target?: HTMLElement
  tooltip: HTMLElement
  placement: HtmlTooltipPlacement
}

export interface HtmlTooltipOutletConfig {
  document?: Document
  root?: HTMLElement
  theme?: Partial<HtmlTooltipTheme>
}

export interface HtmlTooltipOutlet {
  root: HTMLElement
  mount(target: HTMLElement): HTMLElement
  destroy(): void
  setTheme(theme?: Partial<HtmlTooltipTheme>): void
}

export interface HtmlTooltipConfig {
  document?: Document
  target?: HTMLElement
  outlet?: HTMLElement | HtmlTooltipOutlet
  id?: string
  title?: string
  content?: HtmlTooltipContent
  placement?: HtmlTooltipPlacement
  offset?: number
  showDelayMs?: number
  hideDelayMs?: number
  trigger?: HtmlTooltipTriggerInput
  hoverable?: boolean
  disabled?: boolean
  clampToViewport?: boolean
  theme?: Partial<HtmlTooltipTheme>
  onOpen?: (payload: HtmlTooltipPayload) => void
  onClose?: (payload: HtmlTooltipPayload) => void
}

export interface HtmlTooltipElements {
  tooltip: HTMLElement
  title: HTMLElement
  content: HTMLElement
}

export interface HtmlTooltip {
  root: HTMLElement
  outlet: HtmlTooltipOutlet
  elements: HtmlTooltipElements
  open(config?: Partial<HtmlTooltipConfig>): void
  close(): void
  destroy(): void
  setTarget(target?: HTMLElement): void
  setOutlet(outlet: HTMLElement | HtmlTooltipOutlet): void
  setTitle(title?: string): void
  setContent(content?: HtmlTooltipContent): void
  setPlacement(placement?: HtmlTooltipPlacement): void
  setDisabled(disabled: boolean): void
  setTheme(theme?: Partial<HtmlTooltipTheme>): void
}

export const defaultHtmlDialogTheme: HtmlDialogTheme = {
  surface: "#ffffff",
  surfaceAlt: "#f8f6ff",
  border: "#d8cffd",
  accent: "#7c3ff2",
  accentText: "#ffffff",
  text: "#17151f",
  muted: "#8a8499",
  danger: "#c83245",
  shadow: "0 24px 70px rgba(34, 20, 84, 0.22)",
  backdrop: "rgba(18, 14, 31, 0.36)",
  fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
  radius: "8px",
  zIndex: 1000
}

export const defaultHtmlTooltipTheme: HtmlTooltipTheme = {
  surface: "#151922",
  border: "#384154",
  text: "#f6f1e8",
  muted: "#aeb7c6",
  shadow: "0 14px 42px rgba(0, 0, 0, 0.28)",
  fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
  radius: "6px",
  zIndex: 1100,
  maxWidth: "260px"
}

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

export const defaultEngineUiTheme: EngineUiTheme = {
  surface: "#151922",
  surfaceAlt: "#202636",
  border: "#3a465d",
  accent: "#7dd3fc",
  accentText: "#071018",
  text: "#f5f7fb",
  muted: "#aeb7c6",
  danger: "#f87171",
  success: "#86efac",
  shadow: "0 14px 42px rgba(0, 0, 0, 0.28)",
  focusRing: "rgba(125, 211, 252, 0.42)",
  controlSurface: "#253047",
  controlSurfaceHover: "#31405f",
  controlBorder: "#4b5c78",
  controlText: "#f5f7fb",
  inputSurface: "#101622",
  fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
  radius: "6px",
  disabledOpacity: 0.55,
  zIndex: 10
}

const styleId = "catalog-engine-mmo-ui"
let tooltipIdCounter = 0

export function resolveEngineUiTheme(theme: Partial<EngineUiTheme> = {}): EngineUiTheme {
  return { ...defaultEngineUiTheme, ...theme }
}

export function createEngineUiThemeVariables(
  theme: Partial<EngineUiTheme> = {},
  options: EngineUiThemeVariableOptions = {}
): Record<string, string> {
  const prefix = options.prefix ?? "ce-ui"
  const resolved = resolveEngineUiTheme(theme)
  const variables: Record<string, string> = {}
  for (const [key, value] of Object.entries(resolved)) {
    variables[`--${prefix}-${toKebabCase(key)}`] = String(value)
  }
  return variables
}

export function applyEngineUiTheme(
  target: Pick<HTMLElement, "style">,
  theme: Partial<EngineUiTheme> = {},
  options: EngineUiThemeVariableOptions = {}
): EngineUiTheme {
  const resolved = resolveEngineUiTheme(theme)
  const prefix = options.prefix ?? "ce-ui"
  for (const [key, value] of Object.entries(resolved)) {
    setStyle(target as HTMLElement, `--${prefix}-${toKebabCase(key)}`, String(value))
  }
  return resolved
}

export function createEngineUiControlStyles(options: EngineUiControlStyleOptions = {}): string {
  const prefix = options.prefix ?? "ce-ui"
  const classPrefix = options.classPrefix ?? prefix
  const scope = options.selectorScope ? `${options.selectorScope} ` : ""
  const panel = `${scope}.${classPrefix}-panel`
  const control = `${scope}.${classPrefix}-control`
  const button = `${scope}.${classPrefix}-button`
  const input = `${scope}.${classPrefix}-input`
  const focus = `${scope}.${classPrefix}-controller-focus`
  return `
${panel} {
  background: var(--${prefix}-surface);
  border: 1px solid var(--${prefix}-border);
  border-radius: var(--${prefix}-radius);
  box-shadow: var(--${prefix}-shadow);
  color: var(--${prefix}-text);
  font-family: var(--${prefix}-font-family);
  z-index: var(--${prefix}-z-index);
}
${control}, ${button}, ${input} {
  border: 1px solid var(--${prefix}-control-border);
  border-radius: var(--${prefix}-radius);
  box-sizing: border-box;
  color: var(--${prefix}-control-text);
  font: inherit;
  min-height: 34px;
}
${button}, ${control} {
  background: var(--${prefix}-control-surface);
  cursor: pointer;
  padding: 8px 12px;
}
${button}:hover, ${button}:focus-visible, ${button}.${classPrefix}-controller-focus,
${control}:hover, ${control}:focus-visible, ${control}.${classPrefix}-controller-focus, ${focus} {
  background: var(--${prefix}-control-surface-hover);
  outline: 2px solid var(--${prefix}-focus-ring);
  outline-offset: 2px;
}
${button}:disabled, ${control}:disabled {
  cursor: not-allowed;
  opacity: var(--${prefix}-disabled-opacity);
}
${input} {
  background: var(--${prefix}-input-surface);
  padding: 8px 10px;
}
`
}

export function ensureEngineUiControlStyles(options: EnsureEngineUiControlStyleOptions = {}): HTMLStyleElement {
  const doc = options.document ?? globalThis.document
  if (!doc) throw new Error("ensureEngineUiControlStyles requires a DOM document")
  const prefix = options.prefix ?? "ce-ui"
  const styleId = options.styleId ?? `${prefix}-control-styles`
  const existing = doc.getElementById?.(styleId)
  if (existing) return existing as HTMLStyleElement
  const style = doc.createElement("style")
  style.id = styleId
  style.textContent = createEngineUiControlStyles(options)
  const parent = doc.head ?? doc.documentElement
  parent?.appendChild(style)
  return style as HTMLStyleElement
}

export function createSingleOpenPanelState<TPanel extends string = string>(
  config: SingleOpenPanelStateConfig<TPanel>
): SingleOpenPanelState<TPanel> {
  const panels = new Set<string>(config.panels)
  let activePanel: TPanel | "" = panels.has(config.initialPanel ?? "") ? (config.initialPanel as TPanel) : ""

  function isPanel(value: string): value is TPanel {
    return panels.has(value)
  }

  return {
    get activePanel() {
      return activePanel
    },
    isPanel,
    open(name: string) {
      activePanel = isPanel(name) ? name : ""
      return activePanel
    },
    toggle(name: string) {
      if (!isPanel(name)) return activePanel
      activePanel = activePanel === name ? "" : name
      return activePanel
    },
    close() {
      activePanel = ""
      return activePanel
    },
    panelIds() {
      return activePanel ? [activePanel] : []
    }
  }
}

export function createRovingFocusController<TElement extends HTMLElement = HTMLElement>(
  config: RovingFocusControllerConfig<TElement>
): RovingFocusController<TElement> {
  const focusClass = config.focusClass ?? "controller-focus"
  const preventScroll = config.preventScroll ?? true
  let currentIndex = Math.max(0, Math.floor(config.initialIndex ?? 0))
  let lastTarget: TElement | undefined

  function isAvailable(target: TElement) {
    if (config.isAvailable) return config.isAvailable(target)
    const maybeTarget = target as TElement & { disabled?: boolean; hidden?: boolean }
    return !maybeTarget.disabled && !maybeTarget.hidden
  }

  function targets() {
    return config.getTargets().filter((target): target is TElement => Boolean(target) && isAvailable(target as TElement))
  }

  function clear() {
    const selector = `.${focusClass}`
    if (config.root?.querySelectorAll) {
      for (const element of Array.from(config.root.querySelectorAll(selector))) removeClass(element as HTMLElement, focusClass)
      return
    }
    for (const target of targets()) removeClass(target, focusClass)
    if (lastTarget) removeClass(lastTarget, focusClass)
  }

  function wrappedIndex(index: number, count: number) {
    return ((index % count) + count) % count
  }

  function activeTargetIndex(available: readonly TElement[]) {
    const active = config.document?.activeElement
    return active ? available.indexOf(active as TElement) : -1
  }

  function focus(index: number) {
    const available = targets()
    clear()
    if (!available.length) return undefined
    currentIndex = wrappedIndex(index, available.length)
    const target = available[currentIndex]
    lastTarget = target
    addClass(target, focusClass)
    config.onFocus?.(target, currentIndex, available)
    if (config.shouldFocus?.() ?? true) target.focus?.({ preventScroll })
    return target
  }

  return {
    get index() {
      return currentIndex
    },
    targets,
    focus,
    move(delta: number) {
      const available = targets()
      if (!available.length) return undefined
      const activeIndex = activeTargetIndex(available)
      return focus((activeIndex >= 0 ? activeIndex : currentIndex) + delta)
    },
    activate() {
      const available = targets()
      if (!available.length) return undefined
      const activeIndex = activeTargetIndex(available)
      const target = available[wrappedIndex(activeIndex >= 0 ? activeIndex : currentIndex, available.length)]
      target.click?.()
      return target
    },
    clear
  }
}

export function createHtmlDialog<TValue extends string = string>(config: HtmlDialogConfig<TValue> = {}): HtmlDialog<TValue> {
  const doc = config.document ?? config.root?.ownerDocument ?? globalThis.document
  if (!doc) throw new Error("createHtmlDialog requires a DOM document or root element")

  ensureBaseStyle(doc)

  const host = config.root ?? doc.body ?? doc.documentElement
  if (!host) throw new Error("createHtmlDialog requires a root element or document body")

  const dialog = doc.createElement("dialog") as HTMLDialogElement
  dialog.className = "ce-html-dialog"
  dialog.setAttribute("aria-modal", "true")

  const card = createElement(doc, "section", "ce-dialog-card")
  const header = createElement(doc, "header", "ce-dialog-header")
  const title = createElement(doc, "h2", "ce-dialog-title")
  const closeButton = doc.createElement("button")
  closeButton.className = "ce-dialog-close"
  closeButton.type = "button"
  closeButton.title = config.closeLabel ?? "Close"
  closeButton.setAttribute("aria-label", config.closeLabel ?? "Close")
  closeButton.textContent = "x"

  const description = createElement(doc, "p", "ce-dialog-description")
  const content = createElement(doc, "div", "ce-dialog-content")
  const actions = createElement(doc, "footer", "ce-dialog-actions")

  append(header, title, closeButton)
  append(card, header, description, content, actions)
  dialog.appendChild(card)
  host.appendChild(dialog)

  let closeOnBackdrop = config.closeOnBackdrop ?? true
  let closeOnCancel = config.closeOnCancel ?? true
  let modal = config.modal ?? true
  let onAction = config.onAction
  let onClose = config.onClose
  let pendingResult: HtmlDialogResult<TValue> | undefined
  let closed = true

  function result(reason: HtmlDialogCloseReason, value?: TValue, button?: HtmlDialogButton<TValue>): HtmlDialogResult<TValue> {
    return { reason, value, button }
  }

  function finish(nextResult: HtmlDialogResult<TValue>) {
    if (closed) return
    closed = true
    removeClass(dialog, "is-open")
    doc.removeEventListener("keydown", handleKeydown)
    onClose?.(nextResult)
  }

  function closeWith(nextResult: HtmlDialogResult<TValue>) {
    pendingResult = nextResult
    if (typeof dialog.close === "function" && dialog.open) {
      dialog.close(nextResult.value ?? "")
      return
    }
    dialog.removeAttribute("open")
    finish(nextResult)
  }

  function applyConfig(next: Partial<HtmlDialogConfig<TValue>>) {
    if ("title" in next) api.setTitle(next.title)
    if ("description" in next) api.setDescription(next.description)
    if ("content" in next) api.setContent(next.content)
    if ("buttons" in next) api.setButtons(next.buttons)
    if ("theme" in next) api.setTheme(next.theme)
    if ("closeLabel" in next && next.closeLabel !== undefined) {
      closeButton.title = next.closeLabel
      closeButton.setAttribute("aria-label", next.closeLabel)
    }
    if ("closeOnBackdrop" in next) closeOnBackdrop = next.closeOnBackdrop ?? true
    if ("closeOnCancel" in next) closeOnCancel = next.closeOnCancel ?? true
    if ("modal" in next) modal = next.modal ?? true
    if ("onAction" in next) onAction = next.onAction
    if ("onClose" in next) onClose = next.onClose
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key !== "Escape") return
    event.preventDefault()
    if (closeOnCancel) closeWith(result("cancel"))
  }

  closeButton.addEventListener("click", () => closeWith(result("close")))
  dialog.addEventListener("cancel", (event) => {
    if (!closeOnCancel) {
      event.preventDefault()
      return
    }
    pendingResult = result("cancel")
  })
  dialog.addEventListener("close", () => finish(pendingResult ?? result("close")))
  dialog.addEventListener("click", (event) => {
    if (closeOnBackdrop && event.target === dialog) closeWith(result("close"))
  })

  const api: HtmlDialog<TValue> = {
    root: dialog,
    elements: {
      dialog,
      header,
      title,
      description,
      content,
      actions,
      close: closeButton
    },
    open(nextConfig) {
      if (nextConfig) applyConfig(nextConfig)
      if (!dialog.parentNode) host.appendChild(dialog)
      pendingResult = undefined
      closed = false
      addClass(dialog, "is-open")
      doc.addEventListener("keydown", handleKeydown)
      if (modal && typeof dialog.showModal === "function" && !dialog.open) dialog.showModal()
      else if (typeof dialog.show === "function" && !dialog.open) dialog.show()
      else dialog.setAttribute("open", "")
      const activeButton = findActiveButton(actions)
      activeButton?.focus()
    },
    close(value, reason = "close") {
      closeWith(result(reason, value))
    },
    destroy() {
      if (!closed) closeWith(result("close"))
      dialog.remove()
    },
    setTitle(nextTitle) {
      title.textContent = nextTitle ?? ""
      title.hidden = !nextTitle
    },
    setDescription(nextDescription) {
      description.textContent = nextDescription ?? ""
      description.hidden = !nextDescription
    },
    setContent(nextContent) {
      replace(content, ...contentNodes(doc, nextContent))
      content.hidden = nextContent === undefined || (Array.isArray(nextContent) && nextContent.length === 0)
    },
    setButtons(nextButtons) {
      const buttons = normalizeDialogButtons(nextButtons)
      const activeIndex = activeDialogButtonIndex(buttons)
      const nodes = buttons.map((button, index) => {
        const node = doc.createElement("button")
        const active = index === activeIndex
        node.className = `ce-dialog-button${active ? " is-active" : ""}${button.tone === "danger" ? " is-danger" : ""}`
        node.type = "button"
        node.disabled = button.disabled ?? false
        node.textContent = button.label
        node.title = button.title ?? button.label
        if (active || button.autoFocus) node.setAttribute("data-active", "true")
        node.addEventListener("click", () => {
          if (node.disabled) return
          const nextResult = result("button", button.value, button)
          onAction?.(nextResult)
          closeWith(nextResult)
        })
        return node
      })
      replace(actions, ...nodes)
      actions.hidden = nodes.length === 0
    },
    setTheme(nextTheme) {
      const theme = { ...defaultHtmlDialogTheme, ...(nextTheme ?? {}) }
      for (const [key, value] of Object.entries(theme)) {
        setStyle(dialog, `--ce-dialog-${toKebabCase(key)}`, String(value))
      }
    }
  }

  applyConfig(config)
  if (!("title" in config)) api.setTitle(config.title)
  if (!("description" in config)) api.setDescription(config.description)
  if (!("content" in config)) api.setContent(config.content)
  if (!("buttons" in config)) api.setButtons(config.buttons)
  if (!("theme" in config)) api.setTheme(config.theme)
  return api
}

export function showHtmlDialog<TValue extends string = string>(config: HtmlDialogConfig<TValue>): Promise<HtmlDialogResult<TValue>> {
  return new Promise((resolve) => {
    const dialog = createHtmlDialog<TValue>({
      ...config,
      onClose(result) {
        config.onClose?.(result)
        dialog.destroy()
        resolve(result)
      }
    })
    dialog.open()
  })
}

export function createHtmlTooltipOutlet(config: HtmlTooltipOutletConfig = {}): HtmlTooltipOutlet {
  const doc = config.document ?? config.root?.ownerDocument ?? globalThis.document
  if (!doc) throw new Error("createHtmlTooltipOutlet requires a DOM document or root element")

  ensureBaseStyle(doc)

  const root = config.root ?? doc.createElement("div")
  addClass(root, "ce-html-tooltip-outlet")
  if (!root.parentNode) (doc.body ?? doc.documentElement).appendChild(root)

  const api: HtmlTooltipOutlet = {
    root,
    mount(target) {
      target.appendChild(root)
      return root
    },
    destroy() {
      root.remove()
    },
    setTheme(theme) {
      const next = { ...defaultHtmlTooltipTheme, ...(theme ?? {}) }
      for (const [key, value] of Object.entries(next)) {
        setStyle(root, `--ce-tooltip-${toKebabCase(key)}`, String(value))
      }
    }
  }

  api.setTheme(config.theme)
  return api
}

export function createHtmlTooltip(config: HtmlTooltipConfig = {}): HtmlTooltip {
  const doc = config.document ?? config.target?.ownerDocument ?? tooltipOutletRoot(config.outlet)?.ownerDocument ?? globalThis.document
  if (!doc) throw new Error("createHtmlTooltip requires a DOM document, target, or outlet")

  ensureBaseStyle(doc)

  let outlet = resolveTooltipOutlet(doc, config.outlet)
  let ownsOutlet = config.outlet === undefined
  let target = config.target
  let placement = config.placement ?? "top"
  let offset = config.offset ?? 8
  let showDelayMs = config.showDelayMs ?? 120
  let hideDelayMs = config.hideDelayMs ?? 80
  let hoverable = config.hoverable ?? false
  let disabled = config.disabled ?? false
  let clampToViewport = config.clampToViewport ?? true
  let triggers = normalizeTooltipTriggers(config.trigger)
  let onOpen = config.onOpen
  let onClose = config.onClose
  let opened = false
  let describedTarget: HTMLElement | undefined
  let previousDescribedBy: string | null = null
  let openTimer: ReturnType<typeof setTimeout> | undefined
  let closeTimer: ReturnType<typeof setTimeout> | undefined
  let removeTargetListeners: (() => void)[] = []
  let removePositionListeners: (() => void)[] = []

  const tooltip = createElement(doc, "div", "ce-html-tooltip")
  tooltip.id = config.id ?? `ce-html-tooltip-${++tooltipIdCounter}`
  tooltip.hidden = true
  tooltip.setAttribute("role", "tooltip")
  tooltip.setAttribute("aria-hidden", "true")

  const title = createElement(doc, "div", "ce-tooltip-title")
  const content = createElement(doc, "div", "ce-tooltip-content")
  append(tooltip, title, content)
  outlet.root.appendChild(tooltip)

  function payload(): HtmlTooltipPayload {
    return { target, tooltip, placement }
  }

  function clearOpenTimer() {
    if (openTimer === undefined) return
    clearTimeout(openTimer)
    openTimer = undefined
  }

  function clearCloseTimer() {
    if (closeTimer === undefined) return
    clearTimeout(closeTimer)
    closeTimer = undefined
  }

  function clearTimers() {
    clearOpenTimer()
    clearCloseTimer()
  }

  function scheduleOpen() {
    if (disabled) return
    clearCloseTimer()
    clearOpenTimer()
    if (showDelayMs > 0) openTimer = setTimeout(openNow, showDelayMs)
    else openNow()
  }

  function scheduleClose() {
    clearOpenTimer()
    clearCloseTimer()
    if (hideDelayMs > 0) closeTimer = setTimeout(closeNow, hideDelayMs)
    else closeNow()
  }

  function openNow() {
    clearTimers()
    if (disabled) return
    if (!tooltip.parentNode) outlet.root.appendChild(tooltip)
    tooltip.hidden = false
    tooltip.setAttribute("aria-hidden", "false")
    addClass(tooltip, "is-open")
    if (hoverable) addClass(tooltip, "is-hoverable")
    else removeClass(tooltip, "is-hoverable")
    applyDescribedBy()
    position()
    bindPositionListeners()
    if (!opened) {
      opened = true
      onOpen?.(payload())
    }
  }

  function closeNow() {
    clearTimers()
    if (!opened && tooltip.hidden) return
    opened = false
    tooltip.hidden = true
    tooltip.setAttribute("aria-hidden", "true")
    removeClass(tooltip, "is-open")
    removePositionListenersNow()
    removeDescribedBy()
    onClose?.(payload())
  }

  function position() {
    positionTooltip(doc, target, tooltip, placement, offset, clampToViewport)
  }

  function bindPositionListeners() {
    if (removePositionListeners.length > 0) return
    const view = doc.defaultView
    if (!view) return
    const handlePosition = () => position()
    view.addEventListener("resize", handlePosition)
    view.addEventListener("scroll", handlePosition, true)
    removePositionListeners = [
      () => view.removeEventListener("resize", handlePosition),
      () => view.removeEventListener("scroll", handlePosition, true)
    ]
  }

  function removePositionListenersNow() {
    for (const remove of removePositionListeners) remove()
    removePositionListeners = []
  }

  function applyDescribedBy() {
    if (!target || describedTarget === target) return
    removeDescribedBy()
    describedTarget = target
    previousDescribedBy = target.getAttribute("aria-describedby")
    const ids = new Set((previousDescribedBy ?? "").split(/\s+/).filter(Boolean))
    ids.add(tooltip.id)
    target.setAttribute("aria-describedby", [...ids].join(" "))
  }

  function removeDescribedBy() {
    if (!describedTarget) return
    if (previousDescribedBy && previousDescribedBy.trim()) describedTarget.setAttribute("aria-describedby", previousDescribedBy)
    else describedTarget.removeAttribute("aria-describedby")
    describedTarget = undefined
    previousDescribedBy = null
  }

  function bindTarget() {
    removeTargetListenersNow()
    if (!target) return
    if (triggers.has("hover")) {
      listen(target, "pointerenter", scheduleOpen, removeTargetListeners)
      listen(target, "pointerleave", scheduleClose, removeTargetListeners)
    }
    if (triggers.has("focus")) {
      listen(target, "focusin", scheduleOpen, removeTargetListeners)
      listen(target, "focusout", scheduleClose, removeTargetListeners)
    }
  }

  function removeTargetListenersNow() {
    for (const remove of removeTargetListeners) remove()
    removeTargetListeners = []
  }

  function applyConfig(next: Partial<HtmlTooltipConfig>) {
    if ("outlet" in next && next.outlet) api.setOutlet(next.outlet)
    if ("target" in next) api.setTarget(next.target)
    if ("id" in next && next.id) {
      const shouldDescribe = opened && describedTarget !== undefined
      removeDescribedBy()
      tooltip.id = next.id
      if (shouldDescribe) applyDescribedBy()
    }
    if ("title" in next) api.setTitle(next.title)
    if ("content" in next) api.setContent(next.content)
    if ("placement" in next) api.setPlacement(next.placement)
    if ("offset" in next) offset = next.offset ?? 8
    if ("showDelayMs" in next) showDelayMs = next.showDelayMs ?? 120
    if ("hideDelayMs" in next) hideDelayMs = next.hideDelayMs ?? 80
    if ("hoverable" in next) hoverable = next.hoverable ?? false
    if ("disabled" in next) api.setDisabled(next.disabled ?? false)
    if ("clampToViewport" in next) clampToViewport = next.clampToViewport ?? true
    if ("trigger" in next) {
      triggers = normalizeTooltipTriggers(next.trigger)
      bindTarget()
    }
    if ("theme" in next) api.setTheme(next.theme)
    if ("onOpen" in next) onOpen = next.onOpen
    if ("onClose" in next) onClose = next.onClose
    if (opened) position()
  }

  tooltip.addEventListener("pointerenter", () => {
    if (hoverable) clearCloseTimer()
  })
  tooltip.addEventListener("pointerleave", () => {
    if (hoverable) scheduleClose()
  })

  const api: HtmlTooltip = {
    root: tooltip,
    outlet,
    elements: {
      tooltip,
      title,
      content
    },
    open(nextConfig) {
      if (nextConfig) applyConfig(nextConfig)
      openNow()
    },
    close() {
      closeNow()
    },
    destroy() {
      closeNow()
      removeTargetListenersNow()
      removePositionListenersNow()
      tooltip.remove()
      if (ownsOutlet && outlet.root.children.length === 0) outlet.destroy()
    },
    setTarget(nextTarget) {
      if (target === nextTarget) return
      removeDescribedBy()
      target = nextTarget
      bindTarget()
      if (opened) {
        applyDescribedBy()
        position()
      }
    },
    setOutlet(nextOutlet) {
      const resolved = resolveTooltipOutlet(doc, nextOutlet)
      ownsOutlet = false
      outlet = resolved
      api.outlet = resolved
      if (!tooltip.parentNode || tooltip.parentNode !== resolved.root) resolved.root.appendChild(tooltip)
      if (opened) position()
    },
    setTitle(nextTitle) {
      title.textContent = nextTitle ?? ""
      title.hidden = !nextTitle
    },
    setContent(nextContent) {
      replace(content, ...contentNodes(doc, nextContent, "ce-tooltip-content-text"))
      content.hidden = nextContent === undefined || (Array.isArray(nextContent) && nextContent.length === 0)
    },
    setPlacement(nextPlacement) {
      placement = nextPlacement ?? "top"
      if (opened) position()
    },
    setDisabled(nextDisabled) {
      disabled = nextDisabled
      if (disabled) closeNow()
    },
    setTheme(nextTheme) {
      const next = { ...defaultHtmlTooltipTheme, ...(nextTheme ?? {}) }
      for (const [key, value] of Object.entries(next)) {
        setStyle(tooltip, `--ce-tooltip-${toKebabCase(key)}`, String(value))
      }
    }
  }

  api.setTitle(config.title)
  api.setContent(config.content)
  api.setTheme(config.theme)
  bindTarget()
  return api
}

export function createMmoUiShell(config: MmoUiShellConfig = {}): MmoUiShell {
  const doc = config.document ?? config.root?.ownerDocument ?? globalThis.document
  if (!doc) throw new Error("createMmoUiShell requires a DOM document or root element")
  const controller = config.controller
  const initialState = controller?.getSnapshot()
  let controllerState = initialState

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

  let toolbarActions = [...(initialState?.toolbar ?? config.toolbar ?? [])]
  let panelConfigs = [...(initialState?.panels ?? config.panels ?? [])]
  let inventoryItems = [...(initialState?.inventory ?? config.inventory?.items ?? [])]
  let equipmentSlots = [...(initialState?.equipment ?? config.equipment?.slots ?? [])]
  let hotbarSlots = [...(initialState?.hotbar ?? config.hotbar?.slots ?? [])]
  let statEntries = [...(initialState?.stats ?? config.stats?.entries ?? [])]
  let debugEntries = [...(initialState?.debug ?? config.debug?.entries ?? [])]
  let openPanels = new Set(initialState?.openPanelIds ?? panelConfigs.filter((panel) => panel.open ?? true).map((panel) => panel.id))

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

  function renderLogin() {
    if (config.login === false) {
      login.hidden = true
      replace(login)
      return
    }

    const loginConfig = config.login ?? {}
    login.hidden = controller ? !controller.getSnapshot().loginVisible : loginConfig.hidden ?? false
    const form = createElement(doc, "form", "ce-mmo-login-form")
    const title = createElement(doc, "div", "ce-mmo-login-title", loginConfig.title ?? "Enter realm")
    const label = createElement(doc, "label", "ce-mmo-field")
    const labelText = createElement(doc, "span", "ce-mmo-field-label", loginConfig.nameLabel ?? "Name")
    const input = doc.createElement("input")
    input.className = "ce-mmo-input"
    input.name = "playerName"
    input.type = "text"
    input.autocomplete = "name"
    input.placeholder = loginConfig.namePlaceholder ?? "Adventurer"
    input.value = loginConfig.defaultName ?? ""

    const submit = doc.createElement("button")
    submit.className = "ce-mmo-button ce-mmo-primary"
    submit.type = "submit"
    submit.textContent = loginConfig.submitLabel ?? "Join"

    const message = createElement(doc, "div", "ce-mmo-login-message", loginConfig.message ?? "")
    form.addEventListener("submit", (event) => {
      event.preventDefault()
      const playerName = input.value.trim()
      if (!playerName) {
        message.textContent = "Name required"
        return
      }
      message.textContent = ""
      emitLogin({ playerName })
    })

    append(label, labelText, input)
    append(form, title, label, submit, message)
    replace(login, form)
  }

  function renderToolbar() {
    const actions = toolbarActions.map((action) => {
      const button = doc.createElement("button")
      button.className = `ce-mmo-tool${action.active ? " is-active" : ""}`
      button.type = "button"
      button.disabled = action.disabled ?? false
      button.title = action.title ?? action.label
      button.setAttribute("aria-label", action.title ?? action.label)
      button.textContent = action.label
      if (action.icon) {
        const icon = createElement(doc, "span", "ce-mmo-tool-icon")
        icon.setAttribute("aria-hidden", "true")
        // Icons are untrusted UI data. Treat strings as text instead of parsing markup.
        icon.textContent = action.icon
        const label = createElement(doc, "span", "ce-mmo-tool-label", action.label)
        replace(button, icon, label)
      }
      button.addEventListener("click", () => {
        if (!action.disabled) emitToolbar({ id: action.id, action })
      })
      return button
    })
    replace(toolbar, ...actions)
  }

  function renderPanels() {
    const panelNodes = panelConfigs.map((panel) => {
      const article = createElement(doc, "article", "ce-mmo-panel")
      const header = createElement(doc, "button", "ce-mmo-panel-header")
      const open = openPanels.has(panel.id)
      header.type = "button"
      header.setAttribute("aria-expanded", String(open))
      const title = createElement(doc, "span", "ce-mmo-panel-title", panel.title)
      const toggle = createElement(doc, "span", "ce-mmo-panel-toggle", open ? "x" : "+")
      header.title = open ? `Close ${panel.title}` : `Open ${panel.title}`
      append(header, title, toggle)
      header.addEventListener("click", () => togglePanel(panel.id))
      article.appendChild(header)

      if (open) {
        const bodyNode = createElement(doc, "div", "ce-mmo-panel-body")
        if (typeof panel.content === "string" || panel.content === undefined) {
          bodyNode.textContent = panel.content ?? ""
        } else {
          bodyNode.appendChild(panel.content)
        }
        article.appendChild(bodyNode)
      }

      return article
    })
    replace(panels, ...panelNodes)
  }

  function renderInventory() {
    const title = widgetTitle(doc, config.inventory?.title ?? "Inventory")
    const grid = createElement(doc, "div", "ce-mmo-slot-grid")
    const nodes = inventoryItems.map((item) => {
      const button = doc.createElement("button")
      button.className = `ce-mmo-item ce-rarity-${item.rarity ?? "common"}`
      button.type = "button"
      button.disabled = item.disabled ?? false
      button.title = item.description ?? item.name
      button.textContent = `${item.icon ? `${item.icon} ` : ""}${item.name}${item.quantity ? ` x${item.quantity}` : ""}`
      button.addEventListener("click", () => {
        if (!item.disabled) emitInventory({ id: item.id, item })
      })
      return button
    })
    replace(grid, ...(nodes.length ? nodes : [emptyState(doc, config.inventory?.emptyText ?? "No items")]))
    replace(inventory, title, grid)
  }

  function renderEquipment() {
    const title = widgetTitle(doc, config.equipment?.title ?? "Equipment")
    const grid = createElement(doc, "div", "ce-mmo-slot-grid")
    const nodes = equipmentSlots.map((slot) => {
      const button = doc.createElement("button")
      button.className = "ce-mmo-slot"
      button.type = "button"
      button.disabled = slot.locked ?? false
      button.textContent = `${slot.label}: ${slot.item?.name ?? "Empty"}`
      button.addEventListener("click", () => {
        if (!slot.locked) emitEquipment({ id: slot.id, slot })
      })
      return button
    })
    replace(grid, ...(nodes.length ? nodes : [emptyState(doc, "No slots")]))
    replace(equipment, title, grid)
  }

  function renderHotbar() {
    const nodes = hotbarSlots.map((slot) => {
      const button = doc.createElement("button")
      button.className = "ce-mmo-hotbar-slot"
      button.type = "button"
      button.disabled = slot.disabled ?? false
      const label = slot.item?.name ?? slot.label ?? "Empty"
      const binding = slot.binding ? `[${slot.binding}] ` : ""
      const cooldown = slot.cooldown && slot.cooldown > 0 ? ` (${Math.ceil(slot.cooldown)}s)` : ""
      button.textContent = `${binding}${label}${cooldown}`
      button.addEventListener("click", () => {
        if (!slot.disabled) emitHotbar({ id: slot.id, slot })
      })
      return button
    })
    replace(hotbar, ...nodes)
  }

  function renderStats() {
    const title = widgetTitle(doc, config.stats?.title ?? "Stats")
    const rows = statEntries.map((entry) => {
      const row = createElement(doc, "div", `ce-mmo-stat ce-tone-${entry.tone ?? "normal"}`)
      const label = createElement(doc, "span", "ce-mmo-stat-label", entry.label)
      const value = createElement(doc, "span", "ce-mmo-stat-value", String(entry.value))
      append(row, label, value)
      if (typeof entry.value === "number" && typeof entry.max === "number" && entry.max > 0) {
        const bar = createElement(doc, "span", "ce-mmo-meter")
        const fill = createElement(doc, "span", "ce-mmo-meter-fill")
        setStyle(fill, "width", `${Math.max(0, Math.min(1, entry.value / entry.max)) * 100}%`)
        bar.appendChild(fill)
        row.appendChild(bar)
      }
      return row
    })
    replace(stats, title, ...(rows.length ? rows : [emptyState(doc, "No stats")]))
  }

  function renderDebug() {
    const title = widgetTitle(doc, config.debug?.title ?? "Debug")
    const rows = debugEntries.map((entry) => {
      const row = createElement(doc, "div", "ce-mmo-debug-row")
      const label = createElement(doc, "span", "ce-mmo-debug-label", entry.label)
      const value = createElement(doc, "span", "ce-mmo-debug-value", String(entry.value ?? ""))
      append(row, label, value)
      return row
    })
    replace(debug, title, ...(rows.length ? rows : [emptyState(doc, "No debug data")]))
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

  function syncFromController() {
    if (!controller) return
    const next = controller.getSnapshot()
    const previous = controllerState
    controllerState = next
    if (next.title !== previous?.title) heading.textContent = next.title
    if (next.status !== previous?.status) status.textContent = next.status
    if (next.loginVisible !== previous?.loginVisible) renderLogin()
    if (next.toolbar !== previous?.toolbar) {
      toolbarActions = [...next.toolbar]
      renderToolbar()
    }
    if (next.panels !== previous?.panels || next.openPanelIds !== previous?.openPanelIds) {
      panelConfigs = [...next.panels]
      openPanels = new Set(next.openPanelIds)
      renderPanels()
    }
    if (next.inventory !== previous?.inventory) {
      inventoryItems = [...next.inventory]
      renderInventory()
    }
    if (next.equipment !== previous?.equipment) {
      equipmentSlots = [...next.equipment]
      renderEquipment()
    }
    if (next.hotbar !== previous?.hotbar) {
      hotbarSlots = [...next.hotbar]
      renderHotbar()
    }
    if (next.stats !== previous?.stats) {
      statEntries = [...next.stats]
      renderStats()
    }
    if (next.debug !== previous?.debug) {
      debugEntries = [...next.debug]
      renderDebug()
    }
  }

  function setPanelOpen(id: string, open: boolean) {
    const panel = panelConfigs.find((candidate) => candidate.id === id)
    if (!panel) return
    if (controller) {
      if (controller.actions.setPanelOpen(id, open)) emitPanel({ id, panel, open })
      return
    }
    if (open) openPanels.add(id)
    else openPanels.delete(id)
    renderPanels()
    emitPanel({ id, panel, open })
  }

  function togglePanel(id: string) {
    setPanelOpen(id, !openPanels.has(id))
  }

  function setTheme(theme?: Partial<MmoUiTheme>) {
    const next = { ...darkFantasyMmoUiTheme, ...(theme ?? {}) }
    for (const [key, value] of Object.entries(next)) {
      setStyle(shell, `--ce-mmo-${toKebabCase(key)}`, String(value))
    }
  }

  const api: MmoUiShell = {
    root: shell,
    elements: {
      host,
      shell,
      login,
      toolbar,
      panels,
      inventory,
      equipment,
      hotbar,
      stats,
      debug,
      status
    },
    mount(target) {
      target.appendChild(shell)
      return shell
    },
    destroy() {
      unsubscribeController()
      shell.remove()
    },
    setTheme,
    setStatus(nextStatus) {
      if (controller) {
        controller.actions.setStatus(nextStatus)
        return
      }
      status.textContent = nextStatus
    },
    setLoginVisible(visible) {
      if (controller) {
        controller.actions.setLoginVisible(visible)
        return
      }
      login.hidden = !visible
    },
    setToolbarActions(actions) {
      if (controller) {
        controller.actions.setToolbarActions(actions)
        return
      }
      toolbarActions = [...actions]
      renderToolbar()
    },
    setPanels(nextPanels) {
      if (controller) {
        controller.actions.setPanels(nextPanels)
        return
      }
      panelConfigs = [...nextPanels]
      openPanels = new Set(panelConfigs.filter((panel) => panel.open ?? true).map((panel) => panel.id))
      renderPanels()
    },
    setPanelOpen,
    togglePanel,
    setInventoryItems(items) {
      if (controller) {
        controller.actions.setInventoryItems(items)
        return
      }
      inventoryItems = [...items]
      renderInventory()
    },
    setEquipmentSlots(slots) {
      if (controller) {
        controller.actions.setEquipmentSlots(slots)
        return
      }
      equipmentSlots = [...slots]
      renderEquipment()
    },
    setHotbarSlots(slots) {
      if (controller) {
        controller.actions.setHotbarSlots(slots)
        return
      }
      hotbarSlots = [...slots]
      renderHotbar()
    },
    setStats(entries) {
      if (controller) {
        controller.actions.setStats(entries)
        return
      }
      statEntries = [...entries]
      renderStats()
    },
    setDebugEntries(entries) {
      if (controller) {
        controller.actions.setDebugEntries(entries)
        return
      }
      debugEntries = [...entries]
      renderDebug()
    }
  }

  setTheme(config.theme)
  renderAll()
  const unsubscribeController = controller?.subscribe(syncFromController) ?? (() => {})
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

function contentNodes(doc: Document, content?: HtmlDialogContent | HtmlTooltipContent, textClass = "ce-dialog-content-text"): Node[] {
  if (content === undefined) return []
  if (typeof content === "string") return [createElement(doc, "div", textClass, content)]
  if (isDialogContentArray(content)) {
    return content.map((entry) => typeof entry === "string" ? createElement(doc, "div", textClass, entry) : entry)
  }
  return [content]
}

function isDialogContentArray(content: HtmlDialogContent | HtmlTooltipContent): content is readonly (string | Node)[] {
  return Array.isArray(content)
}

function tooltipOutletRoot(outlet?: HTMLElement | HtmlTooltipOutlet): HTMLElement | undefined {
  if (isHtmlTooltipOutlet(outlet)) return outlet.root
  return outlet
}

function resolveTooltipOutlet(doc: Document, outlet?: HTMLElement | HtmlTooltipOutlet): HtmlTooltipOutlet {
  if (isHtmlTooltipOutlet(outlet)) return outlet
  return createHtmlTooltipOutlet({ document: doc, root: outlet })
}

function isHtmlTooltipOutlet(outlet?: HTMLElement | HtmlTooltipOutlet): outlet is HtmlTooltipOutlet {
  return Boolean(outlet && typeof outlet === "object" && "root" in outlet && "mount" in outlet && "setTheme" in outlet)
}

function normalizeTooltipTriggers(trigger?: HtmlTooltipTriggerInput): Set<HtmlTooltipTrigger> {
  const values = trigger === undefined ? ["hover", "focus"] : Array.isArray(trigger) ? trigger : [trigger]
  return new Set(values)
}

function listen(element: HTMLElement, type: string, handler: () => void, removers: (() => void)[]) {
  const listener = () => handler()
  element.addEventListener(type, listener)
  removers.push(() => element.removeEventListener(type, listener))
}

interface ElementRect {
  left: number
  top: number
  width: number
  height: number
}

function positionTooltip(
  doc: Document,
  target: HTMLElement | undefined,
  tooltip: HTMLElement,
  placement: HtmlTooltipPlacement,
  offset: number,
  clampToViewport: boolean
) {
  const targetRect = target ? elementRect(target) : { left: 0, top: 0, width: 0, height: 0 }
  const tooltipRect = elementRect(tooltip)
  let left = targetRect.left
  let top = targetRect.top

  if (placement === "top") {
    left = targetRect.left + (targetRect.width - tooltipRect.width) / 2
    top = targetRect.top - tooltipRect.height - offset
  } else if (placement === "bottom") {
    left = targetRect.left + (targetRect.width - tooltipRect.width) / 2
    top = targetRect.top + targetRect.height + offset
  } else if (placement === "left") {
    left = targetRect.left - tooltipRect.width - offset
    top = targetRect.top + (targetRect.height - tooltipRect.height) / 2
  } else {
    left = targetRect.left + targetRect.width + offset
    top = targetRect.top + (targetRect.height - tooltipRect.height) / 2
  }

  if (clampToViewport) {
    const viewportWidth = doc.defaultView?.innerWidth ?? doc.documentElement?.clientWidth ?? 0
    const viewportHeight = doc.defaultView?.innerHeight ?? doc.documentElement?.clientHeight ?? 0
    if (viewportWidth > 0) left = clampNumber(left, 8, viewportWidth - tooltipRect.width - 8)
    if (viewportHeight > 0) top = clampNumber(top, 8, viewportHeight - tooltipRect.height - 8)
  }

  tooltip.setAttribute("data-placement", placement)
  setStyle(tooltip, "left", `${Math.round(left)}px`)
  setStyle(tooltip, "top", `${Math.round(top)}px`)
}

function elementRect(element: HTMLElement): ElementRect {
  const rect = typeof element.getBoundingClientRect === "function" ? element.getBoundingClientRect() : undefined
  const width = rect && rect.width > 0 ? rect.width : element.offsetWidth ?? 0
  const height = rect && rect.height > 0 ? rect.height : element.offsetHeight ?? 0
  return {
    left: rect?.left ?? 0,
    top: rect?.top ?? 0,
    width,
    height
  }
}

function clampNumber(value: number, min: number, max: number) {
  if (max < min) return min
  return Math.max(min, Math.min(max, value))
}

function normalizeDialogButtons<TValue extends string>(buttons?: readonly HtmlDialogButton<TValue>[]): HtmlDialogButton<TValue>[] {
  if (buttons !== undefined) return [...buttons]
  return [{ value: "ok" as TValue, label: "OK" }]
}

function activeDialogButtonIndex<TValue extends string>(buttons: readonly HtmlDialogButton<TValue>[]) {
  const explicit = buttons.findIndex((button) => button.active)
  return explicit >= 0 ? explicit : buttons.length - 1
}

function addClass(element: HTMLElement, className: string) {
  if (element.classList) {
    element.classList.add(className)
    return
  }
  const names = String(element.className).split(/\s+/).filter(Boolean)
  if (!names.includes(className)) element.className = [...names, className].join(" ")
}

function removeClass(element: HTMLElement, className: string) {
  if (element.classList) {
    element.classList.remove(className)
    return
  }
  element.className = String(element.className).split(/\s+/).filter((name) => name && name !== className).join(" ")
}

function findActiveButton(actions: HTMLElement): HTMLButtonElement | undefined {
  for (const child of Array.from(actions.children)) {
    if ((child as HTMLElement).getAttribute?.("data-active") === "true") return child as HTMLButtonElement
  }
  return undefined
}

function setStyle(element: HTMLElement, property: string, value: string) {
  element.style.setProperty(property, value)
}

function toKebabCase(value: string) {
  return value.replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`)
}

function ensureBaseStyle(doc: Document) {
  if (doc.getElementById?.(styleId)) return

  const style = doc.createElement("style")
  style.id = styleId
  style.textContent = `
.ce-html-dialog {
  background: var(--ce-dialog-surface);
  border: 1px solid var(--ce-dialog-border);
  border-radius: var(--ce-dialog-radius);
  box-shadow: var(--ce-dialog-shadow);
  color: var(--ce-dialog-text);
  font-family: var(--ce-dialog-font-family);
  margin: auto;
  max-height: min(90vh, 720px);
  padding: 0;
  width: min(420px, calc(100vw - 28px));
  z-index: var(--ce-dialog-z-index);
}
.ce-html-dialog::backdrop { background: var(--ce-dialog-backdrop); }
.ce-html-dialog:not([open]):not(.is-open) { display: none; }
.ce-html-dialog.is-open:not([open]) {
  display: block;
  inset: 0;
  position: fixed;
}
.ce-html-dialog *, .ce-html-dialog *::before, .ce-html-dialog *::after { box-sizing: border-box; }
.ce-dialog-card { display: grid; gap: 14px; padding: 18px; }
.ce-dialog-header {
  align-items: start;
  display: grid;
  gap: 12px;
  grid-template-columns: minmax(0, 1fr) auto;
}
.ce-dialog-title {
  color: var(--ce-dialog-text);
  font-size: 18px;
  letter-spacing: 0;
  line-height: 1.2;
  margin: 0;
}
.ce-dialog-description {
  color: var(--ce-dialog-muted);
  font-size: 12px;
  line-height: 1.35;
  margin: -10px 0 4px;
}
.ce-dialog-content {
  color: var(--ce-dialog-text);
  display: grid;
  font-size: 13px;
  gap: 8px;
  line-height: 1.35;
}
.ce-dialog-close {
  align-items: center;
  background: transparent;
  border: 0;
  border-radius: 6px;
  color: var(--ce-dialog-text);
  cursor: pointer;
  display: inline-grid;
  font: 18px/1 var(--ce-dialog-font-family);
  height: 28px;
  justify-items: center;
  padding: 0;
  width: 28px;
}
.ce-dialog-close:hover { background: var(--ce-dialog-surface-alt); }
.ce-dialog-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  justify-content: flex-end;
  margin-top: 4px;
}
.ce-dialog-button {
  background: var(--ce-dialog-surface);
  border: 1px solid var(--ce-dialog-accent);
  border-radius: 6px;
  color: var(--ce-dialog-accent);
  cursor: pointer;
  font: 700 12px/1 var(--ce-dialog-font-family);
  letter-spacing: 0;
  min-height: 34px;
  min-width: 72px;
  padding: 9px 13px;
}
.ce-dialog-button.is-active {
  background: var(--ce-dialog-accent);
  color: var(--ce-dialog-accent-text);
}
.ce-dialog-button.is-danger { border-color: var(--ce-dialog-danger); color: var(--ce-dialog-danger); }
.ce-dialog-button.is-danger.is-active { background: var(--ce-dialog-danger); color: var(--ce-dialog-accent-text); }
.ce-dialog-button:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}
.ce-html-tooltip-outlet {
  inset: 0;
  pointer-events: none;
  position: fixed;
  z-index: var(--ce-tooltip-z-index);
}
.ce-html-tooltip {
  background: var(--ce-tooltip-surface);
  border: 1px solid var(--ce-tooltip-border);
  border-radius: var(--ce-tooltip-radius);
  box-shadow: var(--ce-tooltip-shadow);
  box-sizing: border-box;
  color: var(--ce-tooltip-text);
  display: grid;
  font-family: var(--ce-tooltip-font-family);
  gap: 4px;
  line-height: 1.25;
  max-width: var(--ce-tooltip-max-width);
  padding: 8px 10px;
  pointer-events: none;
  position: fixed;
  width: max-content;
  z-index: var(--ce-tooltip-z-index);
}
.ce-html-tooltip[hidden] { display: none; }
.ce-html-tooltip.is-hoverable { pointer-events: auto; }
.ce-tooltip-title {
  color: var(--ce-tooltip-text);
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0;
}
.ce-tooltip-content {
  color: var(--ce-tooltip-muted);
  display: grid;
  font-size: 11px;
  gap: 4px;
}
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

  const parent = doc.head ?? doc.documentElement
  parent?.appendChild(style)
}

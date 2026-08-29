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
  for (const [key, value] of Object.entries(resolved)) variables[`--${prefix}-${toKebabCase(key)}`] = String(value)
  return variables
}

export function applyEngineUiTheme(
  target: Pick<HTMLElement, "style">,
  theme: Partial<EngineUiTheme> = {},
  options: EngineUiThemeVariableOptions = {}
): EngineUiTheme {
  const resolved = resolveEngineUiTheme(theme)
  const prefix = options.prefix ?? "ce-ui"
  for (const [key, value] of Object.entries(resolved)) setStyle(target, `--${prefix}-${toKebabCase(key)}`, String(value))
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
  const existing = doc.getElementById(styleId)
  if (existing) {
    if (!isHtmlStyleElement(existing)) throw new Error(`Element #${styleId} must be a style element`)
    return existing
  }
  const style = doc.createElement("style")
  style.id = styleId
  style.textContent = createEngineUiControlStyles(options)
  const parent = doc.head ?? doc.documentElement
  parent?.appendChild(style)
  return style
}

export function createSingleOpenPanelState<TPanel extends string = string>(
  config: SingleOpenPanelStateConfig<TPanel>
): SingleOpenPanelState<TPanel> {
  const panels = new Set<string>(config.panels)
  function isPanel(value: string): value is TPanel {
    return panels.has(value)
  }

  const initialPanel = config.initialPanel ?? ""
  let activePanel: TPanel | "" = isPanel(initialPanel) ? initialPanel : ""
  return {
    get activePanel() {
      return activePanel
    },
    isPanel,
    open(name) {
      activePanel = isPanel(name) ? name : ""
      return activePanel
    },
    toggle(name) {
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
    return Reflect.get(target, "disabled") !== true && !target.hidden
  }

  function targets() {
    return config.getTargets().filter((target): target is TElement => target !== null && target !== undefined && isAvailable(target))
  }

  function clear() {
    const selector = `.${focusClass}`
    if (config.root) {
      for (const element of config.root.querySelectorAll(selector)) element.classList.remove(focusClass)
      return
    }
    for (const target of targets()) target.classList.remove(focusClass)
    lastTarget?.classList.remove(focusClass)
  }

  function wrappedIndex(index: number, count: number) {
    return ((index % count) + count) % count
  }

  function activeTargetIndex(available: readonly TElement[]) {
    const active = config.document?.activeElement
    return active ? available.findIndex((target) => target === active) : -1
  }

  function focus(index: number) {
    const available = targets()
    clear()
    if (!available.length) return undefined
    currentIndex = wrappedIndex(index, available.length)
    const target = available[currentIndex]
    lastTarget = target
    target.classList.add(focusClass)
    config.onFocus?.(target, currentIndex, available)
    if (config.shouldFocus?.() ?? true) target.focus({ preventScroll })
    return target
  }

  return {
    get index() {
      return currentIndex
    },
    targets,
    focus,
    move(delta) {
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
      target.click()
      return target
    },
    clear
  }
}

function isHtmlStyleElement(element: Element): element is HTMLStyleElement {
  return element.tagName.toLowerCase() === "style"
}

function setStyle(element: Pick<HTMLElement, "style">, property: string, value: string) {
  element.style.setProperty(property, value)
}

function toKebabCase(value: string) {
  return value.replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`)
}

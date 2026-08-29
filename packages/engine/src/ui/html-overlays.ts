import {
  bindTooltipTarget,
  createTooltipDescriptionController,
  createTooltipPositionController,
  createTooltipTimerController,
} from "./tooltip-lifecycle.ts"

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
  value?: TValue
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

let tooltipIdCounter = 0

export function createHtmlDialog<TValue extends string = string>(config: HtmlDialogConfig<TValue> = {}): HtmlDialog<TValue> {
  const doc = config.document ?? config.root?.ownerDocument ?? globalThis.document
  if (!doc) throw new Error("createHtmlDialog requires a DOM document or root element")

  ensureOverlayStyle(doc)

  const host = config.root ?? doc.body ?? doc.documentElement
  if (!host) throw new Error("createHtmlDialog requires a root element or document body")

  const dialog = doc.createElement("dialog")
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

  ensureOverlayStyle(doc)

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

  ensureOverlayStyle(doc)

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
  let removeTargetListeners = () => {}

  const tooltip = createElement(doc, "div", "ce-html-tooltip")
  tooltip.id = config.id ?? `ce-html-tooltip-${++tooltipIdCounter}`
  tooltip.hidden = true
  tooltip.setAttribute("role", "tooltip")
  tooltip.setAttribute("aria-hidden", "true")

  const title = createElement(doc, "div", "ce-tooltip-title")
  const content = createElement(doc, "div", "ce-tooltip-content")
  append(tooltip, title, content)
  outlet.root.appendChild(tooltip)
  const timers = createTooltipTimerController({
    getHideDelayMs: () => hideDelayMs,
    getShowDelayMs: () => showDelayMs,
    isDisabled: () => disabled,
    onClose: () => closeNow(),
    onOpen: () => openNow()
  })
  const description = createTooltipDescriptionController(tooltip)
  const positionController = createTooltipPositionController(doc, () => position())

  function payload(): HtmlTooltipPayload {
    return { target, tooltip, placement }
  }

  function openNow() {
    timers.clear()
    if (disabled) return
    if (!tooltip.parentNode) outlet.root.appendChild(tooltip)
    tooltip.hidden = false
    tooltip.setAttribute("aria-hidden", "false")
    addClass(tooltip, "is-open")
    if (hoverable) addClass(tooltip, "is-hoverable")
    else removeClass(tooltip, "is-hoverable")
    description.apply(target)
    position()
    positionController.bind()
    if (!opened) {
      opened = true
      onOpen?.(payload())
    }
  }

  function closeNow() {
    timers.clear()
    if (!opened && tooltip.hidden) return
    opened = false
    tooltip.hidden = true
    tooltip.setAttribute("aria-hidden", "true")
    removeClass(tooltip, "is-open")
    positionController.remove()
    description.remove()
    onClose?.(payload())
  }

  function position() {
    positionTooltip(doc, target, tooltip, placement, offset, clampToViewport)
  }

  function bindTarget() {
    removeTargetListeners()
    removeTargetListeners = bindTooltipTarget(target, triggers, timers.scheduleOpen, timers.scheduleClose)
  }

  function applyConfig(next: Partial<HtmlTooltipConfig>) {
    if ("outlet" in next && next.outlet) api.setOutlet(next.outlet)
    if ("target" in next) api.setTarget(next.target)
    if ("id" in next && next.id) {
      const shouldDescribe = opened && description.isApplied()
      description.remove()
      tooltip.id = next.id
      if (shouldDescribe) description.apply(target)
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
    if (hoverable) timers.clearClose()
  })
  tooltip.addEventListener("pointerleave", () => {
    if (hoverable) timers.scheduleClose()
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
      removeTargetListeners()
      positionController.remove()
      tooltip.remove()
      if (ownsOutlet && outlet.root.children.length === 0) outlet.destroy()
    },
    setTarget(nextTarget) {
      if (target === nextTarget) return
      description.remove()
      target = nextTarget
      bindTarget()
      if (opened) {
        description.apply(target)
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


function createElement<K extends keyof HTMLElementTagNameMap>(
  doc: Document,
  tagName: K,
  className: string,
  textContent?: string,
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
  return [{ label: "OK" }]
}

function activeDialogButtonIndex<TValue extends string>(buttons: readonly HtmlDialogButton<TValue>[]) {
  const explicit = buttons.findIndex((button) => button.active)
  return explicit >= 0 ? explicit : buttons.length - 1
}

function addClass(element: Element, className: string) {
  if (element.classList) {
    element.classList.add(className)
    return
  }
  const names = element.getAttribute("class")?.split(/\s+/).filter(Boolean) ?? []
  if (!names.includes(className)) element.setAttribute("class", [...names, className].join(" "))
}

function removeClass(element: Element, className: string) {
  if (element.classList) {
    element.classList.remove(className)
    return
  }
  const names = element.getAttribute("class")?.split(/\s+/).filter((name) => name && name !== className) ?? []
  element.setAttribute("class", names.join(" "))
}

function findActiveButton(actions: HTMLElement): HTMLButtonElement | undefined {
  for (const child of Array.from(actions.children)) {
    if (isHtmlButtonElement(child) && child.getAttribute("data-active") === "true") return child
  }
  return undefined
}

function isHtmlButtonElement(element: Element): element is HTMLButtonElement {
  return element.tagName.toLowerCase() === "button"
}

function isHtmlStyleElement(element: Element): element is HTMLStyleElement {
  return element.tagName.toLowerCase() === "style"
}

function setStyle(element: Pick<HTMLElement, "style">, property: string, value: string) {
  element.style.setProperty(property, value)
}

function toKebabCase(value: string) {
  return value.replace(/[A-Z]/g, (character) => "-" + character.toLowerCase())
}

const dialogAndTooltipBaseStyle = `
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
`
const overlayStyleId = "catalog-engine-html-overlays"

function ensureOverlayStyle(doc: Document) {
  const existing = doc.getElementById?.(overlayStyleId)
  if (existing && isHtmlStyleElement(existing)) return
  const style = doc.createElement("style")
  style.id = overlayStyleId
  style.textContent = dialogAndTooltipBaseStyle
  const parent = doc.head ?? doc.documentElement
  parent?.appendChild(style)
}

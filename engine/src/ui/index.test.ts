import { expect, test } from "bun:test"
import {
  applyEngineUiTheme,
  createEngineUiControlStyles,
  createEngineUiThemeVariables,
  createHtmlDialog,
  createHtmlTooltip,
  createHtmlTooltipOutlet,
  createMmoUiController,
  createMmoUiShell,
  createRovingFocusController,
  createSingleOpenPanelState,
  ensureEngineUiControlStyles,
  showHtmlDialog
} from "./index.ts"

class FakeStyle {
  values = new Map<string, string>()

  setProperty(property: string, value: string) {
    this.values.set(property, value)
  }
}

class FakeElement {
  ownerDocument: FakeDocument
  tagName: string
  parentNode: FakeElement | null = null
  children: FakeElement[] = []
  className = ""
  textContent = ""
  id = ""
  hidden = false
  name = ""
  type = ""
  autocomplete = ""
  placeholder = ""
  value = ""
  title = ""
  disabled = false
  open = false
  offsetWidth = 0
  offsetHeight = 0
  style = new FakeStyle()
  attributes = new Map<string, string>()
  rect: { left: number; top: number; width: number; height: number } | undefined
  private listeners = new Map<string, Set<(event: any) => void>>()

  constructor(tagName: string, ownerDocument: FakeDocument) {
    this.tagName = tagName.toUpperCase()
    this.ownerDocument = ownerDocument
  }

  appendChild(child: FakeElement) {
    child.remove()
    child.parentNode = this
    this.children.push(child)
    return child
  }

  replaceChildren(...children: FakeElement[]) {
    for (const child of this.children) child.parentNode = null
    this.children = []
    for (const child of children) this.appendChild(child)
  }

  addEventListener(type: string, handler: (event: any) => void) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set())
    this.listeners.get(type)?.add(handler)
  }

  removeEventListener(type: string, handler: (event: any) => void) {
    this.listeners.get(type)?.delete(handler)
  }

  remove() {
    if (!this.parentNode) return
    this.parentNode.children = this.parentNode.children.filter((child) => child !== this)
    this.parentNode = null
  }

  setAttribute(name: string, value: string) {
    this.attributes.set(name, value)
    if (name === "open") this.open = true
  }

  getAttribute(name: string) {
    return this.attributes.get(name) ?? null
  }

  removeAttribute(name: string) {
    this.attributes.delete(name)
    if (name === "open") this.open = false
  }

  focus() {}

  setRect(rect: { left: number; top: number; width: number; height: number }) {
    this.rect = rect
  }

  getBoundingClientRect() {
    const rect = this.rect ?? { left: 0, top: 0, width: this.offsetWidth, height: this.offsetHeight }
    return {
      ...rect,
      x: rect.left,
      y: rect.top,
      right: rect.left + rect.width,
      bottom: rect.top + rect.height,
      toJSON() {
        return rect
      }
    }
  }

  close() {
    this.open = false
    this.dispatch("close", { preventDefault() {} })
  }

  cancel() {
    let prevented = false
    this.dispatch("cancel", {
      preventDefault() {
        prevented = true
      }
    })
    if (!prevented) this.close()
  }

  show() {
    this.open = true
  }

  showModal() {
    this.open = true
  }

  click() {
    this.dispatch("click", { target: this, preventDefault() {} })
  }

  pointerenter() {
    this.dispatch("pointerenter", { target: this, preventDefault() {} })
  }

  pointerleave() {
    this.dispatch("pointerleave", { target: this, preventDefault() {} })
  }

  focusin() {
    this.dispatch("focusin", { target: this, preventDefault() {} })
  }

  focusout() {
    this.dispatch("focusout", { target: this, preventDefault() {} })
  }

  submit() {
    this.dispatch("submit", { preventDefault() {} })
  }

  private dispatch(type: string, event: any) {
    for (const handler of this.listeners.get(type) ?? []) handler(event)
  }
}

class FakeDocument {
  documentElement = new FakeElement("html", this)
  head = new FakeElement("head", this)
  body = new FakeElement("body", this)
  private listeners = new Map<string, Set<(event: any) => void>>()

  constructor() {
    this.documentElement.appendChild(this.head)
    this.documentElement.appendChild(this.body)
  }

  createElement(tagName: string) {
    return new FakeElement(tagName, this)
  }

  getElementById(id: string): FakeElement | null {
    return find(this.documentElement, (element) => element.id === id)
  }

  addEventListener(type: string, handler: (event: any) => void) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set())
    this.listeners.get(type)?.add(handler)
  }

  removeEventListener(type: string, handler: (event: any) => void) {
    this.listeners.get(type)?.delete(handler)
  }

  keydown(key: string) {
    for (const handler of this.listeners.get("keydown") ?? []) handler({ key, preventDefault() {} })
  }
}

test("single open panel state keeps one optional panel active", () => {
  const state = createSingleOpenPanelState({
    panels: ["bag", "stats", "map"] as const,
    initialPanel: "stats"
  })

  expect(state.activePanel).toBe("stats")
  expect(state.panelIds()).toEqual(["stats"])
  expect(state.toggle("bag")).toBe("bag")
  expect(state.panelIds()).toEqual(["bag"])
  expect(state.toggle("bag")).toBe("")
  expect(state.open("missing")).toBe("")
  expect(state.open("map")).toBe("map")
  expect(state.close()).toBe("")
  expect(state.isPanel("bag")).toBe(true)
  expect(state.isPanel("missing")).toBe(false)
})

test("roving focus controller wraps enabled targets and activates focused target", () => {
  const doc = new FakeDocument()
  const first = doc.createElement("button")
  const disabled = doc.createElement("button")
  const last = doc.createElement("button")
  const events: string[] = []
  disabled.disabled = true
  first.addEventListener("click", () => events.push("first"))
  last.addEventListener("click", () => events.push("last"))

  const focus = createRovingFocusController({
    getTargets: () => [first, disabled, last] as unknown as HTMLElement[],
    shouldFocus: () => false
  })

  expect(focus.focus(1)).toBe(last as unknown as HTMLElement)
  expect(last.className).toContain("controller-focus")
  expect(focus.move(1)).toBe(first as unknown as HTMLElement)
  expect(first.className).toContain("controller-focus")
  expect(last.className).not.toContain("controller-focus")
  focus.activate()

  expect(events).toEqual(["first"])
})

test("engine ui theme helper returns and applies custom-prefixed variables", () => {
  const doc = new FakeDocument()
  const root = doc.createElement("div")
  const variables = createEngineUiThemeVariables({ accent: "#ffcc66", disabledOpacity: 0.42 }, { prefix: "demo-ui" })

  expect(variables["--demo-ui-accent"]).toBe("#ffcc66")
  expect(variables["--demo-ui-disabled-opacity"]).toBe("0.42")
  expect(doc.head.children).toHaveLength(0)

  const resolved = applyEngineUiTheme(root as unknown as HTMLElement, { controlSurface: "#223322" }, { prefix: "demo-ui" })

  expect(resolved.controlSurface).toBe("#223322")
  expect(root.style.values.get("--demo-ui-control-surface")).toBe("#223322")
  expect(root.style.values.get("--demo-ui-text")).toBe("#f5f7fb")
})

test("engine ui control styles are opt-in and reusable", () => {
  const doc = new FakeDocument()
  const text = createEngineUiControlStyles({ prefix: "demo-ui", classPrefix: "demo", selectorScope: ".shell" })

  expect(text).toContain(".shell .demo-button")
  expect(text).toContain("var(--demo-ui-control-surface)")
  expect(doc.head.children).toHaveLength(0)

  const first = ensureEngineUiControlStyles({ document: doc as unknown as Document, prefix: "demo-ui", classPrefix: "demo", styleId: "demo-style" })
  const second = ensureEngineUiControlStyles({ document: doc as unknown as Document, prefix: "demo-ui", classPrefix: "demo", styleId: "demo-style" })

  expect(first).toBe(second)
  expect(doc.head.children).toHaveLength(1)
  expect((first as unknown as FakeElement).textContent).toContain(".demo-button")
})

test("mmo ui shell wires login toolbar panels inventory equipment and hotbar callbacks", () => {
  const doc = new FakeDocument()
  const host = doc.createElement("div")
  const events: string[] = []

  const shell = createMmoUiShell({
    document: doc as unknown as Document,
    root: host as unknown as HTMLElement,
    login: { defaultName: "Mira" },
    toolbar: [{ id: "map", label: "Map" }],
    panels: [{ id: "quest", title: "Quest", content: "Find the gate" }],
    inventory: { items: [{ id: "ore", name: "Ore", quantity: 2 }] },
    equipment: { slots: [{ id: "weapon", label: "Weapon", item: { id: "sword", name: "Sword" } }] },
    hotbar: { slots: [{ id: "slot-1", binding: "1", item: { id: "potion", name: "Potion" } }] },
    onLogin: ({ playerName }) => events.push(`login:${playerName}`),
    onToolbarAction: ({ id }) => events.push(`toolbar:${id}`),
    onPanelToggle: ({ id, open }) => events.push(`panel:${id}:${open}`),
    onInventoryItem: ({ id }) => events.push(`inventory:${id}`),
    onEquipmentSlot: ({ id }) => events.push(`equipment:${id}`),
    onHotbarActivate: ({ id }) => events.push(`hotbar:${id}`)
  })

  findByTag(shell.elements.login, "FORM").submit()
  findByText(shell.elements.toolbar, "Map").click()
  findByClass(shell.elements.panels, "ce-mmo-panel-header").click()
  findByText(shell.elements.inventory, "Ore x2").click()
  findByText(shell.elements.equipment, "Weapon: Sword").click()
  findByText(shell.elements.hotbar, "[1] Potion").click()

  expect(events).toEqual([
    "login:Mira",
    "toolbar:map",
    "panel:quest:false",
    "inventory:ore",
    "equipment:weapon",
    "hotbar:slot-1"
  ])

  shell.destroy()
  expect(host.children).toHaveLength(0)
})

test("mmo ui shell setters rerender widget state", () => {
  const doc = new FakeDocument()
  const host = doc.createElement("div")
  const events: string[] = []
  const shell = createMmoUiShell({
    document: doc as unknown as Document,
    root: host as unknown as HTMLElement,
    login: false,
    inventory: { items: [], onSelectItem: ({ id }) => events.push(`inventory:${id}`) },
    onHotbarActivate: ({ id }) => events.push(`hotbar:${id}`)
  })

  expect(shell.elements.login.hidden).toBe(true)
  shell.setStatus("In combat")
  shell.setInventoryItems([{ id: "key", name: "Gate Key" }])
  shell.setHotbarSlots([{ id: "slot-2", label: "Blink", binding: "2" }])

  findByText(shell.elements.inventory, "Gate Key").click()
  findByText(shell.elements.hotbar, "[2] Blink").click()

  expect(shell.elements.status.textContent).toBe("In combat")
  expect(events).toEqual(["inventory:key", "hotbar:slot-2"])
})

test("mmo ui shell can render and update a shared headless controller", () => {
  const doc = new FakeDocument()
  const selected: string[] = []
  const controller = createMmoUiController<string | Node>({
    status: "Connecting",
    inventory: [{ id: "key", name: "Gate Key" }],
    onInventoryItem: ({ id }) => selected.push(id)
  })
  const shell = createMmoUiShell({
    document: doc as unknown as Document,
    controller
  })

  expect(shell.elements.status.textContent).toBe("Connecting")
  findByText(shell.elements.inventory, "Gate Key").click()
  controller.actions.setStatus("Online")
  controller.actions.setInventoryItems([{ id: "ore", name: "Ore" }])

  expect(selected).toEqual(["key"])
  expect(shell.elements.status.textContent).toBe("Online")
  expect(findByText(shell.elements.inventory, "Ore").textContent).toBe("Ore")

  shell.destroy()
  controller.actions.setStatus("Detached")
  expect(shell.elements.status.textContent).toBe("Online")
})

test("mmo toolbar treats icon strings as text instead of executable markup", () => {
  const doc = new FakeDocument()
  const markup = '<svg onload="globalThis.compromised=true"></svg>'
  const shell = createMmoUiShell({
    document: doc as unknown as Document,
    toolbar: [{ id: "unsafe", label: "Unsafe", icon: markup }]
  })

  const icon = findByClass(shell.elements.toolbar, "ce-mmo-tool-icon")
  expect(icon.textContent).toBe(markup)
  expect(icon.children).toHaveLength(0)
  shell.destroy()
})

test("html dialog renders any button count and marks the last button active by default", () => {
  const doc = new FakeDocument()
  const host = doc.createElement("div")
  const events: string[] = []
  const dialog = createHtmlDialog({
    document: doc as unknown as Document,
    root: host as unknown as HTMLElement,
    title: "Travel",
    description: "Change rooms",
    content: "Travel to Ironcrag?",
    buttons: [
      { value: "cancel", label: "Cancel" },
      { value: "wait", label: "Wait" },
      { value: "travel", label: "Travel" }
    ],
    onClose: ({ reason, value }) => events.push(`${reason}:${value ?? ""}`)
  })

  dialog.open()

  expect(findByText(dialog.elements.actions, "Cancel").className.includes("is-active")).toBe(false)
  expect(findByText(dialog.elements.actions, "Wait").className.includes("is-active")).toBe(false)
  expect(findByText(dialog.elements.actions, "Travel").className.includes("is-active")).toBe(true)

  findByText(dialog.elements.actions, "Travel").click()

  expect(events).toEqual(["button:travel"])
})

test("show html dialog resolves with clicked button and removes itself", async () => {
  const doc = new FakeDocument()
  const promise = showHtmlDialog({
    document: doc as unknown as Document,
    title: "Confirm",
    content: "Spend gold?",
    buttons: [
      { value: "cancel", label: "Cancel" },
      { value: "spend", label: "Spend" }
    ]
  })

  findByText(doc.body as unknown as HTMLElement, "Spend").click()

  await expect(promise).resolves.toMatchObject({ reason: "button", value: "spend" })
  expect(find(doc.body, (element) => element.tagName === "DIALOG")).toBeNull()
})

test("html dialog closes from outside click and escape cancel", () => {
  const doc = new FakeDocument()
  const events: string[] = []
  const dialog = createHtmlDialog({
    document: doc as unknown as Document,
    title: "Route",
    content: "Ashwood or Void Rift?",
    buttons: [{ value: "cancel", label: "Cancel" }],
    onClose: ({ reason }) => events.push(reason)
  })

  dialog.open()
  dialog.root.click()
  dialog.open()
  doc.keydown("Escape")

  expect(events).toEqual(["close", "cancel"])
})

test("html tooltip renders in configured outlet and positions from target", () => {
  const doc = new FakeDocument()
  const target = doc.createElement("button")
  const outletRoot = doc.createElement("div")
  target.setRect({ left: 100, top: 80, width: 40, height: 20 })

  const tooltip = createHtmlTooltip({
    document: doc as unknown as Document,
    target: target as unknown as HTMLElement,
    outlet: outletRoot as unknown as HTMLElement,
    title: "Inventory",
    content: "Open bag",
    placement: "bottom",
    offset: 12,
    showDelayMs: 0,
    hideDelayMs: 0,
    theme: { maxWidth: "180px" }
  })
  const tooltipRoot = tooltip.root as unknown as FakeElement
  tooltipRoot.offsetWidth = 120
  tooltipRoot.offsetHeight = 38

  target.pointerenter()

  expect(tooltipRoot.hidden).toBe(false)
  expect(outletRoot.children).toContain(tooltip.root as unknown as FakeElement)
  expect(findByText(tooltip.root, "Inventory").hidden).toBe(false)
  expect(findByText(tooltip.root, "Open bag").hidden).toBe(false)
  expect(tooltip.root.getAttribute("data-placement")).toBe("bottom")
  expect(tooltipRoot.style.values.get("left")).toBe("60px")
  expect(tooltipRoot.style.values.get("top")).toBe("112px")
  expect(tooltipRoot.style.values.get("--ce-tooltip-max-width")).toBe("180px")

  target.pointerleave()

  expect(tooltipRoot.hidden).toBe(true)
})

test("html tooltip outlet supports focus aria and retargeting", () => {
  const doc = new FakeDocument()
  const target = doc.createElement("button")
  const secondOutlet = doc.createElement("div")
  target.setAttribute("aria-describedby", "native")

  const firstOutlet = createHtmlTooltipOutlet({ document: doc as unknown as Document })
  const tooltip = createHtmlTooltip({
    document: doc as unknown as Document,
    target: target as unknown as HTMLElement,
    outlet: firstOutlet,
    content: "Focus help",
    trigger: ["focus"],
    showDelayMs: 0,
    hideDelayMs: 0
  })

  target.focusin()

  expect(target.getAttribute("aria-describedby")).toBe(`native ${tooltip.root.id}`)
  tooltip.setOutlet(secondOutlet as unknown as HTMLElement)
  expect(secondOutlet.children).toContain(tooltip.root as unknown as FakeElement)

  target.focusout()

  expect(target.getAttribute("aria-describedby")).toBe("native")
  expect((tooltip.root as unknown as FakeElement).hidden).toBe(true)

  tooltip.setDisabled(true)
  tooltip.open()

  expect((tooltip.root as unknown as FakeElement).hidden).toBe(true)
})

function findByTag(root: HTMLElement, tagName: string) {
  const result = find(root as unknown as FakeElement, (element) => element.tagName === tagName)
  if (!result) throw new Error(`Missing element: ${tagName}`)
  return result
}

function findByText(root: HTMLElement, text: string) {
  const result = find(root as unknown as FakeElement, (element) => element.textContent === text)
  if (!result) throw new Error(`Missing text: ${text}`)
  return result
}

function findByClass(root: HTMLElement, className: string) {
  const result = find(root as unknown as FakeElement, (element) => element.className.split(/\s+/).includes(className))
  if (!result) throw new Error(`Missing class: ${className}`)
  return result
}

function find(root: FakeElement, predicate: (element: FakeElement) => boolean): FakeElement | null {
  if (predicate(root)) return root
  for (const child of root.children) {
    const result = find(child, predicate)
    if (result) return result
  }
  return null
}

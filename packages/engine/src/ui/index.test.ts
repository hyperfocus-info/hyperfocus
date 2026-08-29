import { expect, test } from "bun:test"
import { GlobalRegistrator } from "@happy-dom/global-registrator"
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

if (!GlobalRegistrator.isRegistered) GlobalRegistrator.register()

function createTestDocument(): Document {
  return globalThis.document.implementation.createHTMLDocument("engine-ui-test")
}

function dispatch(target: EventTarget, type: string) {
  target.dispatchEvent(new Event(type, { bubbles: true, cancelable: true }))
}

function dispatchKey(target: EventTarget, key: string) {
  const event = new Event("keydown", { bubbles: true, cancelable: true })
  Object.defineProperty(event, "key", { value: key })
  target.dispatchEvent(event)
}

function setRect(element: HTMLElement, rect: { left: number; top: number; width: number; height: number }) {
  Object.defineProperty(element, "getBoundingClientRect", {
    configurable: true,
    value: () => ({
      ...rect,
      x: rect.left,
      y: rect.top,
      right: rect.left + rect.width,
      bottom: rect.top + rect.height,
      toJSON: () => rect
    })
  })
}

function setOffsetSize(element: HTMLElement, width: number, height: number) {
  Object.defineProperties(element, {
    offsetWidth: { configurable: true, value: width },
    offsetHeight: { configurable: true, value: height }
  })
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
  const doc = createTestDocument()
  const first = doc.createElement("button")
  const disabled = doc.createElement("button")
  const last = doc.createElement("button")
  const events: string[] = []
  disabled.disabled = true
  first.addEventListener("click", () => events.push("first"))
  last.addEventListener("click", () => events.push("last"))

  const focus = createRovingFocusController({
    getTargets: () => [first, disabled, last],
    shouldFocus: () => false
  })

  expect(focus.focus(1)).toBe(last)
  expect(last.className).toContain("controller-focus")
  expect(focus.move(1)).toBe(first)
  expect(first.className).toContain("controller-focus")
  expect(last.className).not.toContain("controller-focus")
  focus.activate()

  expect(events).toEqual(["first"])
})

test("engine ui theme helper returns and applies custom-prefixed variables", () => {
  const doc = createTestDocument()
  const root = doc.createElement("div")
  const variables = createEngineUiThemeVariables({ accent: "#ffcc66", disabledOpacity: 0.42 }, { prefix: "demo-ui" })

  expect(variables["--demo-ui-accent"]).toBe("#ffcc66")
  expect(variables["--demo-ui-disabled-opacity"]).toBe("0.42")
  expect(doc.head.children).toHaveLength(0)

  const resolved = applyEngineUiTheme(root, { controlSurface: "#223322" }, { prefix: "demo-ui" })

  expect(resolved.controlSurface).toBe("#223322")
  expect(root.style.getPropertyValue("--demo-ui-control-surface")).toBe("#223322")
  expect(root.style.getPropertyValue("--demo-ui-text")).toBe("#f5f7fb")
})

test("engine ui control styles are opt-in and reusable", () => {
  const doc = createTestDocument()
  const text = createEngineUiControlStyles({ prefix: "demo-ui", classPrefix: "demo", selectorScope: ".shell" })

  expect(text).toContain(".shell .demo-button")
  expect(text).toContain("var(--demo-ui-control-surface)")
  expect(doc.head.children).toHaveLength(0)

  const first = ensureEngineUiControlStyles({ document: doc, prefix: "demo-ui", classPrefix: "demo", styleId: "demo-style" })
  const second = ensureEngineUiControlStyles({ document: doc, prefix: "demo-ui", classPrefix: "demo", styleId: "demo-style" })

  expect(first).toBe(second)
  expect(doc.head.children).toHaveLength(1)
  expect(first.textContent).toContain(".demo-button")
})

test("mmo ui shell wires login toolbar panels inventory equipment and hotbar callbacks", () => {
  const doc = createTestDocument()
  const host = doc.createElement("div")
  const events: string[] = []

  const shell = createMmoUiShell({
    document: doc,
    root: host,
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

  dispatch(findByTag(shell.elements.login, "FORM"), "submit")
  dispatch(findByText(shell.elements.toolbar, "Map"), "click")
  dispatch(findByClass(shell.elements.panels, "ce-mmo-panel-header"), "click")
  dispatch(findByText(shell.elements.inventory, "Ore x2"), "click")
  dispatch(findByText(shell.elements.equipment, "Weapon: Sword"), "click")
  dispatch(findByText(shell.elements.hotbar, "[1] Potion"), "click")

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
  const doc = createTestDocument()
  const host = doc.createElement("div")
  const events: string[] = []
  const shell = createMmoUiShell({
    document: doc,
    root: host,
    login: false,
    inventory: { items: [], onSelectItem: ({ id }) => events.push(`inventory:${id}`) },
    onHotbarActivate: ({ id }) => events.push(`hotbar:${id}`)
  })

  expect(shell.elements.login.hidden).toBe(true)
  shell.setStatus("In combat")
  shell.setInventoryItems([{ id: "key", name: "Gate Key" }])
  shell.setHotbarSlots([{ id: "slot-2", label: "Blink", binding: "2" }])

  dispatch(findByText(shell.elements.inventory, "Gate Key"), "click")
  dispatch(findByText(shell.elements.hotbar, "[2] Blink"), "click")

  expect(shell.elements.status.textContent).toBe("In combat")
  expect(events).toEqual(["inventory:key", "hotbar:slot-2"])
})

test("mmo ui shell can render and update a shared headless controller", () => {
  const doc = createTestDocument()
  const selected: string[] = []
  const controller = createMmoUiController<string | Node>({
    status: "Connecting",
    inventory: [{ id: "key", name: "Gate Key" }],
    onInventoryItem: ({ id }) => selected.push(id)
  })
  const shell = createMmoUiShell({
    document: doc,
    controller
  })

  expect(shell.elements.status.textContent).toBe("Connecting")
  dispatch(findByText(shell.elements.inventory, "Gate Key"), "click")
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
  const doc = createTestDocument()
  const markup = '<svg onload="globalThis.compromised=true"></svg>'
  const shell = createMmoUiShell({
    document: doc,
    toolbar: [{ id: "unsafe", label: "Unsafe", icon: markup }]
  })

  const icon = findByClass(shell.elements.toolbar, "ce-mmo-tool-icon")
  expect(icon.textContent).toBe(markup)
  expect(icon.children).toHaveLength(0)
  shell.destroy()
})

test("html dialog renders any button count and marks the last button active by default", () => {
  const doc = createTestDocument()
  const host = doc.createElement("div")
  const events: string[] = []
  const dialog = createHtmlDialog({
    document: doc,
    root: host,
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

  dispatch(findByText(dialog.elements.actions, "Travel"), "click")

  expect(events).toEqual(["button:travel"])
})

test("show html dialog resolves with clicked button and removes itself", async () => {
  const doc = createTestDocument()
  const promise = showHtmlDialog({
    document: doc,
    title: "Confirm",
    content: "Spend gold?",
    buttons: [
      { value: "cancel", label: "Cancel" },
      { value: "spend", label: "Spend" }
    ]
  })

  dispatch(findByText(doc.body, "Spend"), "click")

  await expect(promise).resolves.toMatchObject({ reason: "button", value: "spend" })
  expect(find(doc.body, (element) => element.tagName === "DIALOG")).toBeNull()
})

test("html dialog closes from outside click and escape cancel", () => {
  const doc = createTestDocument()
  const events: string[] = []
  const dialog = createHtmlDialog({
    document: doc,
    title: "Route",
    content: "Ashwood or Void Rift?",
    buttons: [{ value: "cancel", label: "Cancel" }],
    onClose: ({ reason }) => events.push(reason)
  })

  dialog.open()
  dispatch(dialog.root, "click")
  dialog.open()
  dispatchKey(doc, "Escape")

  expect(events).toEqual(["close", "cancel"])
})

test("html tooltip renders in configured outlet and positions from target", () => {
  const doc = createTestDocument()
  const target = doc.createElement("button")
  const outletRoot = doc.createElement("div")
  setRect(target, { left: 100, top: 80, width: 40, height: 20 })

  const tooltip = createHtmlTooltip({
    document: doc,
    target,
    outlet: outletRoot,
    title: "Inventory",
    content: "Open bag",
    placement: "bottom",
    offset: 12,
    showDelayMs: 0,
    hideDelayMs: 0,
    theme: { maxWidth: "180px" }
  })
  const tooltipRoot = tooltip.root
  setOffsetSize(tooltipRoot, 120, 38)

  dispatch(target, "pointerenter")

  expect(tooltipRoot.hidden).toBe(false)
  expect(outletRoot.contains(tooltip.root)).toBe(true)
  expect(findByText(tooltip.root, "Inventory").hidden).toBe(false)
  expect(findByText(tooltip.root, "Open bag").hidden).toBe(false)
  expect(tooltip.root.getAttribute("data-placement")).toBe("bottom")
  expect(tooltipRoot.style.getPropertyValue("left")).toBe("60px")
  expect(tooltipRoot.style.getPropertyValue("top")).toBe("112px")
  expect(tooltipRoot.style.getPropertyValue("--ce-tooltip-max-width")).toBe("180px")

  dispatch(target, "pointerleave")

  expect(tooltipRoot.hidden).toBe(true)
})

test("html tooltip outlet supports focus aria and retargeting", () => {
  const doc = createTestDocument()
  const target = doc.createElement("button")
  const secondOutlet = doc.createElement("div")
  target.setAttribute("aria-describedby", "native")

  const firstOutlet = createHtmlTooltipOutlet({ document: doc })
  const tooltip = createHtmlTooltip({
    document: doc,
    target,
    outlet: firstOutlet,
    content: "Focus help",
    trigger: ["focus"],
    showDelayMs: 0,
    hideDelayMs: 0
  })

  dispatch(target, "focusin")

  expect(target.getAttribute("aria-describedby")).toBe(`native ${tooltip.root.id}`)
  tooltip.setOutlet(secondOutlet)
  expect(secondOutlet.contains(tooltip.root)).toBe(true)

  dispatch(target, "focusout")

  expect(target.getAttribute("aria-describedby")).toBe("native")
  expect(tooltip.root.hidden).toBe(true)

  tooltip.setDisabled(true)
  tooltip.open()

  expect(tooltip.root.hidden).toBe(true)
})

function findByTag(root: HTMLElement, tagName: string) {
  const result = find(root, (element) => element.tagName === tagName)
  if (!result) throw new Error(`Missing element: ${tagName}`)
  return result
}

function findByText(root: HTMLElement, text: string) {
  const elements = [root, ...root.querySelectorAll<HTMLElement>("*")]
  const result = elements.reverse().find((element) => element.textContent === text && element.children.length === 0)
  if (!result) throw new Error(`Missing text: ${text}`)
  return result
}

function findByClass(root: HTMLElement, className: string) {
  const result = find(root, (element) => element.className.split(/\s+/).includes(className))
  if (!result) throw new Error(`Missing class: ${className}`)
  return result
}

function find(root: HTMLElement, predicate: (element: HTMLElement) => boolean): HTMLElement | null {
  if (predicate(root)) return root
  return Array.from(root.querySelectorAll<HTMLElement>("*")).find(predicate) ?? null
}

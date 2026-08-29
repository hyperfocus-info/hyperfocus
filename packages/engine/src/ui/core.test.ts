import { expect, test } from "bun:test"
import { connectUiRenderer, createMmoUiController, type UiRenderAdapter } from "./core.ts"

test("MMO UI controller exposes stable snapshots and framework-friendly subscriptions", () => {
  const selected: string[] = []
  const controller = createMmoUiController({
    inventory: [{ id: "potion", name: "Potion" }],
    panels: [{ id: "bag", title: "Bag" }],
    onInventoryItem: ({ id }) => selected.push(id)
  })
  const initial = controller.getSnapshot()
  let notifications = 0
  const unsubscribe = controller.subscribe(() => notifications += 1)

  expect(controller.getSnapshot()).toBe(initial)
  controller.actions.setStatus("Ready")
  expect(controller.getSnapshot()).toBe(initial)
  expect(notifications).toBe(0)
  expect(controller.actions.selectInventoryItem("missing")).toBe(false)
  expect(controller.actions.selectInventoryItem("potion")).toBe(true)
  expect(selected).toEqual(["potion"])
  expect(controller.actions.togglePanel("bag")).toBe(true)
  expect(controller.getSnapshot().openPanelIds.includes("bag")).toBe(false)
  expect(notifications).toBe(1)

  controller.actions.setStatus("Connected")
  expect(controller.getSnapshot().status).toBe("Connected")
  expect(notifications).toBe(2)
  unsubscribe()
})

test("renderer connector forwards snapshots and cleans up once", () => {
  const controller = createMmoUiController({ status: "Ready" })
  const updates: string[] = []
  let destroyed = 0
  const renderer: UiRenderAdapter<ReturnType<typeof controller.getSnapshot>, typeof controller.actions, string> = {
    mount({ target, state }) {
      updates.push(`${target}:${state.status}`)
    },
    update(state) {
      updates.push(state.status)
    },
    destroy() {
      destroyed += 1
    }
  }

  const connection = connectUiRenderer(controller, renderer, "root")
  controller.actions.setStatus("Online")
  connection.destroy()
  connection.destroy()
  controller.actions.setStatus("Ignored by renderer")

  expect(updates).toEqual(["root:Ready", "Online"])
  expect(destroyed).toBe(1)
})

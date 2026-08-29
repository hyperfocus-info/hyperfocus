# Framework UI integration

`@hyperfocus/engine/ui/core` is the DOM-free integration surface. It owns stable snapshots, subscriptions, validated actions, and UI intent callbacks. React, Vue, Svelte, server-side tools, and custom renderers can import it without loading the engine's HTML renderer.

`@hyperfocus/engine/ui` remains the zero-dependency default renderer. Pass the same controller to `createMmoUiShell` when a project wants the supplied DOM UI.

## Vanilla DOM renderer

```ts
import { createMmoUiController } from "@hyperfocus/engine/ui/core"
import { createMmoUiShell } from "@hyperfocus/engine/ui"

const controller = createMmoUiController({
  status: "Connecting",
  inventory: [{ id: "potion", name: "Potion", quantity: 3 }],
  onInventoryItem: ({ id }) => game.useItem(id)
})

const shell = createMmoUiShell({
  root: document.querySelector("#ui")!,
  controller
})

controller.actions.setStatus("Online")

// The creator owns both lifetimes.
shell.destroy()
controller.destroy()
```

## React

React can read the controller directly with its standard external-store hook. The engine does not need a React dependency or wrapper package.

```tsx
import { useEffect, useState, useSyncExternalStore } from "react"
import { createMmoUiController } from "@hyperfocus/engine/ui/core"

export function Inventory() {
  const [ui] = useState(() => createMmoUiController({
    inventory: [{ id: "potion", name: "Potion", quantity: 3 }],
    onInventoryItem: ({ id }) => game.useItem(id)
  }))

  useEffect(() => () => ui.destroy(), [ui])

  const state = useSyncExternalStore(
    ui.subscribe,
    ui.getSnapshot,
    ui.getSnapshot
  )

  return (
    <section>
      {state.inventory.map((item) => (
        <button
          key={item.id}
          disabled={item.disabled}
          onClick={() => ui.actions.selectInventoryItem(item.id)}
        >
          {item.name} x {item.quantity ?? 1}
        </button>
      ))}
    </section>
  )
}
```

For server rendering, create the controller per request or per mounted game instance rather than as a process-wide singleton.

## Vue

```vue
<script setup lang="ts">
import { onUnmounted, shallowRef } from "vue"
import { createMmoUiController } from "@hyperfocus/engine/ui/core"

const ui = createMmoUiController({
  inventory: [{ id: "potion", name: "Potion", quantity: 3 }]
})
const state = shallowRef(ui.getSnapshot())
const unsubscribe = ui.subscribe(() => state.value = ui.getSnapshot())

onUnmounted(() => {
  unsubscribe()
  ui.destroy()
})
</script>

<template>
  <button
    v-for="item in state.inventory"
    :key="item.id"
    :disabled="item.disabled"
    @click="ui.actions.selectInventoryItem(item.id)"
  >
    {{ item.name }} x {{ item.quantity ?? 1 }}
  </button>
</template>
```

## Custom render adapter

`connectUiRenderer` handles initial mounting, subscribed updates, and renderer cleanup. Destroying the connection does not destroy the controller because the controller may feed more than one view.

```ts
import {
  connectUiRenderer,
  createMmoUiController,
  type UiRenderAdapter
} from "@hyperfocus/engine/ui/core"

const ui = createMmoUiController({ status: "Ready" })

let root: HTMLElement | undefined
const renderer: UiRenderAdapter<
  ReturnType<typeof ui.getSnapshot>,
  typeof ui.actions,
  HTMLElement
> = {
  mount({ target, state, actions }) {
    root = target
    target.textContent = state.status
    target.onclick = () => actions.setStatus("Clicked")
  },
  update(state) {
    if (root) root.textContent = state.status
  },
  destroy() {
    root?.replaceChildren()
    root = undefined
  }
}

const connection = connectUiRenderer(
  ui,
  renderer,
  document.querySelector("#status")!
)

connection.destroy()
ui.destroy()
```

Keep game simulation state outside the UI controller. Send compact presentation snapshots into its setters and route action callbacks back to the game or network client.

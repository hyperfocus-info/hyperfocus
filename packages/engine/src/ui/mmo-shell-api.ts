import type { MmoUiController } from "./core.ts"
import type { MmoUiPanelConfig, MmoUiShell, MmoUiShellElements, MmoUiTheme } from "./mmo-shell-contracts.ts"
import type {
  MmoUiDebugEntry,
  MmoUiEquipmentSlot,
  MmoUiHotbarSlot,
  MmoUiInventoryItem,
  MmoUiStatEntry,
  MmoUiToolbarAction
} from "./model.ts"

export interface MmoUiShellState {
  controllerState: ReturnType<MmoUiController["getSnapshot"]> | undefined
  toolbarActions: MmoUiToolbarAction[]
  panelConfigs: MmoUiPanelConfig[]
  inventoryItems: MmoUiInventoryItem[]
  equipmentSlots: MmoUiEquipmentSlot[]
  hotbarSlots: MmoUiHotbarSlot[]
  statEntries: MmoUiStatEntry[]
  debugEntries: MmoUiDebugEntry[]
  openPanels: Set<string>
}

export interface MmoUiShellView extends MmoUiShellElements {
  heading: HTMLElement
}

export interface MmoUiShellRenderers {
  renderLogin(): void
  renderToolbar(): void
  renderPanels(): void
  renderInventory(): void
  renderEquipment(): void
  renderHotbar(): void
  renderStats(): void
  renderDebug(): void
  renderAll(): void
}

interface MmoUiShellApiOptions {
  controller: MmoUiController | undefined
  state: MmoUiShellState
  view: MmoUiShellView
  renderers: MmoUiShellRenderers
  setPanelOpen(id: string, open: boolean): void
  togglePanel(id: string): void
  setTheme(theme?: Partial<MmoUiTheme>): void
  unsubscribeController(): void
}

export function createMmoUiShellApi(options: MmoUiShellApiOptions): MmoUiShell {
  const { controller, renderers, state, view } = options
  return {
    root: view.shell,
    elements: {
      host: view.host,
      shell: view.shell,
      login: view.login,
      toolbar: view.toolbar,
      panels: view.panels,
      inventory: view.inventory,
      equipment: view.equipment,
      hotbar: view.hotbar,
      stats: view.stats,
      debug: view.debug,
      status: view.status
    },
    mount(target) {
      target.appendChild(view.shell)
      return view.shell
    },
    destroy() {
      options.unsubscribeController()
      view.shell.remove()
    },
    setTheme: options.setTheme,
    setStatus(nextStatus) {
      if (controller) controller.actions.setStatus(nextStatus)
      else view.status.textContent = nextStatus
    },
    setLoginVisible(visible) {
      if (controller) controller.actions.setLoginVisible(visible)
      else view.login.hidden = !visible
    },
    setToolbarActions(actions) {
      if (controller) {
        controller.actions.setToolbarActions(actions)
        return
      }
      state.toolbarActions = [...actions]
      renderers.renderToolbar()
    },
    setPanels(panels) {
      if (controller) {
        controller.actions.setPanels(panels)
        return
      }
      state.panelConfigs = [...panels]
      state.openPanels = new Set(state.panelConfigs.filter((panel) => panel.open ?? true).map((panel) => panel.id))
      renderers.renderPanels()
    },
    setPanelOpen: options.setPanelOpen,
    togglePanel: options.togglePanel,
    setInventoryItems(items) {
      if (controller) {
        controller.actions.setInventoryItems(items)
        return
      }
      state.inventoryItems = [...items]
      renderers.renderInventory()
    },
    setEquipmentSlots(slots) {
      if (controller) {
        controller.actions.setEquipmentSlots(slots)
        return
      }
      state.equipmentSlots = [...slots]
      renderers.renderEquipment()
    },
    setHotbarSlots(slots) {
      if (controller) {
        controller.actions.setHotbarSlots(slots)
        return
      }
      state.hotbarSlots = [...slots]
      renderers.renderHotbar()
    },
    setStats(entries) {
      if (controller) {
        controller.actions.setStats(entries)
        return
      }
      state.statEntries = [...entries]
      renderers.renderStats()
    },
    setDebugEntries(entries) {
      if (controller) {
        controller.actions.setDebugEntries(entries)
        return
      }
      state.debugEntries = [...entries]
      renderers.renderDebug()
    }
  }
}

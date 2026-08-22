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
  MmoUiPanelPayload,
  MmoUiStatEntry,
  MmoUiToolbarAction,
  MmoUiToolbarPayload
} from "./model.ts"

export * from "./model.ts"

export interface UiController<TState, TActions> {
  getSnapshot(): TState
  subscribe(listener: () => void): () => void
  readonly actions: TActions
  destroy(): void
}

export interface UiRenderAdapter<TState, TActions, TTarget = unknown> {
  mount(context: { target: TTarget; state: TState; actions: TActions }): void
  update(state: TState): void
  destroy(): void
}

export interface ConnectedUiRenderer {
  destroy(): void
}

export function connectUiRenderer<TState, TActions, TTarget>(
  controller: UiController<TState, TActions>,
  renderer: UiRenderAdapter<TState, TActions, TTarget>,
  target: TTarget
): ConnectedUiRenderer {
  renderer.mount({ target, state: controller.getSnapshot(), actions: controller.actions })
  const unsubscribe = controller.subscribe(() => renderer.update(controller.getSnapshot()))
  let connected = true
  return {
    destroy() {
      if (!connected) return
      connected = false
      unsubscribe()
      renderer.destroy()
    }
  }
}

export interface MmoUiControllerState<TPanelContent = unknown> {
  readonly title: string
  readonly status: string
  readonly loginVisible: boolean
  readonly toolbar: readonly MmoUiToolbarAction[]
  readonly panels: readonly MmoUiPanelData<TPanelContent>[]
  readonly openPanelIds: readonly string[]
  readonly inventory: readonly MmoUiInventoryItem[]
  readonly equipment: readonly MmoUiEquipmentSlot[]
  readonly hotbar: readonly MmoUiHotbarSlot[]
  readonly stats: readonly MmoUiStatEntry[]
  readonly debug: readonly MmoUiDebugEntry[]
}

export interface MmoUiControllerConfig<TPanelContent = unknown> {
  title?: string
  status?: string
  loginVisible?: boolean
  toolbar?: readonly MmoUiToolbarAction[]
  panels?: readonly MmoUiPanelData<TPanelContent>[]
  inventory?: readonly MmoUiInventoryItem[]
  equipment?: readonly MmoUiEquipmentSlot[]
  hotbar?: readonly MmoUiHotbarSlot[]
  stats?: readonly MmoUiStatEntry[]
  debug?: readonly MmoUiDebugEntry[]
  onLogin?: (payload: MmoUiLoginPayload) => void
  onToolbarAction?: (payload: MmoUiToolbarPayload) => void
  onPanelToggle?: (payload: MmoUiPanelPayload<TPanelContent>) => void
  onInventoryItem?: (payload: MmoUiInventoryPayload) => void
  onEquipmentSlot?: (payload: MmoUiEquipmentPayload) => void
  onHotbarActivate?: (payload: MmoUiHotbarPayload) => void
}

export interface MmoUiControllerActions<TPanelContent = unknown> {
  setTitle(title: string): void
  setStatus(status: string): void
  setLoginVisible(visible: boolean): void
  setToolbarActions(actions: readonly MmoUiToolbarAction[]): void
  setPanels(panels: readonly MmoUiPanelData<TPanelContent>[]): void
  setPanelOpen(id: string, open: boolean): boolean
  togglePanel(id: string): boolean
  setInventoryItems(items: readonly MmoUiInventoryItem[]): void
  setEquipmentSlots(slots: readonly MmoUiEquipmentSlot[]): void
  setHotbarSlots(slots: readonly MmoUiHotbarSlot[]): void
  setStats(entries: readonly MmoUiStatEntry[]): void
  setDebugEntries(entries: readonly MmoUiDebugEntry[]): void
  login(playerName: string): boolean
  selectToolbarAction(id: string): boolean
  selectInventoryItem(id: string): boolean
  selectEquipmentSlot(id: string): boolean
  activateHotbarSlot(id: string): boolean
}

export type MmoUiController<TPanelContent = unknown> = UiController<
  MmoUiControllerState<TPanelContent>,
  MmoUiControllerActions<TPanelContent>
>

function copy<T>(values: Iterable<T> | undefined): readonly T[] {
  return Object.freeze([...(values ?? [])])
}

export function createMmoUiController<TPanelContent = unknown>(
  config: MmoUiControllerConfig<TPanelContent> = {}
): MmoUiController<TPanelContent> {
  const listeners = new Set<() => void>()
  let active = true
  let snapshot: MmoUiControllerState<TPanelContent> = {
    title: config.title ?? "MMO Realm",
    status: config.status ?? "Ready",
    loginVisible: config.loginVisible ?? true,
    toolbar: copy(config.toolbar),
    panels: copy(config.panels),
    openPanelIds: copy((config.panels ?? []).filter((panel) => panel.open ?? true).map((panel) => panel.id)),
    inventory: copy(config.inventory),
    equipment: copy(config.equipment),
    hotbar: copy(config.hotbar),
    stats: copy(config.stats),
    debug: copy(config.debug)
  }

  function publish(patch: Partial<MmoUiControllerState<TPanelContent>>) {
    if (!active) return
    let changed = false
    for (const key of Object.keys(patch) as (keyof MmoUiControllerState<TPanelContent>)[]) {
      if (!Object.is(snapshot[key], patch[key])) {
        changed = true
        break
      }
    }
    if (!changed) return
    snapshot = Object.freeze({ ...snapshot, ...patch })
    for (const listener of listeners) listener()
  }

  function setPanels(panels: readonly MmoUiPanelData<TPanelContent>[]) {
    const next = copy(panels)
    publish({
      panels: next,
      openPanelIds: copy(next.filter((panel) => panel.open ?? true).map((panel) => panel.id))
    })
  }

  function setPanelOpen(id: string, open: boolean) {
    if (!active) return false
    const panel = snapshot.panels.find((candidate) => candidate.id === id)
    if (!panel) return false
    const next = new Set(snapshot.openPanelIds)
    if (open) next.add(id)
    else next.delete(id)
    if (next.size === snapshot.openPanelIds.length && snapshot.openPanelIds.includes(id) === open) return true
    publish({ openPanelIds: copy(next) })
    config.onPanelToggle?.({ id, panel, open })
    return true
  }

  const actions: MmoUiControllerActions<TPanelContent> = {
    setTitle: (title) => publish({ title }),
    setStatus: (status) => publish({ status }),
    setLoginVisible: (loginVisible) => publish({ loginVisible }),
    setToolbarActions: (toolbar) => publish({ toolbar: copy(toolbar) }),
    setPanels,
    setPanelOpen,
    togglePanel(id) {
      return setPanelOpen(id, !snapshot.openPanelIds.includes(id))
    },
    setInventoryItems: (inventory) => publish({ inventory: copy(inventory) }),
    setEquipmentSlots: (equipment) => publish({ equipment: copy(equipment) }),
    setHotbarSlots: (hotbar) => publish({ hotbar: copy(hotbar) }),
    setStats: (stats) => publish({ stats: copy(stats) }),
    setDebugEntries: (debug) => publish({ debug: copy(debug) }),
    login(playerName) {
      if (!active) return false
      const normalized = playerName.trim()
      if (!normalized) return false
      config.onLogin?.({ playerName: normalized })
      return true
    },
    selectToolbarAction(id) {
      if (!active) return false
      const action = snapshot.toolbar.find((candidate) => candidate.id === id)
      if (!action || action.disabled) return false
      config.onToolbarAction?.({ id, action })
      return true
    },
    selectInventoryItem(id) {
      if (!active) return false
      const item = snapshot.inventory.find((candidate) => candidate.id === id)
      if (!item || item.disabled) return false
      config.onInventoryItem?.({ id, item })
      return true
    },
    selectEquipmentSlot(id) {
      if (!active) return false
      const slot = snapshot.equipment.find((candidate) => candidate.id === id)
      if (!slot || slot.locked) return false
      config.onEquipmentSlot?.({ id, slot })
      return true
    },
    activateHotbarSlot(id) {
      if (!active) return false
      const slot = snapshot.hotbar.find((candidate) => candidate.id === id)
      if (!slot || slot.disabled) return false
      config.onHotbarActivate?.({ id, slot })
      return true
    }
  }

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      if (!active) return () => {}
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    actions,
    destroy() {
      active = false
      listeners.clear()
    }
  }
}

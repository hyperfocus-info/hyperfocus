import type { MmoUiController } from "./core.ts"
import type { MmoUiLoginConfig } from "./mmo-login.ts"
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
  MmoUiToolbarPayload
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

export interface MmoUiPanelConfig extends MmoUiPanelData<string | Node> {}

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
  /** Browser-only presentation adapter. Plain icon strings always remain text. */
  renderToolbarIcon?: (options: { action: MmoUiToolbarAction; document: Document }) => Node | undefined
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

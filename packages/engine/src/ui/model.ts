export type MmoUiTone = "normal" | "accent" | "danger" | "success"

export interface MmoUiToolbarAction {
  id: string
  label: string
  icon?: string
  title?: string
  disabled?: boolean
  active?: boolean
}

export interface MmoUiPanelData<TContent = unknown> {
  id: string
  title: string
  open?: boolean
  content?: TContent
}

export interface MmoUiInventoryItem {
  id: string
  name: string
  quantity?: number
  icon?: string
  rarity?: string
  description?: string
  disabled?: boolean
}

export interface MmoUiEquipmentSlot {
  id: string
  label: string
  item?: MmoUiInventoryItem | null
  locked?: boolean
}

export interface MmoUiHotbarSlot {
  id: string
  label?: string
  binding?: string
  item?: MmoUiInventoryItem | null
  cooldown?: number
  disabled?: boolean
}

export interface MmoUiStatEntry {
  id: string
  label: string
  value: string | number
  max?: number
  tone?: MmoUiTone
}

export interface MmoUiDebugEntry {
  id: string
  label: string
  value: string | number | boolean | null | undefined
}

export interface MmoUiLoginPayload {
  playerName: string
}

export interface MmoUiToolbarPayload {
  id: string
  action: MmoUiToolbarAction
}

export interface MmoUiPanelPayload<TContent = unknown> {
  id: string
  panel: MmoUiPanelData<TContent>
  open: boolean
}

export interface MmoUiInventoryPayload {
  id: string
  item: MmoUiInventoryItem
}

export interface MmoUiEquipmentPayload {
  id: string
  slot: MmoUiEquipmentSlot
}

export interface MmoUiHotbarPayload {
  id: string
  slot: MmoUiHotbarSlot
}

import { Save, Settings2, Star, type LucideIcon } from "lucide-solid";
import { For, Show, createMemo, createSignal } from "solid-js";
import { PadPilot } from "../../../padpilot/index";
import { buildFxPresetItems } from "../fx-module-selectors";
import { useFxModuleActions, useFxModuleState } from "../fx-module-store";
import styles from "../styles/fx-module.stylex";

type SidebarActionProps = {
  disabled?: boolean;
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  tooltip: string;
};

export type FxSidebarProps = {
  preferencesButtonRef?: (element: HTMLButtonElement) => void;
};

function SidebarAction(props: SidebarActionProps) {
  return (
    <PadPilot.ButtonGroup.Item disabled={props.disabled} icon={<props.icon size={14} />} onClick={props.onClick} tooltip={props.tooltip}>
      {props.label}
    </PadPilot.ButtonGroup.Item>
  );
}

export function FxSidebar(props: FxSidebarProps) {
  const state = useFxModuleState();
  const actions = useFxModuleActions();
  const [presetOpen, setPresetOpen] = createSignal(false);
  const presetItems = createMemo(() => buildFxPresetItems(state.host.presets, state.favorites.presetIds));
  const selectedPresetId = createMemo(() => state.session.working.selectedPresetId);

  return (
    <aside class={styles["preset-sidebar"]}>
      <div class={styles["sidebar-header"]}>
        <div class={styles["sidebar-heading"]}>
          <span>Module Presets</span>
          <small class={styles["sidebar-heading-small"]}>PadPilot FX</small>
        </div>
        <div class={styles["sidebar-badges"]}>
          <span class={styles["status-pill"]} data-state={state.session.dirty ? "dirty" : "clean"}>
            {state.session.dirty ? "Unsaved" : "Synced"}
          </span>
          <PadPilot.Button
            ref={props.preferencesButtonRef}
            class={styles["sidebar-cog"]}
            icon={<Settings2 size={14} />}
            onClick={(event) => actions.preferences.openModal(event.currentTarget)}
            tooltip="PadPilot Preferences"
          />
        </div>
      </div>

      <PadPilot.SearchableCombobox
        emptyText="No presets match the current search."
        items={presetItems()}
        onOpenChange={setPresetOpen}
        onQueryChange={actions.modulePresets.setQuery}
        onSelect={actions.modulePresets.select}
        open={presetOpen()}
        placeholder="Search module presets"
        query={state.ui.modulePreset.query}
        selectedId={selectedPresetId()}
      />

      <PadPilot.ButtonGroup class={styles["sidebar-actions"]} collapseWidth={320}>
        <SidebarAction icon={Save} label="Save" onClick={() => actions.modulePresets.setOpen(true)} tooltip="Save or rename a preset" />
        <SidebarAction
          disabled={!selectedPresetId()}
          icon={Star}
          label="Favorite"
          onClick={actions.modulePresets.toggleFavoriteSelected}
          tooltip="Toggle favorite"
        />
      </PadPilot.ButtonGroup>

      <div class={styles["preset-summary-list"]}>
        <For each={presetItems().slice(0, 6)}>
          {(preset) => (
            <PadPilot.Button
              class={`${styles["preset-summary-item"]} ${selectedPresetId() === preset.id ? styles["is-active"] : ""}`.trim()}
              variant="ghost"
              onClick={() => actions.modulePresets.select(preset.id)}
            >
              <div>
                <strong>{preset.label}</strong>
                <small>{preset.kind === "factory" ? "Factory" : preset.kind === "session" ? "Session" : "User"}</small>
              </div>
              <Show when={preset.favorite}>
                <Star size={12} />
              </Show>
            </PadPilot.Button>
          )}
        </For>
      </div>
    </aside>
  );
}

import { FileInput, Save, Star } from "lucide-solid";
import { For, Show, createEffect, createMemo, createSignal } from "solid-js";
import { PadPilot } from "../../../padpilot/index";
import { mergeFxPresetSummaries } from "../fx-bundled-presets";
import { buildFxPresetItems, filterFxPresetCatalogItems, type FxPresetCatalogFilter } from "../fx-module-selectors";
import { useFxModuleActions, useFxModuleState } from "../fx-module-store";
import styles from "./fx-preset-rail.stylex";

const PRESET_FILTERS = [
  { id: "all", label: "All" },
  { id: "utility", label: "Utility" },
  { id: "creative", label: "Creative" },
  { id: "era", label: "Eras" },
  { id: "user", label: "User" },
] as const;

/** FxPresetRail renders chain-preset browsing as the primary left-rail workflow. */
export function FxPresetRail() {
  const state = useFxModuleState();
  const actions = useFxModuleActions();
  const [isComboboxOpen, setComboboxOpen] = createSignal(false);
  const [favoritesOnly, setFavoritesOnly] = createSignal(false);
  const [presetFilter, setPresetFilter] = createSignal<FxPresetCatalogFilter>("all");
  const [query, setQuery] = createSignal("");
  const presetItems = createMemo(() =>
    buildFxPresetItems(
      mergeFxPresetSummaries(state.host.bundledPresets, state.host.presets),
      state.favorites.presetIds,
    ),
  );
  const selectedPresetId = createMemo(() => state.session.working.selectedPresetId);
  const selectedPresetLabel = createMemo(() => {
    const selectedId = selectedPresetId();
    return presetItems().find((preset) => preset.id === selectedId)?.label ?? "";
  });
  const availablePresetItems = createMemo(() => filterFxPresetCatalogItems(presetItems(), presetFilter(), favoritesOnly()));
  const filteredPresetItems = createMemo(() => {
    const normalizedQuery = query().trim().toLowerCase();
    const normalizedSelectedLabel = selectedPresetLabel().trim().toLowerCase();
    if (!normalizedQuery || normalizedQuery === normalizedSelectedLabel) {
      return availablePresetItems();
    }

    return availablePresetItems().filter((preset) => {
      const searchableValues = [preset.label, preset.description ?? "", ...preset.keywords];
      return searchableValues.some((value) => value.toLowerCase().includes(normalizedQuery));
    });
  });

  createEffect(() => {
    const selectedPreset = presetItems().find((preset) => preset.id === selectedPresetId());
    if (!selectedPreset) {
      return;
    }

    if (query() !== selectedPreset.label) {
      setQuery(selectedPreset.label);
    }
  });

  return (
    <aside class={styles.rail} data-testid="fx-preset-rail">
      <div class={styles["status-row"]}>
        <strong class={styles["status-row-strong"]}>Chain Presets</strong>
        <div class={styles["preset-actions"]}>
          <PadPilot.Button
            class={styles["action-button"]}
            data-testid="fx-set-state-code"
            icon={<FileInput size={14} />}
            onClick={() => actions.modulePresets.setCompactOpen(true)}
            tooltip="Set state from preset code"
          />
          <PadPilot.Button
            class={styles["action-button"]}
            data-testid="chain-preset-save-as"
            icon={<Save size={14} />}
            onClick={() => actions.modulePresets.setOpen(true)}
            tooltip="Save preset as"
          />
        </div>
      </div>

      <PadPilot.SearchableCombobox
        class={styles["search-combobox"]}
        data-testid="chain-preset-search"
        emptyText="No presets available."
        items={availablePresetItems()}
        onOpenChange={setComboboxOpen}
        onQueryChange={setQuery}
        onSelect={actions.modulePresets.select}
        open={isComboboxOpen()}
        placeholder="Search presets"
        query={query()}
        searchLabel="Search presets"
        selectedId={selectedPresetId() || undefined}
        toggleLabel="Browse presets"
      />

      <div class={styles["filter-row"]} aria-label="Preset categories">
        <For each={PRESET_FILTERS}>
          {(filter) => (
            <PadPilot.ToggleButton
              class={styles["filter-button"]}
              onClick={() => setPresetFilter(filter.id)}
              tooltip={`Show ${filter.label.toLowerCase()} presets`}
              value={presetFilter() === filter.id}
            >
              {filter.label}
            </PadPilot.ToggleButton>
          )}
        </For>
        <PadPilot.ToggleButton
          class={styles["filter-button"]}
          icon={<Star size={12} />}
          onClick={() => setFavoritesOnly((value) => !value)}
          tooltip={favoritesOnly() ? "Show all presets" : "Show favorite presets only"}
          value={favoritesOnly()}
        >
          Favorites
        </PadPilot.ToggleButton>
      </div>

      <div class={styles["meta-row"]}>
        <span class={styles["status-pill"]} data-state={state.session.dirty ? "dirty" : "clean"}>
          {state.session.dirty ? "Unsaved" : "Synced"}
        </span>
      </div>

      <div class={styles["preset-list"]} data-testid="chain-preset-list">
        <Show when={filteredPresetItems().length > 0} fallback={<div class={styles["empty-state"]}>No matching presets.</div>}>
          <For each={filteredPresetItems()}>
            {(preset) => (
              <PadPilot.Button
                class={`${styles["preset-item"]} ${selectedPresetId() === preset.id ? styles["is-active"] : ""}`.trim()}
                variant="ghost"
                data-testid={`chain-preset-item-${preset.id}`}
                onClick={() => actions.modulePresets.select(preset.id)}
              >
                <div class={styles["preset-copy"]}>
                  <strong>{preset.label}</strong>
                  <Show when={preset.description}>
                    <small class={styles["preset-copy-small"]}>{preset.description}</small>
                  </Show>
                </div>
                <span class={styles["preset-icons"]}>
                  <Show when={preset.favorite}>
                    <Star size={12} />
                  </Show>
                </span>
              </PadPilot.Button>
            )}
          </For>
        </Show>
      </div>
    </aside>
  );
}

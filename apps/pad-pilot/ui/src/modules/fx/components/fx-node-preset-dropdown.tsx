import { createMemo } from "solid-js";
import { useFxModuleActions, useFxModuleState } from "../fx-module-store";
import { createChainAccessor, createNodeAccessor } from "../fx-live-accessors";
import { type SearchableComboboxItem } from "../../../padpilot/types";
import { PadPilot } from "../../../padpilot/index";
import styles from "../styles/fx-node-registry.stylex";

export type FxNodePresetDropdownProps = {
  chainId: number;
  nodeId: number;
};

export function FxNodePresetDropdown(props: FxNodePresetDropdownProps) {
  const state = useFxModuleState();
  const actions = useFxModuleActions();
  const chain = createChainAccessor(() => state.session.working.chains, props.chainId);
  const node = createNodeAccessor(chain, props.nodeId);
  const nodeKey = `${props.chainId}:${props.nodeId}`;
  const items = createMemo<SearchableComboboxItem[]>(() =>
    (state.ui.nodePresets.libraryByType[node()?.type ?? 0] ?? []).map((entry) => ({
      id: entry.id,
      label: entry.name,
      kind: "session",
      description: "Node preset",
    })),
  );
  const selected = createMemo(() =>
    (state.ui.nodePresets.libraryByType[node()?.type ?? 0] ?? []).find((entry) => entry.name === (state.ui.nodePresets.queryByNode[nodeKey] ?? "")),
  );

  return (
    <div class={styles["preset-shell"]}>
      <PadPilot.SearchableCombobox
        classNames={{
          empty: styles["preset-empty"],
          field: styles["preset-field"],
          input: styles["preset-input"],
          item: styles["preset-item"],
          itemDescription: styles["preset-item-text-small"],
          itemText: styles["preset-item-text"],
          list: styles["preset-list"],
          root: `${styles["preset-root"]} ${styles["preset-shell-div"]}`.trim(),
          searchIcon: styles["preset-search-icon"],
          toggle: styles["preset-toggle"],
        }}
        emptyText="No node presets saved for this node type."
        items={items()}
        open={state.ui.nodePresets.openByNode[nodeKey] ?? false}
        placeholder="Node preset"
        query={state.ui.nodePresets.queryByNode[nodeKey] ?? ""}
        selectedId={selected()?.id}
        onOpenChange={(open) => actions.nodes.setPresetOpen(props.chainId, props.nodeId, open)}
        onQueryChange={(value) => actions.nodes.setPresetQuery(props.chainId, props.nodeId, value)}
        onSelect={(presetId) => actions.nodes.applyPreset(props.chainId, props.nodeId, presetId)}
      />
    </div>
  );
}

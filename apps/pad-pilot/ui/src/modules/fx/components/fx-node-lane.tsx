import { DragDropProvider, DragDropSensors, DragOverlay } from "@thisbeyond/solid-dnd";
import { For, Show, createMemo, createSignal } from "solid-js";
import { PadPilot } from "../../../padpilot/index";
import { moveItem } from "../../../utils/array";
import { parseNodeDragId } from "../fx-drag";
import { createChainAccessor, createNodeAccessor } from "../fx-live-accessors";
import { useFxModuleActions, useFxModuleState } from "../fx-module-store";
import { FxNodeType, NODE_LIBRARY } from "../fx-chain-state";
import { FxNodeCard } from "./fx-node-card";
import { FxDragPreview } from "./fx-drag-preview";
import styles from "../fx-module.stylex";

export type FxNodeLaneProps = {
  chainId: number;
};

export function FxNodeLane(props: FxNodeLaneProps) {
  const state = useFxModuleState();
  const actions = useFxModuleActions();
  const chain = createChainAccessor(() => state.session.working.chains, props.chainId);
  const nodeItems = createMemo(() =>
    NODE_LIBRARY.map((entry) => ({
      id: String(entry.type),
      label: entry.defaultName,
      description: "FX node",
    })),
  );
  const [activeDragId, setActiveDragId] = createSignal<string | null>(null);
  const [activeDropId, setActiveDropId] = createSignal<string | null>(null);
  const [addFxOpen, setAddFxOpen] = createSignal(false);
  const [addFxQuery, setAddFxQuery] = createSignal("");
  const activeNodeId = createMemo(() => parseNodeDragId(activeDragId(), props.chainId));
  const previewNodeIds = createMemo(() => {
    const ids = chain()?.nodes.map((node) => node.id) ?? [];
    const fromId = activeNodeId();
    const toId = parseNodeDragId(activeDropId(), props.chainId);
    if (fromId === null || toId === null) {
      return ids;
    }

    return moveItem(ids, ids.indexOf(fromId), ids.indexOf(toId));
  });
  const activeNode = createMemo(() => {
    const id = activeNodeId();
    return id === null ? undefined : createNodeAccessor(chain, id)();
  });

  return (
    <DragDropProvider
      onDragStart={({ draggable }) => setActiveDragId(draggable ? String(draggable.id) : null)}
      onDragOver={({ droppable }) => setActiveDropId(droppable ? String(droppable.id) : null)}
      onDragEnd={({ draggable, droppable }) => {
        if (!draggable || !droppable) {
          setActiveDragId(null);
          setActiveDropId(null);
          return;
        }

        const [dragPrefix, dragChainId, dragNodeId] = String(draggable.id).split(":");
        const [dropPrefix, dropChainId, dropNodeId] = String(droppable.id).split(":");
        if (dragPrefix !== "node" || dropPrefix !== "node") {
          setActiveDragId(null);
          setActiveDropId(null);
          return;
        }
        if (Number(dragChainId) !== props.chainId || Number(dropChainId) !== props.chainId) {
          setActiveDragId(null);
          setActiveDropId(null);
          return;
        }

        actions.nodes.reorder(props.chainId, Number(dragNodeId), Number(dropNodeId));
        setActiveDragId(null);
        setActiveDropId(null);
      }}
    >
      <DragDropSensors />
      <div class={styles["node-lane"]}>
        <For each={previewNodeIds()}>
          {(nodeId) => (
            <Show when={createNodeAccessor(chain, nodeId)()}>
              <FxNodeCard chainId={props.chainId} isPlaceholder={activeNodeId() === nodeId} nodeId={nodeId} />
            </Show>
          )}
        </For>
        <div class={styles["node-add-card"]}>
          <PadPilot.SearchableCombobox
            class={styles["node-add-card-child"]}
            emptyText="No FX nodes match."
            items={nodeItems()}
            onOpenChange={setAddFxOpen}
            onQueryChange={setAddFxQuery}
            onSelect={(next) => {
              const added = actions.nodes.add(props.chainId, Number.parseInt(next, 10) as FxNodeType);
              if (added) {
                setAddFxQuery("");
                setAddFxOpen(false);
              }
            }}
            open={addFxOpen()}
            placeholder="Add FX"
            query={addFxQuery()}
            searchLabel="Add FX"
            toggleLabel="Browse FX nodes"
          />
        </div>
      </div>
      <DragOverlay>
        <Show when={activeNode()}>
          {(node) => <FxDragPreview tone="node" title={node().name} subtitle={`Chain ${(chain()?.order ?? 0) + 1}`} />}
        </Show>
      </DragOverlay>
    </DragDropProvider>
  );
}

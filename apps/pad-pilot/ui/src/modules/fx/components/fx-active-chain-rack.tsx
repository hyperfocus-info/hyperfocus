import { DragDropProvider, DragDropSensors, DragOverlay } from "@thisbeyond/solid-dnd";
import { For, Show, createMemo, createSignal } from "solid-js";
import { PadPilot } from "../../../padpilot/index";
import { moveItem } from "../../../utils/array";
import { parseNodeDragId } from "../fx-drag";
import { createChainAccessor, createNodeAccessor } from "../fx-live-accessors";
import { getActiveFxChain } from "../fx-module-selectors";
import { useFxModuleActions, useFxModuleState } from "../fx-module-store";
import { FxNodeType, NODE_LIBRARY } from "../fx-chain-state";
import { FxNodeCard } from "./fx-node-card";
import { FxDragPreview } from "./fx-drag-preview";
import shellStyles from "../styles/fx-console-shell.stylex";

function getNodeIdFromRenderKey(value: string) {
  return Number.parseInt(value.split(":")[1] ?? "-1", 10);
}

/** FxActiveChainRack renders only the active chain's node stack and add-node bar. */
export function FxActiveChainRack() {
  const state = useFxModuleState();
  const activeChain = createMemo(() => getActiveFxChain(state.session.working.chains, state.ui.activeChainId));
  const activeChainId = createMemo(() => activeChain()?.id ?? null);

  return (
    <section class={shellStyles["active-rack"]} data-testid="fx-active-chain-rack">
      <Show when={activeChainId()} keyed>
        {(chainId) => <FxActiveChainRackBody chainId={chainId} />}
      </Show>
    </section>
  );
}

type FxActiveChainRackBodyProps = {
  chainId: number;
};

function FxActiveChainRackBody(props: FxActiveChainRackBodyProps) {
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
  const previewNodeRenderKeys = createMemo(() => {
    const renderKeys = (chain()?.nodes ?? []).map((node) => `${props.chainId}:${node.id}`);
    const fromId = activeNodeId();
    const toId = parseNodeDragId(activeDropId(), props.chainId);
    if (fromId === null || toId === null) {
      return renderKeys;
    }

    return moveItem(
      renderKeys,
      renderKeys.findIndex((value) => getNodeIdFromRenderKey(value) === fromId),
      renderKeys.findIndex((value) => getNodeIdFromRenderKey(value) === toId),
    );
  });
  const activeNode = createMemo(() => {
    const id = activeNodeId();
    return id === null ? undefined : createNodeAccessor(chain, id)();
  });

  return (
    <Show when={chain()}>
      {(currentChain) => (
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
            if (Number(dragChainId) !== currentChain().id || Number(dropChainId) !== currentChain().id) {
              setActiveDragId(null);
              setActiveDropId(null);
              return;
            }

            actions.nodes.reorder(currentChain().id, Number(dragNodeId), Number(dropNodeId));
            setActiveDragId(null);
            setActiveDropId(null);
          }}
        >
          <DragDropSensors />
          <Show when={currentChain().nodes.length === 0}>
            <div class={shellStyles["empty-chain"]} data-testid={`empty-chain-${currentChain().id}`}>
              No nodes added yet
            </div>
          </Show>

          <div class={shellStyles["node-stack"]} data-testid={`active-chain-${currentChain().id}`}>
            <For each={previewNodeRenderKeys()}>
              {(renderKey) => {
                const nodeId = getNodeIdFromRenderKey(renderKey);
                return (
                  <Show when={createNodeAccessor(chain, nodeId)()}>
                    <FxNodeCard chainId={currentChain().id} isPlaceholder={activeNodeId() === nodeId} nodeId={nodeId} />
                  </Show>
                );
              }}
            </For>
          </div>

          <div class={shellStyles["add-node-bar"]}>
            <PadPilot.SearchableCombobox
              class={shellStyles["add-node-combobox"]}
              emptyText="No FX nodes match."
              items={nodeItems()}
              onOpenChange={setAddFxOpen}
              onQueryChange={setAddFxQuery}
              onSelect={(next) => {
                const added = actions.nodes.add(currentChain().id, Number.parseInt(next, 10) as FxNodeType);
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

          <DragOverlay>
            <Show when={activeNode()}>
              {(node) => <FxDragPreview tone="node" title={node().name} subtitle={currentChain().name} />}
            </Show>
          </DragOverlay>
        </DragDropProvider>
      )}
    </Show>
  );
}

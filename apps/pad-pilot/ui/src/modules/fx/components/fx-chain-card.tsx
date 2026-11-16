import { createContext, useContext } from "solid-js";
const FxChainCardControls = createContext<FxChainCardProps>();
import { createDraggable } from "@thisbeyond/solid-dnd";
import { Headphones, Settings2, Volume2, VolumeX } from "lucide-solid";
import { type Accessor, Show, createMemo } from "solid-js";
import { DraggableCardHandle } from "../../../components/elements/draggable-card";
import { PadPilot } from "../../../padpilot/index";
import { CARD_DRAG_INTERACTIVE_SELECTOR, shouldHandleCardSurfaceAction } from "../fx-card-drag";
import { FxChainDropZone, bindCardDraggable } from "../fx-drag";
import { createChainAccessor } from "../fx-live-accessors";
import { buildFxTapMap, getFxChainPresetItems } from "../fx-module-selectors";
import { useFxModuleActions, useFxModuleState } from "../fx-module-store";
import { type TapView } from "../fx-types";
import { createMeterVisual, meterDbFromMix } from "../fx-visuals";
import { FxNodeLane } from "./fx-node-lane";
import styles from "../styles/fx-module.stylex";

export type FxChainCardProps = {
  activeDraggedChainId: Accessor<number | null>;
  chainId: number;
};

export function FxChainCard(props: FxChainCardProps) { return <FxChainCardControls.Provider value={props}><FxChainCardContent /></FxChainCardControls.Provider>; }
function FxChainCardContent() { const controls = useContext(FxChainCardControls); if (!controls) throw new Error("Missing FxChainCard controls");

  const state = useFxModuleState();
  const actions = useFxModuleActions();
  const chain = createChainAccessor(() => state.session.working.chains, controls.chainId);
  const draggable = createDraggable(`chain:${controls.chainId}`);
  const dragBinding = bindCardDraggable(draggable);
  const tapMap = createMemo(() => buildFxTapMap(state.host.displayVisualizer));
  const taps = createMemo(() => {
    const currentChain = chain();
    if (!currentChain) {
      return {};
    }

    const result: Record<number, TapView> = {};
    for (const node of currentChain.nodes) {
      result[node.id] = tapMap().get(`${currentChain.id}:${node.id}`) ?? {
        inputPeakDb: meterDbFromMix(currentChain.mix),
        outputPeakDb: meterDbFromMix(currentChain.mix + 0.1),
      };
    }
    return result;
  });
  const firstNodeId = createMemo(() => chain()?.nodes[0]?.id ?? 0);
  const lastNodeId = createMemo(() => {
    const nodes = chain()?.nodes ?? [];
    return nodes.length > 0 ? nodes[nodes.length - 1]!.id : 0;
  });
  const chainInputMeter = createMemo(() => {
    const currentChain = chain();
    const tap = taps()[firstNodeId()];
    return createMeterVisual(
      tap?.inputPeakDb ?? meterDbFromMix(currentChain?.mix ?? 0.65),
      state.preferences.displayStereoMeters,
      tap?.inputPeakDbLeft,
      tap?.inputPeakDbRight,
    );
  });
  const chainOutputMeter = createMemo(() => {
    const currentChain = chain();
    const tap = taps()[lastNodeId()];
    return createMeterVisual(
      tap?.outputPeakDb ?? meterDbFromMix((currentChain?.mix ?? 0.65) + 0.1),
      state.preferences.displayStereoMeters,
      tap?.outputPeakDbLeft,
      tap?.outputPeakDbRight,
    );
  });
  const chainPresetEntries = createMemo(() => state.ui.chainPresets.libraryByChain[controls.chainId] ?? []);
  const chainPresetItems = createMemo(() => getFxChainPresetItems(chainPresetEntries()));
  const selectedChainPreset = createMemo(() => chainPresetEntries().find((item) => item.name === (state.ui.chainPresets.queryByChain[controls.chainId] ?? "")));
  const muteIcon = createMemo(() => (chain()?.muted ? VolumeX : Volume2));

  return (
    <Show when={chain()}>
      <FxChainDropZone chainId={controls.chainId}>
        <PadPilot.DraggableCard
          dragRef={dragBinding.ref}
          dragStyle={dragBinding.style()}
          header={
            <header class={styles["chain-header"]}>
              <div class={styles["chain-title-row"]}>
                <DraggableCardHandle />
                <div class={styles["chain-title-button"]}>
                  <span class={styles["chain-index"]}>{`Chain ${(chain()?.order ?? 0) + 1}`}</span>
                  <div class={styles["chain-title-copy"]}>
                    <strong>{chain()?.name}</strong>
                    <small class={styles["chain-title-copy-small"]}>{`${chain()?.nodes.length ?? 0} nodes`}</small>
                  </div>
                </div>
              </div>
              <div class={styles["chain-header-controls"]}>
                <PadPilot.Button
                  aria-pressed={chain()?.muted ?? false}
                  class={`${styles["icon-action"]} ${chain()?.muted ? styles["icon-action-active"] : ""}`.trim()}
                  data-testid={`chain-mute-button-${controls.chainId}`}
                  icon={muteIcon()}
                  onClick={() => actions.chains.toggleMute(controls.chainId)}
                  tooltip={chain()?.muted ? "Unmute chain" : "Mute chain"}
                />
                <PadPilot.Button
                  aria-pressed={chain()?.solo ?? false}
                  class={`${styles["icon-action"]} ${chain()?.solo ? styles["icon-action-active"] : ""}`.trim()}
                  data-testid={`chain-solo-button-${controls.chainId}`}
                  icon={Headphones}
                  onClick={() => actions.chains.toggleSolo(controls.chainId)}
                  tooltip={chain()?.solo ? "Disable solo" : "Solo chain"}
                />
                <PadPilot.Knob
                  data-testid={`chain-mix-knob-${controls.chainId}`}
                  min={0}
                  max={1}
                  value={chain()?.mix ?? 0.65}
                  hideValue={true}
                  defaultValue={0.65}
                  tooltip={`Chain wet/dry mix ${Math.round((chain()?.mix ?? 0.65) * 100)}%`}
                  valueFormatter={(value) => `${Math.round(value * 100)}%`}
                  onChange={(value) => actions.chains.setMix(controls.chainId, value, false)}
                  onCommit={(value) => actions.chains.setMix(controls.chainId, value, true)}
                  manualInput
                  fineDragMultiplier={0.15}
                  size={32}
                />
              </div>
            </header>
          }
          class={`${styles["chain-card"]} ${state.ui.activeChainId === controls.chainId ? styles["is-active"] : ""} ${chain()?.muted ? styles["is-muted"] : ""}`.trim()}
          data-testid={`chain-card-${controls.chainId}`}
          isDragging={dragBinding.isActiveDraggable()}
          isPlaceholder={controls.activeDraggedChainId() === controls.chainId}
          onClick={(event) => {
            if (!shouldHandleCardSurfaceAction(event.target, event.currentTarget, CARD_DRAG_INTERACTIVE_SELECTOR)) {
              return;
            }
            actions.chains.activate(controls.chainId);
          }}
          onDragPointerDown={dragBinding.onPointerDown}
          variant="chain"
        >
          <div class={styles["chain-preset-row"]}>
            <PadPilot.SearchableCombobox
              emptyText="No chain presets saved in this session."
              items={chainPresetItems()}
              onOpenChange={(open) => actions.chainPresets.setOpen(controls.chainId, open)}
              onQueryChange={(value) => actions.chainPresets.setQuery(controls.chainId, value)}
              onSelect={(presetId) => actions.chainPresets.apply(controls.chainId, presetId)}
              open={state.ui.chainPresets.openByChain[controls.chainId] ?? false}
              placeholder="Search chain presets"
              query={state.ui.chainPresets.queryByChain[controls.chainId] ?? ""}
              selectedId={selectedChainPreset()?.id}
            />
            <PadPilot.Button icon={<Settings2 size={14} />} onClick={() => actions.chainPresets.openManager(controls.chainId)} tooltip="Manage chain presets">
              Manage
            </PadPilot.Button>
          </div>

          <div class={styles["chain-body"]}>
            <Show when={state.preferences.displayChainMeters}>
              <div class={styles["chain-meter-column"]} data-testid={`chain-meter-column-${controls.chainId}`}>
                <PadPilot.Meter
                  label="Input"
                  leftValueDb={chainInputMeter().leftValueDb}
                  rightValueDb={chainInputMeter().rightValueDb}
                  stereo={chainInputMeter().stereo}
                  valueDb={chainInputMeter().valueDb}
                />
                <PadPilot.Meter
                  label="Output"
                  leftValueDb={chainOutputMeter().leftValueDb}
                  rightValueDb={chainOutputMeter().rightValueDb}
                  stereo={chainOutputMeter().stereo}
                  valueDb={chainOutputMeter().valueDb}
                />
              </div>
            </Show>
            <FxNodeLane chainId={controls.chainId} />
          </div>
        </PadPilot.DraggableCard>
      </FxChainDropZone>
    </Show>
  );

}

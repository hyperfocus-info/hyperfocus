import { Headphones, VolumeX, X } from "lucide-solid";
import { Show, createMemo } from "solid-js";
import { PadPilot } from "../../../padpilot/index";
import { createChainAccessor } from "../fx-live-accessors";
import { useFxModuleActions, useFxModuleState } from "../fx-module-store";
import styles from "./fx-chain-tabs.stylex";

export type FxChainTabProps = {
  chainId: number;
};

/** FxChainTab renders one compact chain tab plus its mute/solo/mix strip. */
export function FxChainTab(props: FxChainTabProps) {
  const state = useFxModuleState();
  const actions = useFxModuleActions();
  const chain = createChainAccessor(() => state.session.working.chains, props.chainId);
  const active = createMemo(() => state.ui.activeChainId === props.chainId);
  const canDelete = createMemo(() => state.session.working.chains.length > 1);
  const chainLabel = createMemo(() => {
    const order = chain()?.order ?? 0;
    return `Chain ${order + 1}`;
  });

  return (
    <Show when={chain()}>
      <section class={`${styles["tab-column"]} ${active() ? styles["is-active"] : ""}`.trim()} data-testid={`chain-tab-${props.chainId}`}>
        <PadPilot.Tab
          class={styles.tab}
          selected={active()}
          onClick={() => actions.chains.activate(props.chainId)}
        >
          <PadPilot.Button
            type="button"
            class={styles["delete-button"]}
            tooltip={`Delete ${chainLabel()}`}
            disabled={!canDelete()}
            icon={<X size={12} />}
            variant="ghost"
            onClick={() => actions.chains.remove(props.chainId)}
            anchorClass={styles["delete-button-anchor"]}
          />
          <div class={styles["tab-copy"]}>
            <span>{chainLabel()}</span>
          </div>
          <div class={styles["tab-controls"]} data-testid={`chain-tab-controls-${props.chainId}`}>
            <PadPilot.ToggleButton
              type="button"
              class={`${styles["tab-toggle"]} ${chain()?.muted ? styles["is-pressed"] : ""}`.trim()}
              data-testid={`chain-tab-mute-${props.chainId}`}
              icon={<VolumeX size={12} />}
              value={chain()?.muted ?? false}
              variant="ghost"
              onClick={() => actions.chains.toggleMute(props.chainId)}
              tooltip={chain()?.muted ? "Unmute chain" : "Mute chain"}
            />
            <PadPilot.ToggleButton
              type="button"
              class={`${styles["tab-toggle"]} ${chain()?.solo ? styles["is-pressed"] : ""}`.trim()}
              data-testid={`chain-tab-solo-${props.chainId}`}
              icon={<Headphones size={12} />}
              value={chain()?.solo ?? false}
              variant="ghost"
              tooltip={chain()?.solo ? "Disable solo" : "Solo chain"}
              onClick={() => actions.chains.toggleSolo(props.chainId)}
            />
            <PadPilot.Knob
              min={0}
              max={1}
              value={chain()?.mix ?? 0.65}
              defaultValue={0.65}
              hideValue={true}
              class={styles["tab-mix"]}
              size={22}
              tooltip={`Chain mix ${Math.round((chain()?.mix ?? 0.65) * 100)}%`}
              valueFormatter={(value) => `${Math.round(value * 100)}%`}
              onChange={(value) => actions.chains.setMix(props.chainId, value, false)}
              onCommit={(value) => actions.chains.setMix(props.chainId, value, true)}
            />
          </div>
        </PadPilot.Tab>
      </section>
    </Show>
  );
}

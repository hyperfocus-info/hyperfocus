import { Headphones, PowerIcon, PowerOffIcon, X } from "lucide-solid";
import { DraggableCardHandle } from "../../../components/elements/draggable-card";
import { PadPilot } from "../../../padpilot/index";
import { createChainAccessor, createNodeAccessor } from "../fx-live-accessors";
import { useFxModuleActions, useFxModuleState } from "../fx-module-store";
import { FxNodePresetDropdown } from "./fx-node-preset-dropdown";
import styles from "../fx-node-registry.module.css";
import { getNodeName } from "../node-registry/registry";

export type FxNodeHeaderProps = {
  chainId: number;
  nodeId: number;
};

export function FxNodeHeader(props: FxNodeHeaderProps) {
  const state = useFxModuleState();
  const actions = useFxModuleActions();
  const chain = createChainAccessor(() => state.session.working.chains, props.chainId);
  const node = createNodeAccessor(chain, props.nodeId);
  const bypassIcon = () => (node()?.bypassed ? PowerOffIcon : PowerIcon);

  return (
    <header class={styles["node-header"]}>
      <div class={styles["node-header-top"]}>
        <div class={styles["node-leading"]}>
          <DraggableCardHandle />
          <PadPilot.Button
            aria-pressed={node()?.bypassed ?? false}
            class={styles["icon-action"]}
            classList={{ [styles["icon-action-active"]]: node()?.bypassed ?? false }}
            data-testid={`node-bypass-button-${props.chainId}-${props.nodeId}`}
            icon={bypassIcon()}
            onClick={() => actions.nodes.toggleBypass(props.chainId, props.nodeId)}
            tooltip={node()?.bypassed ? "Enable node" : "Bypass node"}
            anchorClass={styles["icon-action-anchor"]}
          />
          <PadPilot.Button
            aria-pressed={node()?.solo ?? false}
            class={styles["icon-action"]}
            classList={{ [styles["icon-action-active"]]: node()?.solo ?? false }}
            data-testid={`node-solo-button-${props.chainId}-${props.nodeId}`}
            icon={Headphones}
            onClick={() => actions.nodes.toggleSolo(props.chainId, props.nodeId)}
            tooltip={node()?.solo ? "Disable node solo" : "Solo node"}
            anchorClass={styles["icon-action-anchor"]}
          />
        </div>

        <div class={styles["node-center"]}>
          <div class={styles["node-title-stack"]}>
            <div class={styles["node-name"]}>
              <strong>{(node() && getNodeName(node()!.type)) ?? node()?.name}</strong>
            </div>
            <FxNodePresetDropdown chainId={props.chainId} nodeId={props.nodeId} />
          </div>
        </div>

        <div class={styles["node-trailing"]}>
          <PadPilot.Knob
            min={0}
            max={1}
            value={node()?.mix ?? 1}
            defaultValue={1}
            hideValue={true}
            tooltip={`Node mix ${Math.round((node()?.mix ?? 1) * 100)}%`}
            label="Mix"
            valueFormatter={(value) => `${Math.round(value * 100)}%`}
            onChange={(value) => actions.nodes.setMix(props.chainId, props.nodeId, value, false)}
            onCommit={(value) => actions.nodes.setMix(props.chainId, props.nodeId, value, true)}
            size={28}
          />
          <PadPilot.Button
            class={`${styles["icon-action"]} ${styles["icon-action-danger"]}`.trim()}
            data-testid={`node-remove-button-${props.chainId}-${props.nodeId}`}
            icon={X}
            onClick={() => actions.nodes.remove(props.chainId, props.nodeId)}
            tooltip="Remove node"
            anchorClass={`${styles["icon-action-anchor"]} ${styles["icon-action-anchor-danger"]}`.trim()}
          />
        </div>
      </div>
    </header>
  );
}

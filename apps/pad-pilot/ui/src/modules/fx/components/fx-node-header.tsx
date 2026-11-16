import { createContext, useContext } from "solid-js";
const FxNodeHeaderControls = createContext<FxNodeHeaderProps>();
import { Headphones, PowerIcon, PowerOffIcon, X } from "lucide-solid";
import { DraggableCardHandle } from "../../../components/elements/draggable-card";
import { PadPilot } from "../../../padpilot/index";
import { createChainAccessor, createNodeAccessor } from "../fx-live-accessors";
import { useFxModuleActions, useFxModuleState } from "../fx-module-store";
import { FxNodePresetDropdown } from "./fx-node-preset-dropdown";
import styles from "../styles/fx-node-registry.stylex";
import moduleStyles from "../styles/fx-module.stylex";
import { getNodeName } from "../node-registry/registry";

export type FxNodeHeaderProps = {
  chainId: number;
  nodeId: number;
};

export function FxNodeHeader(props: FxNodeHeaderProps) { return <FxNodeHeaderControls.Provider value={props}><FxNodeHeaderContent /></FxNodeHeaderControls.Provider>; }
function FxNodeHeaderContent() { const controls = useContext(FxNodeHeaderControls); if (!controls) throw new Error("Missing FxNodeHeader controls");

  const state = useFxModuleState();
  const actions = useFxModuleActions();
  const chain = createChainAccessor(() => state.session.working.chains, controls.chainId);
  const node = createNodeAccessor(chain, controls.nodeId);
  const bypassIcon = () => (node()?.bypassed ? PowerOffIcon : PowerIcon);

  return (
    <header class={styles["node-header"]}>
      <div class={styles["node-header-top"]}>
        <div class={styles["node-leading"]}>
          <DraggableCardHandle />
          <PadPilot.Button
            aria-pressed={node()?.bypassed ?? false}
            class={`${moduleStyles["icon-action"]} ${node()?.bypassed ? moduleStyles["icon-action-active"] : ""}`.trim()}
            data-testid={`node-bypass-button-${controls.chainId}-${controls.nodeId}`}
            icon={bypassIcon()}
            onClick={() => actions.nodes.toggleBypass(controls.chainId, controls.nodeId)}
            tooltip={node()?.bypassed ? "Enable node" : "Bypass node"}
          />
          <PadPilot.Button
            aria-pressed={node()?.solo ?? false}
            class={`${moduleStyles["icon-action"]} ${node()?.solo ? moduleStyles["icon-action-active"] : ""}`.trim()}
            data-testid={`node-solo-button-${controls.chainId}-${controls.nodeId}`}
            icon={Headphones}
            onClick={() => actions.nodes.toggleSolo(controls.chainId, controls.nodeId)}
            tooltip={node()?.solo ? "Disable node solo" : "Solo node"}
          />
        </div>

        <div class={styles["node-center"]}>
          <div class={styles["node-title-stack"]}>
            <div class={styles["node-name"]}>
              <strong class={styles["node-name-strong"]}>{(node() && getNodeName(node()!.type)) ?? node()?.name}</strong>
            </div>
            <FxNodePresetDropdown chainId={controls.chainId} nodeId={controls.nodeId} />
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
            onChange={(value) => actions.nodes.setMix(controls.chainId, controls.nodeId, value, false)}
            onCommit={(value) => actions.nodes.setMix(controls.chainId, controls.nodeId, value, true)}
            size={28}
          />
          <PadPilot.Button
            class={moduleStyles["icon-action"]}
            data-testid={`node-remove-button-${controls.chainId}-${controls.nodeId}`}
            icon={X}
            onClick={() => actions.nodes.remove(controls.chainId, controls.nodeId)}
            tooltip="Remove node"
            anchorClass={moduleStyles["icon-action-anchor-danger"]}
          />
        </div>
      </div>
    </header>
  );

}

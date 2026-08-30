import { Plus, Redo2, Undo2 } from "lucide-solid";
import { PadPilot } from "../../../padpilot/index";
import { FxChainTab } from "./fx-chain-tab";
import { useFxModuleActions, useFxModuleState } from "../fx-module-store";
import { FxActiveChainRack } from "./fx-active-chain-rack";
import { FxMasterIoRack } from "./fx-master-io-rack";
import { FxPresetRail } from "./fx-preset-rail";
import { FxCreativeTools } from "./fx-creative-tools";
import { For } from "solid-js";
import styles from "../styles/fx-console-shell.stylex";
import tabStyles from "./styles/fx-chain-tabs.stylex";

/** FxConsoleShell owns the three-column FX console layout. */
export function FxConsoleShell() {
  const actions = useFxModuleActions();
  const state = useFxModuleState();

  return (
    <section class={styles.shell} data-testid="fx-console-shell" style={{ "--pp-accent-color": "#4de9ff", "--pp-base-bg": "#07111c" }}>
      <header class={styles.toolbar}>
        <div class={styles["toolbar-copy"]}>
          <span class={styles["console-kicker"]}>PadPilot</span>
          <h2 class={styles["toolbar-copy-h2"]}>FX Console</h2>
        </div>
        <PadPilot.ButtonGroup class={styles["toolbar-actions"]} collapseWidth={360}>
          <PadPilot.ButtonGroup.Item disabled={!actions.history.canUndo()} icon={<Undo2 size={14} />} onClick={actions.history.undo} tooltip="Undo">
            Undo
          </PadPilot.ButtonGroup.Item>
          <PadPilot.ButtonGroup.Item disabled={!actions.history.canRedo()} icon={<Redo2 size={14} />} onClick={actions.history.redo} tooltip="Redo">
            Redo
          </PadPilot.ButtonGroup.Item>
        </PadPilot.ButtonGroup>
      </header>

      <div class={styles.layout}>
        <FxPresetRail />
        <section class={styles.center}>
          <PadPilot.TabList class={tabStyles.tabs} data-testid="fx-chain-tabs" ariaLabel="FX chains">
            <For each={state.session.working.chains}>{(chain) => <FxChainTab chainId={chain.id} />}</For>
            <PadPilot.Button
              class={tabStyles["add-tab"]}
              icon={<Plus size={14} />}
              variant="tab"
              data-testid="add-chain-tab"
              onClick={actions.chains.add}
              tooltip="Add chain"
            >
              Add
            </PadPilot.Button>
          </PadPilot.TabList>
          <FxActiveChainRack />
        </section>
        <FxMasterIoRack />
      </div>
      <FxCreativeTools />
    </section>
  );
}

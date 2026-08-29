import { Show, createEffect, createSignal, onCleanup, onMount } from "solid-js";
import { hasNativeHostTransport } from "../bridge";
import { getDevHostRuntime } from "../dev-host/runtime";
import type { DevHostDebugState, DevSignalProfile } from "../dev-host/types";
import { PadPilot } from "../padpilot/index";
import { isPadPilotDevtoolsEnabled } from "../runtime-flags";
import styles from "./dev-host-panel.module.css";

const PROFILE_OPTIONS: DevSignalProfile[] = ["idle", "steady-tone", "pulsed-groove", "noise-burst", "sweep"];
const DEV_HOST_PANEL_OPEN_KEY = "padpilot.dev-host.panel-open";

export function DevHostPanel() {
  if (!isPadPilotDevtoolsEnabled() || hasNativeHostTransport()) {
    return null;
  }

  const runtime = getDevHostRuntime();
  const [open, setOpen] = createSignal((() => {
    try {
      return window.localStorage.getItem(DEV_HOST_PANEL_OPEN_KEY) === "1";
    } catch {
      return false;
    }
  })());
  const [state, setState] = createSignal<DevHostDebugState>(runtime.getDebugState());
  const [profileOpen, setProfileOpen] = createSignal(false);
  const [profileQuery, setProfileQuery] = createSignal("");

  onMount(() => {
    const unsubscribe = runtime.subscribeDebug(setState);
    onCleanup(unsubscribe);
  });

  createEffect(() => {
    try {
      window.localStorage.setItem(DEV_HOST_PANEL_OPEN_KEY, open() ? "1" : "0");
    } catch {
      // Ignore storage restrictions in host environments.
    }
  });

  return (
    <>
      <PadPilot.Button type="button" variant="ghost" class={styles["dev-host-trigger"]} onClick={() => setOpen((current) => !current)}>
        Dev Host
      </PadPilot.Button>
      <Show when={open()}>
        <PadPilot.Modal open={open()} onClose={() => setOpen(false)} size="sm" title="Dev Host">
          <div class={styles["dev-host-header"]}>
            <div class={styles["dev-host-meta"]}>{`${state().selectedModuleId} | rev ${state().acceptedRevision.toString()}`}</div>
            <div class={styles["dev-host-meta"]}>{`seq ${state().sequence.toString()}`}</div>
          </div>
          <div class={styles["dev-host-body"]}>
            <div class={styles["dev-host-status-grid"]}>
              <div class={styles["dev-host-status-card"]}>
                <span>Browser gamepad</span>
                <strong>{state().browserGamepadSupported ? "supported" : "unavailable"}</strong>
              </div>
              <div class={styles["dev-host-status-card"]}>
                <span>Controllers</span>
                <strong>{`${state().connectedControllerCount} connected`}</strong>
              </div>
            </div>
            <div class={styles["dev-host-row"]}>
              <PadPilot.SearchableCombobox
                items={PROFILE_OPTIONS.map((option) => ({ id: option, label: option }))}
                query={profileQuery() || state().profile}
                open={profileOpen()}
                placeholder="Signal profile"
                emptyText="No profiles match."
                selectedId={state().profile}
                searchLabel="Signal profile"
                onOpenChange={setProfileOpen}
                onQueryChange={setProfileQuery}
                onSelect={(value) => {
                  setProfileQuery(value);
                  runtime.updateSettings({ profile: value as DevSignalProfile });
                }}
              />
            </div>
            <div class={styles["dev-host-inline-grid"]}>
              <div class={styles["dev-host-row"]}>
                <PadPilot.Slider
                  orientation="horizontal"
                  label="Intensity"
                  min={0}
                  max={1}
                  value={state().intensity}
                  onChange={(value) => runtime.updateSettings({ intensity: value })}
                  onCommit={(value) => runtime.updateSettings({ intensity: value })}
                  width={120}
                  height={34}
                />
              </div>
              <div class={styles["dev-host-row"]}>
                <PadPilot.Slider
                  orientation="horizontal"
                  label="Stereo width"
                  min={0}
                  max={1}
                  value={state().stereoWidth}
                  onChange={(value) => runtime.updateSettings({ stereoWidth: value })}
                  onCommit={(value) => runtime.updateSettings({ stereoWidth: value })}
                  width={120}
                  height={34}
                />
              </div>
            </div>
            <div class={styles["dev-host-row"]}>
              <PadPilot.Slider
                orientation="horizontal"
                label="Tempo"
                min={40}
                max={220}
                value={state().tempo}
                onChange={(value) => runtime.updateSettings({ tempo: value })}
                onCommit={(value) => runtime.updateSettings({ tempo: value })}
                width={256}
                height={34}
              />
            </div>
            <PadPilot.CheckboxField
              checked={state().running}
              label="Running"
              description="Keep the signal generator active."
              onChange={(event) => runtime.updateSettings({ running: event.currentTarget.checked })}
            />
            <PadPilot.CheckboxField
              checked={state().continuousHostSync}
              label="Continuous host sync"
              description="Push state into the host on every simulated change."
              onChange={(event) => runtime.updateSettings({ continuousHostSync: event.currentTarget.checked })}
            />
            <div class={styles["dev-host-actions"]}>
              <PadPilot.Button type="button" variant="secondary" class={styles["dev-host-button"]} onClick={runtime.reset}>
                Reset state
              </PadPilot.Button>
              <PadPilot.Button
                type="button"
                variant="secondary"
                class={styles["dev-host-button"]}
                onClick={() => runtime.updateSettings({ running: !state().running })}
              >
                {state().running ? "Pause" : "Resume"}
              </PadPilot.Button>
            </div>
          </div>
        </PadPilot.Modal>
      </Show>
    </>
  );
}


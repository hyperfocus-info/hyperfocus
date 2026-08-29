import { Show, createMemo, splitProps, type JSX } from "solid-js";
import { Button } from "./button";
import { Dropdown } from "./dropdown";
import { TextField } from "./text-field";
import styles from "./hotkey-macro-field.module.css";
import {
  createHotkeyRecorder,
  formatControllerMacro,
  formatTriggerDefinition,
  type PadPilotControllerMacro,
  type PadPilotRecorderMode,
  type PadPilotTriggerDefinition,
} from "../../padpilot/hotkeys";
import { useInputDevices } from "../../padpilot/provider";

/**
 * Props for HotkeyMacroField.
 */
export type HotkeyMacroFieldProps = Omit<
  JSX.HTMLAttributes<HTMLDivElement>,
  "onChange"
> & {
  /** Optional helper text shown beneath the label. */
  description?: string;
  /** Field label. */
  label?: string;
  /** Recorder mode to use when capturing a new binding. */
  mode?: PadPilotRecorderMode;
  /** Current trigger definition. */
  value: PadPilotTriggerDefinition | null;
  /** Fired when the trigger definition changes. */
  onChange: (value: PadPilotTriggerDefinition | null) => void;
};

/** HotkeyMacroField records, formats, and edits PadPilot hotkey/controller macros. */
export function HotkeyMacroField(props: HotkeyMacroFieldProps) {
  const [local, others] = splitProps(props, [
    "class",
    "description",
    "label",
    "mode",
    "onChange",
    "value",
  ]);
  const inputDevices = useInputDevices();
  const recorder = createHotkeyRecorder({
    mode: local.mode ?? "mixed",
    onClear: () => local.onChange(null),
    onRecordTrigger: (trigger: PadPilotTriggerDefinition) =>
      local.onChange(trigger),
  });

  const controllerMacro = createMemo(
    () => local.value?.controller ?? null,
  );
  const scopeMissing = createMemo(() => {
    const macro = controllerMacro();
    const scope = macro?.scope;
    if (!macro || scope?.mode !== "specific-device") {
      return false;
    }

    return !inputDevices().some(
      (device) =>
        device.connected &&
        device.deviceId === scope.deviceId &&
        device.deviceKind === scope.deviceKind,
    );
  });
  const summary = createMemo(() => {
    if (!local.value) {
      return "No binding recorded.";
    }
    return local.value.controller
      ? formatControllerMacro(local.value.controller)
      : formatTriggerDefinition(local.value);
  });
  const firstControllerCondition = createMemo(
    () => controllerMacro()?.conditions[0] ?? null,
  );
  const axisThreshold = createMemo(() => {
    const condition = firstControllerCondition();
    return condition && condition.kind === "axis"
      ? condition.threshold
      : 0.5;
  });

  const updateControllerMacro = (
    updater: (macro: PadPilotControllerMacro) => PadPilotControllerMacro,
  ) => {
    const macro = controllerMacro();
    if (!macro) {
      return;
    }
    local.onChange({
      ...local.value,
      controller: updater(macro),
    });
  };

  return (
    <div
      {...others}
      class={`${styles.root} ${local.class ?? ""}`.trim()}
    >
      <div class={styles.header}>
        <div class={styles["label-block"]}>
          <Show when={local.label}>
            <span class={styles.label}>{local.label}</span>
          </Show>
          <Show when={local.description}>
            <span class={styles.description}>{local.description}</span>
          </Show>
        </div>

        <div class={styles.actions}>
          <Button
            onClick={() =>
              recorder.isRecording()
                ? recorder.cancelRecording()
                : recorder.startRecording()
            }
            variant={recorder.isRecording() ? "primary" : "secondary"}
          >
            {recorder.isRecording() ? "Cancel Capture" : "Record Binding"}
          </Button>
          <Button
            disabled={!local.value}
            onClick={() => {
              recorder.clearRecording();
              local.onChange(null);
            }}
            variant="ghost"
          >
            Clear
          </Button>
        </div>
      </div>

      <div class={styles.summary}>
        <div>{summary()}</div>
        <Show when={recorder.isRecording()}>
          <div class={styles.status}>Listening for keyboard or controller input…</div>
        </Show>
        <Show when={scopeMissing()}>
          <div class={styles.warning}>
            Waiting for the recorded device to reconnect.
          </div>
        </Show>
      </div>

      <Show when={controllerMacro()}>
        {(macro) => (
          <div class={styles.editor}>
            <Dropdown
              label="Device Scope"
              value={macro().scope?.mode ?? "all-devices"}
              onChange={(value) =>
                updateControllerMacro((current) => ({
                  ...current,
                  scope:
                    value === "specific-device" && current.scope?.mode === "specific-device"
                      ? current.scope
                      : { mode: "all-devices" },
                }))
              }
              options={[
                { value: "all-devices", label: "All Devices" },
                { value: "specific-device", label: "Specific Device" },
              ]}
            />
            <Dropdown
              label="Trigger Mode"
              value={macro().triggerMode ?? "edge"}
              onChange={(value) =>
                updateControllerMacro((current) => ({
                  ...current,
                  triggerMode: value === "continuous" ? "continuous" : "edge",
                }))
              }
              options={[
                { value: "edge", label: "Edge" },
                { value: "continuous", label: "Continuous" },
              ]}
            />
            <Show when={firstControllerCondition()?.kind === "axis"}>
              <TextField
                label="Axis Threshold"
                value={String(axisThreshold())}
                onInput={(event) => {
                  const threshold = Number(event.currentTarget.value);
                  if (!Number.isFinite(threshold)) {
                    return;
                  }
                  updateControllerMacro((current) => ({
                    ...current,
                    conditions: current.conditions.map((condition, index) =>
                      index === 0 && condition.kind === "axis"
                        ? {
                            ...condition,
                            threshold: Math.min(Math.max(threshold, 0.05), 1),
                          }
                        : condition,
                    ),
                  }));
                }}
              />
            </Show>
          </div>
        )}
      </Show>
    </div>
  );
}

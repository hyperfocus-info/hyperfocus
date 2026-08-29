import { For, Show, createEffect, createMemo, createSignal } from "solid-js";
import { Trash2, Plus, Gamepad2 } from "lucide-solid";
import { PadPilot } from "../padpilot/index";
import styles from "./controller-preferences-modal.module.css";
import { ControllerInputPreview } from "./controller-input-preview";
import {
  CANONICAL_AXIS_LABELS,
  CANONICAL_BUTTON_LABELS,
  createDefaultControllerConfig,
  createTemplateCustomLayout,
  makeControllerStableId,
  normalizeControllerConfig,
  type PadPilotCustomControllerLayout,
} from "../padpilot/controller-config";
import type { PadPilotInputDeviceState } from "../padpilot/io/input-device";

type ControllerPreferencesModalProps = {
  open: boolean;
  onClose: () => void;
};

type LearnTarget =
  | { kind: "button"; index: number }
  | { kind: "axis"; index: number }
  | null;

function cloneLayout(layout: PadPilotCustomControllerLayout) {
  return {
    id: layout.id,
    name: layout.name,
    buttonBindings: layout.buttonBindings.map((binding) => ({ ...binding })),
    axisBindings: layout.axisBindings.map((binding) => ({ ...binding })),
  } satisfies PadPilotCustomControllerLayout;
}

function bindingLabel(binding: PadPilotCustomControllerLayout["buttonBindings"][number]) {
  if (binding.bindingKind === "button") {
    return `Button ${binding.sourceIndex}`;
  }
  if (binding.bindingKind === "axis-positive") {
    return `Axis ${binding.sourceIndex} +`;
  }
  if (binding.bindingKind === "axis-negative") {
    return `Axis ${binding.sourceIndex} -`;
  }
  return "Unassigned";
}

export function ControllerPreferencesModal(props: ControllerPreferencesModalProps) {
  const controllerConfig = PadPilot.hooks.useControllerConfig();
  const inputDevices = PadPilot.hooks.useInputDevices();
  const rows = createMemo(() => normalizeControllerConfig(controllerConfig.config()).rows);
  const customLayouts = createMemo(() => normalizeControllerConfig(controllerConfig.config()).customLayouts);
  const [customModalOpen, setCustomModalOpen] = createSignal(false);
  const [editingRowId, setEditingRowId] = createSignal("");
  const [draftLayout, setDraftLayout] = createSignal<PadPilotCustomControllerLayout>(createTemplateCustomLayout());
  const [selectedSavedLayoutId, setSelectedSavedLayoutId] = createSignal("");
  const [learnTarget, setLearnTarget] = createSignal<LearnTarget>(null);
  let previousDevices: PadPilotInputDeviceState[] = [];

  const deviceOptions = createMemo(() => {
    const optionMap = new Map<string, string>();
    optionMap.set("", "Unassigned");
    rows().forEach((row) => {
      if (!row.hardwareId) {
        return;
      }
      const liveDevice = inputDevices().find((device) => device.hardwareId === row.hardwareId);
      optionMap.set(row.hardwareId, liveDevice ? `${liveDevice.displayName} (${row.hardwareId})` : row.hardwareId);
    });
    inputDevices().forEach((device) => {
      if (!device.hardwareId) {
        return;
      }
      optionMap.set(device.hardwareId, `${device.displayName} (${device.hardwareId})`);
    });
    return [...optionMap.entries()].map(([value, label]) => ({ value, label }));
  });

  const openCustomEditor = (rowId: string) => {
    const row = rows().find((entry) => entry.stableId === rowId);
    const existingLayout = customLayouts().find((layout) => layout.id === row?.customLayoutId);
    setEditingRowId(rowId);
    setDraftLayout(cloneLayout(existingLayout ?? createTemplateCustomLayout(`Custom Layout ${rows().findIndex((entry) => entry.stableId === rowId) + 1}`)));
    setSelectedSavedLayoutId(existingLayout?.id ?? "");
    previousDevices = inputDevices().map((device) => ({
      ...device,
      axes: [...device.axes],
      buttons: [...device.buttons],
      rawAxes: [...device.rawAxes],
      rawButtons: [...device.rawButtons],
    }));
    setLearnTarget(null);
    setCustomModalOpen(true);
  };

  const updateConfig = (updater: (current: ReturnType<typeof normalizeControllerConfig>) => ReturnType<typeof normalizeControllerConfig>) => {
    controllerConfig.setConfig(updater(normalizeControllerConfig(controllerConfig.config())));
  };

  const updateRow = (rowId: string, next: Partial<ReturnType<typeof rows>[number]>) => {
    updateConfig((current) => ({
      ...current,
      rows: current.rows.map((row) => row.stableId === rowId ? { ...row, ...next } : row),
    }));
  };

  const setPrimaryRow = (rowId: string) => {
    updateConfig((current) => ({
      ...current,
      rows: current.rows.map((row) => ({ ...row, isPrimary: row.stableId === rowId })),
    }));
  };

  const addRow = () => {
    updateConfig((current) => ({
      ...current,
      rows: [...current.rows, {
        stableId: makeControllerStableId(),
        hardwareId: "",
        layoutKind: "auto",
        customLayoutId: "",
        isPrimary: false,
      }],
    }));
  };

  const deleteRow = (rowId: string) => {
    updateConfig((current) => {
      const remainingRows = current.rows.filter((row) => row.stableId !== rowId);
      if (remainingRows.length === 0) {
        return createDefaultControllerConfig();
      }
      if (!remainingRows.some((row) => row.isPrimary)) {
        remainingRows[0] = { ...remainingRows[0]!, isPrimary: true };
      }
      return {
        ...current,
        rows: remainingRows,
      };
    });
  };

  createEffect(() => {
    if (!customModalOpen()) {
      return;
    }
    const target = learnTarget();
    const row = rows().find((entry) => entry.stableId === editingRowId());
    const hardwareId = row?.hardwareId ?? "";
    const currentDevice = inputDevices().find((device) => device.hardwareId === hardwareId);
    const previousDevice = previousDevices.find((device) => device.hardwareId === hardwareId);
    previousDevices = inputDevices().map((device) => ({
      ...device,
      axes: [...device.axes],
      buttons: [...device.buttons],
      rawAxes: [...device.rawAxes],
      rawButtons: [...device.rawButtons],
    }));
    if (!target || !currentDevice) {
      return;
    }

    const pressedButtonIndex = currentDevice.rawButtons.findIndex((value, index) => value > 0.75 && (previousDevice?.rawButtons[index] ?? 0) <= 0.75);
    if (pressedButtonIndex >= 0 && target.kind === "button") {
      setDraftLayout((current) => ({
        ...current,
        buttonBindings: current.buttonBindings.map((binding, index) => index === target.index
          ? { bindingKind: "button", sourceIndex: pressedButtonIndex, threshold: 0.5 }
          : binding),
      }));
      setLearnTarget(null);
      return;
    }

    const movedAxisIndex = currentDevice.rawAxes.findIndex((value, index) =>
      Math.abs(value) > 0.5 && Math.abs(value - (previousDevice?.rawAxes[index] ?? 0)) > 0.35);
    if (movedAxisIndex < 0) {
      return;
    }

    if (target.kind === "button") {
      setDraftLayout((current) => ({
        ...current,
        buttonBindings: current.buttonBindings.map((binding, index) => index === target.index
          ? {
              bindingKind: currentDevice.rawAxes[movedAxisIndex]! >= 0 ? "axis-positive" : "axis-negative",
              sourceIndex: movedAxisIndex,
              threshold: 0.15,
            }
          : binding),
      }));
    } else {
      setDraftLayout((current) => ({
        ...current,
        axisBindings: current.axisBindings.map((binding, index) => index === target.index
          ? { sourceIndex: movedAxisIndex, inverted: currentDevice.rawAxes[movedAxisIndex]! < 0 }
          : binding),
      }));
    }
    setLearnTarget(null);
  });

  const saveCustomLayout = () => {
    const rowId = editingRowId();
    const layout = cloneLayout(draftLayout());
    updateConfig((current) => {
      const existingIndex = current.customLayouts.findIndex((entry) => entry.id === layout.id);
      const nextCustomLayouts = existingIndex >= 0
        ? current.customLayouts.map((entry, index) => index === existingIndex ? layout : entry)
        : [...current.customLayouts, layout];
      return {
        ...current,
        customLayouts: nextCustomLayouts,
        rows: current.rows.map((row) => row.stableId === rowId
          ? { ...row, layoutKind: "custom", customLayoutId: layout.id }
          : row),
      };
    });
    setCustomModalOpen(false);
    setLearnTarget(null);
  };

  return (
    <>
      <PadPilot.Modal
        open={props.open}
        onClose={props.onClose}
        title="Controller Preferences"
        description="Manage global controller mapping, primary-device routing, and reusable custom layouts."
        size="lg"
      >
        <div class={styles.panel}>
          <PadPilot.PreferencePanel
            title="Controller Routing"
            description="Rows are persisted in plugin state and restored with the project."
          >
            <PadPilot.PreferencePanel.Section
              title="Device Mappings"
              description="Assign each hardware device to a layout. Legacy PadPilot gamepad input follows the primary row."
            >
              <div class={styles["row-list"]}>
                <For each={rows()}>
                  {(row, index) => {
                    const liveDevice = createMemo(() => inputDevices().find((device) => device.hardwareId === row.hardwareId));
                    return (
                      <div class={styles["mapping-row"]}>
                        <div class={styles["mapping-row-header"]}>
                          <div class={styles["mapping-row-title"]}>
                            <strong>Device {index() + 1}</strong>
                            <span>{liveDevice()?.displayName || row.hardwareId || "No hardware assigned"}</span>
                          </div>
                          <div class={styles["mapping-row-actions"]}>
                            <PadPilot.Button
                              variant={row.isPrimary ? "primary" : "secondary"}
                              tooltip={row.isPrimary ? "Primary device" : "Make primary device"}
                              onClick={() => setPrimaryRow(row.stableId)}
                            >
                              {row.isPrimary ? "Primary" : "Make Primary"}
                            </PadPilot.Button>
                            <PadPilot.Button
                              tooltip="Edit custom controller layout"
                              onClick={() => openCustomEditor(row.stableId)}
                              icon={<Gamepad2 size={14} />}
                            >
                              Custom Layout
                            </PadPilot.Button>
                            <PadPilot.Button
                              variant="danger"
                              tooltip="Delete device mapping row"
                              icon={<Trash2 size={14} />}
                              onClick={() => deleteRow(row.stableId)}
                            >
                              Delete
                            </PadPilot.Button>
                          </div>
                        </div>
                        <div class={styles["mapping-row-fields"]}>
                          <PadPilot.Dropdown
                            label="Input Device"
                            value={row.hardwareId}
                            onChange={(hardwareId) => updateRow(row.stableId, { hardwareId })}
                            options={deviceOptions()}
                          />
                          <PadPilot.Dropdown
                            label="Layout"
                            value={row.layoutKind}
                            onChange={(layoutKind) => updateRow(row.stableId, { layoutKind: layoutKind as typeof row.layoutKind })}
                            options={[
                              { value: "auto", label: "Auto" },
                              { value: "xbox", label: "Xbox" },
                              { value: "playstation", label: "PlayStation" },
                              { value: "switch", label: "Switch" },
                              { value: "generic", label: "Generic" },
                              { value: "custom", label: "Custom" },
                            ]}
                          />
                        </div>
                      </div>
                    );
                  }}
                </For>
                <PadPilot.Button tooltip="Add a new controller mapping row" icon={<Plus size={14} />} onClick={addRow}>
                  Add Device
                </PadPilot.Button>
              </div>
            </PadPilot.PreferencePanel.Section>
            <PadPilot.PreferencePanel.Section
              title="Live Input Preview"
              description="Monitor connected controller activity across all devices or isolate one live device."
            >
              <ControllerInputPreview inputDevices={inputDevices()} />
            </PadPilot.PreferencePanel.Section>
          </PadPilot.PreferencePanel>
        </div>
      </PadPilot.Modal>

      <PadPilot.Modal
        open={customModalOpen()}
        onClose={() => {
          setCustomModalOpen(false);
          setLearnTarget(null);
        }}
        title="Custom Gamepad Layout"
        description="Learn raw buttons and axes from the selected device, save the layout, then assign it back to the row."
        size="lg"
        footer={(
          <div class={styles["footer-actions"]}>
            <PadPilot.Button variant="secondary" onClick={() => setCustomModalOpen(false)}>Cancel</PadPilot.Button>
            <PadPilot.Button variant="primary" onClick={saveCustomLayout}>Save Layout</PadPilot.Button>
          </div>
        )}
      >
        <div class={styles.panel}>
          <div class={styles["saved-layout-row"]}>
            <PadPilot.TextField
              label="Layout Name"
              value={draftLayout().name}
              onInput={(event) => setDraftLayout((current) => ({ ...current, name: event.currentTarget.value }))}
            />
            <PadPilot.Dropdown
              label="Load Saved Layout"
              value={selectedSavedLayoutId()}
              onChange={(layoutId) => {
                setSelectedSavedLayoutId(layoutId);
                const nextLayout = customLayouts().find((layout) => layout.id === layoutId);
                if (nextLayout) {
                  setDraftLayout(cloneLayout(nextLayout));
                }
              }}
              options={[
                { value: "", label: "Current Draft" },
                ...customLayouts().map((layout) => ({ value: layout.id, label: layout.name })),
              ]}
            />
          </div>

          <PadPilot.PreferencePanel title="Face Buttons" description="Learn common gamepad buttons and trigger sources.">
            <div class={styles["learn-grid"]}>
              <For each={CANONICAL_BUTTON_LABELS}>
                {(label, index) => (
                  <div class={styles["learn-item"]}>
                    <strong>{label}</strong>
                    <span>{bindingLabel(draftLayout().buttonBindings[index()]!)}</span>
                    <div class={styles["learn-actions"]}>
                      <PadPilot.Button
                        variant={learnTarget()?.kind === "button" && learnTarget()?.index === index() ? "primary" : "secondary"}
                        onClick={() => setLearnTarget({ kind: "button", index: index() })}
                      >
                        Learn
                      </PadPilot.Button>
                    </div>
                  </div>
                )}
              </For>
            </div>
          </PadPilot.PreferencePanel>

          <PadPilot.PreferencePanel title="Stick Axes" description="Assign raw axes for left and right stick movement.">
            <div class={styles["learn-grid"]}>
              <For each={CANONICAL_AXIS_LABELS}>
                {(label, index) => (
                  <div class={styles["learn-item"]}>
                    <strong>{label}</strong>
                    <span>
                      Axis {draftLayout().axisBindings[index()]?.sourceIndex ?? 0}
                      {draftLayout().axisBindings[index()]?.inverted ? " (inverted)" : ""}
                    </span>
                    <div class={styles["learn-actions"]}>
                      <PadPilot.Button
                        variant={learnTarget()?.kind === "axis" && learnTarget()?.index === index() ? "primary" : "secondary"}
                        onClick={() => setLearnTarget({ kind: "axis", index: index() })}
                      >
                        Learn
                      </PadPilot.Button>
                    </div>
                  </div>
                )}
              </For>
            </div>
          </PadPilot.PreferencePanel>

          <Show when={learnTarget()}>
            <div class={styles["status-line"]}>
              Listening for raw controller input on selected device…
            </div>
          </Show>
        </div>
      </PadPilot.Modal>
    </>
  );
}

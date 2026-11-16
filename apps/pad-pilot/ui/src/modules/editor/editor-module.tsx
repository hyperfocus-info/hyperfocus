import { controlButtonIndex } from "./control-button-index";
import { readEditorState } from "./editor-state-reader";
import { For, Show, createEffect, createMemo, createSignal, on, onCleanup } from "solid-js";
import { PadPilot } from "../../padpilot/index";
import { createProducerActions } from "../../padpilot/producer-actions";
import styles from "./editor-module.stylex";

type MappingItem = {
  control: string;
  actionType: "automation" | "daw" | "macro" | "midi" | "profile";
  profile?: string;
  target?: string;
};

type EditorState = {
  profileName: string;
  mappings: MappingItem[];
};

const DEFAULT_STATE: EditorState = {
  profileName: "Default",
  mappings: [{ control: "Button 0", actionType: "daw", profile: "Default", target: "SPACE" }],
};

const defaultTarget = (actionType: MappingItem["actionType"]) => {
  if (actionType === "midi") return "60";
  if (actionType === "automation") return "pp.macro.01";
  if (actionType === "profile") return "Default";
  return "SPACE";
};



/** EditorModule manages controller-to-action bindings. */
export function EditorModule() {
  const [state, setState] = PadPilot.hooks.useModuleState<EditorState>("editor", DEFAULT_STATE, readEditorState);
  const gamepad = PadPilot.hooks.useGamepad();
  const producer = createProducerActions("editor", {
    setProfile: (profileName) => setState({ profileName }),
  });
  const [isBinding, setIsBinding] = createSignal(false);
  const [capturedControl, setCapturedControl] = createSignal("");
  const [pendingAction, setPendingAction] = createSignal<MappingItem["actionType"]>("daw");
  const [pendingTarget, setPendingTarget] = createSignal(defaultTarget("daw"));
  const [lastButtons, setLastButtons] = createSignal<number[]>([]);
  const activeMappings = createMemo(() => state().mappings.filter((mapping) =>
    (mapping.profile?.trim() || "Default") === state().profileName));

  createEffect(on(gamepad, (current) => {
    const previousButtons = lastButtons();
    if (isBinding()) {
      const pressedIndex = current.buttons.findIndex((value, index) =>
        value > 0.75 && (previousButtons[index] ?? 0) <= 0.75);
      if (pressedIndex >= 0) setCapturedControl(`Button ${pressedIndex}`);
      setLastButtons([...current.buttons]);
      return;
    }

    for (const mapping of activeMappings()) {
      const buttonIndex = controlButtonIndex(mapping.control);
      if (buttonIndex < 0) continue;
      const pressed = (current.buttons[buttonIndex] ?? 0) > 0.75;
      const wasPressed = (previousButtons[buttonIndex] ?? 0) > 0.75;
      const target = mapping.target?.trim() || defaultTarget(mapping.actionType);
      if (mapping.actionType === "midi") {
        const note = Number(target);
        if (pressed && !wasPressed) producer.midi.noteOn(note, 110, 1);
        if (!pressed && wasPressed) producer.midi.noteOff(note, 0, 1);
      } else if (mapping.actionType === "automation") {
        if (pressed && !wasPressed && producer.automation.begin(target)) producer.automation.update(target, 1);
        if (!pressed && wasPressed) {
          producer.automation.update(target, 0);
          producer.automation.end(target);
        }
      } else if (pressed && !wasPressed && mapping.actionType === "profile") {
        producer.profile.select(target);
      } else if (pressed && !wasPressed) {
        producer.keyboard.execute([target]);
      }
    }
    setLastButtons([...current.buttons]);
  }));

  onCleanup(() => producer.dispose());

  const commitBinding = () => {
    const control = capturedControl();
    if (!control) return;
    setState({
      mappings: [...state().mappings, {
        control,
        actionType: pendingAction(),
        profile: state().profileName,
        target: pendingTarget().trim() || defaultTarget(pendingAction()),
      }],
    });
    setCapturedControl("");
    setIsBinding(false);
  };

  return (
    <PadPilot.ModuleWorkspace class={styles["module-root"]} style={{ "--pp-accent-color": "#bb76ff", "--pp-base-bg": "#241535" }}>
      <h2 class={styles.title}>Editor Module</h2>

      <PadPilot.Dropdown
        value={state().profileName}
        label="Profile"
        onChange={(profileName) => producer.profile.select(profileName)}
        options={[
          { value: "Default", label: "Default" },
          { value: "New", label: "New" },
        ]}
      />

      <div class={styles["mapping-list"]}>
        <For each={activeMappings()}>
          {(mapping) => (
            <div class={styles["mapping-item"]}>
              {mapping.control} → {mapping.actionType}: {mapping.target || defaultTarget(mapping.actionType)}
            </div>
          )}
        </For>
      </div>

      <div class={styles.row}>
        <PadPilot.Button onClick={() => setIsBinding(true)}>Add Binding</PadPilot.Button>
        <Show when={isBinding()}>
          <span>Press controller button…</span>
        </Show>
      </div>

      <Show when={capturedControl()}>
        <div class={styles.column}>
          <div>Captured: {capturedControl()}</div>
          <PadPilot.Dropdown
            value={pendingAction()}
            label="Binding Action"
            onChange={(value) => {
              if (value !== "daw" && value !== "macro" && value !== "midi" && value !== "automation" && value !== "profile") return;
              const actionType = value;
              setPendingAction(actionType);
              setPendingTarget(defaultTarget(actionType));
            }}
            options={[
              { value: "daw", label: "DAW Shortcut" },
              { value: "macro", label: "Keyboard Macro" },
              { value: "midi", label: "MIDI Note" },
              { value: "automation", label: "Automation Parameter" },
              { value: "profile", label: "Profile Switch" },
            ]}
          />
          <PadPilot.TextField
            label={pendingAction() === "midi"
              ? "MIDI Note"
              : pendingAction() === "profile"
                ? "Profile Name"
                : pendingAction() === "automation"
                  ? "Automation Parameter ID"
                  : "Shortcut"}
            value={pendingTarget()}
            onInput={(event) => setPendingTarget(event.currentTarget.value)}
          />
          <PadPilot.Button onClick={commitBinding}>Save Binding</PadPilot.Button>
        </div>
      </Show>
    </PadPilot.ModuleWorkspace>
  );
}

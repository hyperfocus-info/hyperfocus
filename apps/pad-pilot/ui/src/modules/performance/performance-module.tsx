import { createEffect, createSignal, on, onCleanup } from "solid-js";
import { PadPilot } from "../../padpilot/index";
import { createProducerActions } from "../../padpilot/producer-actions";
import { mapStickToMidiNote, type RootNote, type ScaleMode } from "./note-mapper";
import styles from "./performance-module.module.css";

type PerformanceState = {
  root: RootNote;
  scale: ScaleMode;
  octave: number;
  profileName: string;
  currentModifier: number;
};

const DEFAULT_STATE: PerformanceState = {
  root: "C",
  scale: "major",
  octave: 4,
  profileName: "Default",
  currentModifier: 0
};

/**
 * PerformanceModule maps controller input to musical performance actions.
 */
export function PerformanceModule() {
  const [state, setState] = PadPilot.hooks.useModuleState<PerformanceState>("performance", DEFAULT_STATE);
  const gamepad = PadPilot.hooks.useGamepad();
  const midi = PadPilot.hooks.useMidi();
  const producer = createProducerActions("performance", {
    onMidiEvent: (event) => {
      if (event.type === "note-on" && event.note !== undefined && event.velocity !== undefined) {
        midi.emit({ note: event.note, velocity: event.velocity, channel: event.channel });
      }
    },
    setProfile: (profileName) => setState({ profileName }),
  });
  const [lastNote, setLastNote] = createSignal<number | null>(null);
  const [lastButtons, setLastButtons] = createSignal<number[]>([]);

  createEffect(on(gamepad, (current) => {
    if (!current.connected) {
      const previousNote = lastNote();
      if (previousNote !== null) producer.midi.noteOff(previousNote, 0, 1);
      setLastNote(null);
      return;
    }
    const previousButtons = lastButtons();

    const lbPressed = current.buttons[4] > 0.75;
    const rbPressed = current.buttons[5] > 0.75;
    const lbWasPressed = (previousButtons[4] ?? 0) > 0.75;
    const rbWasPressed = (previousButtons[5] ?? 0) > 0.75;
    if (lbPressed && !lbWasPressed) setState({ octave: clamp(state().octave - 1, 1, 8) });
    if (rbPressed && !rbWasPressed) setState({ octave: clamp(state().octave + 1, 1, 8) });

    const selectPressed = current.buttons[8] > 0.75;
    const selectWasPressed = (previousButtons[8] ?? 0) > 0.75;
    if (selectPressed && !selectWasPressed) producer.transport.executeShortcut("R");

    const startPressed = current.buttons[9] > 0.75;
    const startWasPressed = (previousButtons[9] ?? 0) > 0.75;
    if (startPressed && !startWasPressed) producer.transport.executeShortcut("SPACE");

    const leftX = current.axes[0] ?? 0;
    const leftY = current.axes[1] ?? 0;
    const directionalModifier = Math.round(Math.min(7, Math.hypot(leftX, leftY) * 7));
    const dPadModifier =
      (current.buttons[12] > 0.75 ? 1 : 0) +
      (current.buttons[13] > 0.75 ? 2 : 0) +
      (current.buttons[14] > 0.75 ? 3 : 0) +
      (current.buttons[15] > 0.75 ? 4 : 0);
    const modifier = clamp(Math.max(directionalModifier, dPadModifier), 0, 7);
    if (modifier !== state().currentModifier) {
      setState({ currentModifier: modifier });
    }

    const note = mapStickToMidiNote({
      x: current.axes[2] ?? 0,
      y: current.axes[3] ?? 0,
      root: state().root,
      scale: state().scale,
      octave: state().octave,
      modifier
    });

    const previousNote = lastNote();
    if (note !== previousNote) {
      if (previousNote !== null) producer.midi.noteOff(previousNote, 0, 1);
      if (note !== null) producer.midi.noteOn(note, 110, 1);
      setLastNote(note);
    }
    setLastButtons([...current.buttons]);
  }));

  onCleanup(() => producer.dispose());

  return (
    <section class={styles["module-root"]} style={{ "--pp-accent-color": "#49ff79", "--pp-base-bg": "#122817" }}>
      <h2 class={styles.title}>Performance Module</h2>

      <div class={styles["grid-2"]}>
        <PadPilot.Dropdown
          value={state().root}
          label="Root Note"
          onChange={(root) => setState({ root: root as RootNote })}
          options={["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"].map((value) => ({
            value,
            label: value
          }))}
        />
        <PadPilot.Dropdown
          value={state().scale}
          label="Scale"
          onChange={(scale) => setState({ scale: scale as ScaleMode })}
          options={[
            { value: "major", label: "Major" },
            { value: "minor", label: "Minor" }
          ]}
        />
      </div>

      <div class={styles.row}>
        <PadPilot.Button>LB/RB Octave: {state().octave}</PadPilot.Button>
        <PadPilot.Button>Select = R Shortcut</PadPilot.Button>
        <PadPilot.Button>Start = Space Shortcut</PadPilot.Button>
      </div>

      <div class={styles.column}>
        <span>Modifier Interval: +{state().currentModifier}</span>
        <span>Last MIDI Note: {midi.latest()?.note ?? "--"}</span>
        <span>Profile: {state().profileName}</span>
      </div>
    </section>
  );
}
import { clamp } from "../../utils/math";

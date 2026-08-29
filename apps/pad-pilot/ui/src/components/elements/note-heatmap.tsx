import { For, Show, createMemo, createSignal, splitProps, type JSX } from "solid-js";
import {
  frequencyForMidiNote,
  midiNoteLabel,
} from "../../modules/analyzer/analyzer-state";
import { clamp } from "../../utils/math";
import styles from "./note-heatmap.stylex";

type NoteHeatmapClassNames = {
  event: string;
  events: string;
  laneButton: string;
  lanes: string;
  readout: string;
  root: string;
  viewport: string;
};

export type NoteHeatmapEvent = {
  midiNote: number;
  startFrame: number;
  endFrame: number;
  intensity: number;
  velocity: number;
};

/** Props for NoteHeatmap. */
export type NoteHeatmapProps = Omit<JSX.HTMLAttributes<HTMLDivElement>, "onChange"> & {
  /** Optional slot-level class overrides for internal heatmap parts. */
  classNames?: Partial<NoteHeatmapClassNames>;
  /** Total analyzed frame count used to place note blocks on the timeline. */
  frameCount: number;
  /** Optional live lane energies keyed by MIDI note. */
  laneEnergies?: readonly number[];
  /** Highest visible MIDI lane. */
  maxMidiNote: number;
  /** Lowest visible MIDI lane. */
  minMidiNote: number;
  /** Detected note events to render in the piano-roll heatmap. */
  noteEvents: readonly NoteHeatmapEvent[];
  /** Active tuning reference used for the hover frequency readout. */
  tuningHz?: number;
};

/** NoteHeatmap renders reusable analyzer note lanes with hover readout and note activity blocks. */
export function NoteHeatmap(props: NoteHeatmapProps) {
  const callHandler = (handler: unknown, event: Event) => {
    if (typeof handler === "function") {
      (handler as (value: Event) => void)(event);
    }
  };
  const [local, others] = splitProps(props, [
    "class",
    "classNames",
    "frameCount",
    "laneEnergies",
    "maxMidiNote",
    "minMidiNote",
    "noteEvents",
    "onPointerLeave",
    "tuningHz",
  ]);
  const [hoveredMidiNote, setHoveredMidiNote] = createSignal<number | null>(null);

  const resolvedMinMidiNote = createMemo(() => Math.max(0, Math.round(local.minMidiNote)));
  const resolvedMaxMidiNote = createMemo(() => Math.min(127, Math.round(local.maxMidiNote)));
  const lanes = createMemo(() => {
    const items: number[] = [];
    for (let midiNote = resolvedMaxMidiNote(); midiNote >= resolvedMinMidiNote(); midiNote -= 1) {
      items.push(midiNote);
    }
    return items;
  });
  const laneCount = createMemo(() => Math.max(1, lanes().length));
  const laneHeightPercent = createMemo(() => 100 / laneCount());
  const totalFrames = createMemo(() => {
    const noteFrames = local.noteEvents.reduce((maxFrame, event) => Math.max(maxFrame, event.endFrame), 0);
    return Math.max(1, local.frameCount, noteFrames);
  });
  const eventRects = createMemo(() =>
    local.noteEvents.map((event) => {
      const laneIndex = resolvedMaxMidiNote() - event.midiNote;
      return {
        height: laneHeightPercent(),
        intensity: clamp(event.intensity > 0 ? event.intensity : event.velocity / 127, 0.12, 1),
        key: `${event.midiNote}-${event.startFrame}-${event.endFrame}`,
        left: (event.startFrame / totalFrames()) * 100,
        noteLabel: midiNoteLabel(event.midiNote),
        top: laneIndex * laneHeightPercent(),
        width: Math.max(0.9, ((Math.max(event.endFrame, event.startFrame + 1) - event.startFrame) / totalFrames()) * 100),
      };
    }),
  );
  const hoveredLabel = createMemo(() => {
    const midiNote = hoveredMidiNote();
    if (midiNote === null) {
      return null;
    }
    return {
      frequencyHz: frequencyForMidiNote(midiNote, local.tuningHz ?? 440),
      note: midiNoteLabel(midiNote),
    };
  });

  return (
    <div
      {...others}
      class={`${styles.root} ${local.class ?? ""} ${local.classNames?.root ?? ""}`.trim()}
      onPointerLeave={(event) => {
        setHoveredMidiNote(null);
        callHandler(local.onPointerLeave, event);
      }}
    >
      <div class={`${styles.viewport} ${local.classNames?.viewport ?? ""}`.trim()}>
        <div class={`${styles.lanes} ${local.classNames?.lanes ?? ""}`.trim()}>
          <For each={lanes()}>
            {(midiNote, index) => (
              <button
                type="button"
                class={`${styles["lane-button"]} ${local.classNames?.laneButton ?? ""}`.trim()}
                aria-label={`${midiNoteLabel(midiNote)} lane`}
                style={{
                  "--pp-lane-energy": String(clamp(local.laneEnergies?.[midiNote] ?? 0, 0, 1)),
                  height: `${laneHeightPercent()}%`,
                  top: `${index() * laneHeightPercent()}%`,
                }}
                onFocus={() => setHoveredMidiNote(midiNote)}
                onPointerEnter={() => setHoveredMidiNote(midiNote)}
              >
                <span class={styles["lane-label"]}>{midiNoteLabel(midiNote)}</span>
              </button>
            )}
          </For>
        </div>
        <div class={`${styles.events} ${local.classNames?.events ?? ""}`.trim()}>
          <For each={eventRects()}>
            {(eventRect) => (
              <div
                class={`${styles.event} ${local.classNames?.event ?? ""}`.trim()}
                aria-hidden="true"
                data-note={eventRect.noteLabel}
                style={{
                  "--pp-event-intensity": String(eventRect.intensity),
                  height: `${eventRect.height}%`,
                  left: `${eventRect.left}%`,
                  top: `${eventRect.top}%`,
                  width: `${eventRect.width}%`,
                }}
              />
            )}
          </For>
        </div>
        <div class={`${styles.readout} ${local.classNames?.readout ?? ""}`.trim()}>
          <Show
            when={hoveredLabel()}
            fallback={<span class={styles["readout-placeholder"]}>Hover a lane</span>}
          >
            {(label) => (
              <>
                <strong class={styles["readout-strong"]}>{label().note}</strong>
                <span class={styles["readout-span"]}>{label().frequencyHz.toFixed(2)} Hz</span>
              </>
            )}
          </Show>
        </div>
      </div>
    </div>
  );
}

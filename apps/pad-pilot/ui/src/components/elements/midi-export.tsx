import { splitProps, type JSX } from "solid-js";
import { Button } from "./button";
import styles from "./midi-export.module.css";

type MidiExportClassNames = {
  actions: string;
  dragButton: string;
  root: string;
  saveButton: string;
  status: string;
  title: string;
};

/** Props for MidiExport. */
export type MidiExportProps = Omit<JSX.HTMLAttributes<HTMLDivElement>, "onChange"> & {
  /** Optional slot-level class overrides for internal export parts. */
  classNames?: Partial<MidiExportClassNames>;
  /** Disables drag and save actions when no finalized take is available. */
  disabled?: boolean;
  /** Starts the native MIDI drag/export flow. */
  onDragExport: () => void;
  /** Starts the native save-to-disk flow. */
  onSaveExport: () => void;
  /** Optional title text shown above the action row. */
  title?: string;
};

/** MidiExport renders reusable drag-and-save MIDI actions for analyzer-style modules. */
export function MidiExport(props: MidiExportProps) {
  const [local, others] = splitProps(props, [
    "class",
    "classNames",
    "disabled",
    "onDragExport",
    "onSaveExport",
    "title",
  ]);

  return (
    <div
      {...others}
      class={`${styles.root} ${local.class ?? ""} ${local.classNames?.root ?? ""}`.trim()}
      role="group"
      aria-label={local.title ?? "Export MIDI"}
    >
      <strong class={`${styles.title} ${local.classNames?.title ?? ""}`.trim()}>
        {local.title ?? "Export MIDI"}
      </strong>
      <div class={`${styles.actions} ${local.classNames?.actions ?? ""}`.trim()}>
        <Button
          class={`${styles["drag-button"]} ${local.classNames?.dragButton ?? ""}`.trim()}
          disabled={local.disabled}
          draggable={!local.disabled}
          onClick={() => {
            if (!local.disabled) {
              local.onDragExport();
            }
          }}
          onDragStart={(event) => {
            event.preventDefault();
            if (!local.disabled) {
              local.onDragExport();
            }
          }}
        >
          Drag MIDI
        </Button>
        <Button
          class={`${styles["save-button"]} ${local.classNames?.saveButton ?? ""}`.trim()}
          disabled={local.disabled}
          onClick={() => {
            if (!local.disabled) {
              local.onSaveExport();
            }
          }}
        >
          Save MIDI
        </Button>
      </div>
      <span class={`${styles.status} ${local.classNames?.status ?? ""}`.trim()}>
        {local.disabled ? "Stop recording to enable export." : "Drag into the DAW or save a MIDI clip."}
      </span>
    </div>
  );
}


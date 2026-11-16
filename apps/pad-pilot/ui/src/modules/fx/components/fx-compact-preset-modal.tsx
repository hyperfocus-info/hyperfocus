import { errorMessage } from "./utils/fx-compact-preset-modal-values";
import { FileInput } from "lucide-solid";
import { createEffect, createSignal, Show } from "solid-js";
import { PadPilot } from "../../../padpilot/index";
import { MAX_COMPACT_FX_PRESET_CODE_CHARS } from "../fx-compact-preset";
import { useFxModuleActions } from "../fx-module-store";
import styles from "../styles/fx-module.stylex";

export type FxCompactPresetModalProps = {
  /** Whether the controlled compact-Preset dialog is visible. */
  open: boolean;
};



/** Applies a paste-safe protobuf Preset envelope to canonical FX Module state. */
export function FxCompactPresetModal(props: FxCompactPresetModalProps) {
  const actions = useFxModuleActions();
  const [code, setCode] = createSignal("");
  const [error, setError] = createSignal("");

  createEffect(() => {
    if (props.open) {
      setCode("");
      setError("");
    }
  });

  const close = () => actions.modulePresets.setCompactOpen(false);
  const apply = () => {
    try {
      actions.modulePresets.applyCompact(code());
      close();
    } catch (caught) {
      setError(errorMessage(caught));
    }
  };

  return (
    <PadPilot.Modal
      description="Paste a ppfx1 code. It is a Base64 transport wrapper around the protobuf PresetFile used by PadPilot."
      footer={
        <PadPilot.Button icon={<FileInput size={14} />} onClick={apply} disabled={!code().trim()} tooltip="Replace the working FX graph with this preset state">
          Apply State
        </PadPilot.Button>
      }
      onClose={close}
      open={props.open}
      size="lg"
      title="Set FX State"
    >
      <div class={styles["compact-preset-form"]}>
        <PadPilot.TextAreaField
          controlClass={styles["compact-preset-form-textarea"]}
          autocomplete="off"
          description="Applying is undoable and syncs through canonical host state. Use Save New afterward to add it to your preset library."
          label="Compressed preset code"
          maxlength={MAX_COMPACT_FX_PRESET_CODE_CHARS}
          onInput={(event) => {
            setCode(event.currentTarget.value);
            setError("");
          }}
          placeholder="ppfx1:..."
          spellcheck={false}
          value={code()}
        />
        <Show when={error()}>
          <p class={styles["compact-preset-error"]} role="alert">{error()}</p>
        </Show>
      </div>
    </PadPilot.Modal>
  );
}

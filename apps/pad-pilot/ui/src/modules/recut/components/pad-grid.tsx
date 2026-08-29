import { For } from "solid-js";
import styles from "../recut-module.module.css";
import { PadPilot } from "../../../padpilot/index";
import { useRecutModuleStore } from "../recut-module-store";
import { RECUT_PAD_LABELS } from "../recut-state";
import { joinElementClasses } from "../../../components/elements/element-helpers";

export function PadGrid() {
  const store = useRecutModuleStore();

  return (
    <section class={styles["pad-grid"]}>
      <div class={styles["section-label"]}>Pads</div>
      <div class={styles["pad-grid-inner"]}>
        <For each={RECUT_PAD_LABELS}>
          {(label, index) => {
            const assignment = () => store.derived.padAssignments()[index()] ?? null;
            const isEmpty = () => assignment()?.isEmpty ?? false;
            const isHeld = () => store.derived.heldPadIndices().includes(index());
            const isPlaying = () => store.derived.playingPadIndices().includes(index());
            const className = () => joinElementClasses(
              styles["pad-cell"],
              store.derived.activePadIndex() === index() ? styles["is-active"] : undefined,
              !isEmpty() && store.derived.selectedMarkerIndex() === (assignment()?.sliceIndex ?? index()) ? styles["is-armed"] : undefined,
              isHeld() ? styles["is-held"] : undefined,
              isPlaying() ? styles["is-playing"] : undefined,
              isEmpty() ? styles["is-empty"] : undefined,
            );
            return (
              <PadPilot.Button
                variant="secondary"
                class={className()}
                disabled={isEmpty()}
                onPointerDown={() => store.actions.triggerPad(index(), true)}
                onPointerUp={() => store.actions.triggerPad(index(), false)}
                onPointerLeave={() => {
                  if (isHeld() && !isEmpty()) {
                    store.actions.triggerPad(index(), false);
                  }
                }}
              >
                <span>{label}</span>
                <small>{isEmpty() ? "Empty" : `Slice ${(assignment()?.sliceIndex ?? index()) + 1}`}</small>
              </PadPilot.Button>
            );
          }}
        </For>
      </div>
    </section>
  );
}

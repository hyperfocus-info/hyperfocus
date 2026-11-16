import { formatFileSize } from "./utils/update-modal-values";
import { Show } from "solid-js";
import { Button } from "./elements/button";
import { Modal } from "./elements/modal";
import { useMarketplaceStore } from "../state/marketplace-store";
import styles from "./update-modal.stylex";



export function UpdateModal() {
  const { actions, state } = useMarketplaceStore();

  return (
    <Modal
      closeOnBackdrop
      description="PadPilot can stage a newer build and apply it after the host process exits."
      onClose={actions.dismissUpdateModal}
      open={state.updater.modalOpen}
      size="md"
      title="PadPilot Update"
    >
      <div class={styles["update-modal-layout"]}>
        <Show
          when={state.updater.stagedUpdate}
          fallback={
            <>
              <p class={styles["update-copy"]}>
                Version {state.updater.availableRelease?.latestVersion ?? "unknown"} is available on the {state.updater.channel} channel.
              </p>
              <p class={styles["update-meta"]}>
                Download size: {formatFileSize(state.updater.availableRelease?.artifactSizeBytes ?? 0)}
              </p>
              <p class={styles["update-notes"]}>{state.updater.availableRelease?.releaseNotes || "No release notes were published for this build."}</p>
              <p class={styles["update-meta"]}>
                The patch will be staged now and applied after PadPilot and your host process close.
              </p>
              <Show when={state.updater.lastError}>
                <p class={styles["update-error"]}>{state.updater.lastError}</p>
              </Show>
              <Show when={state.updater.downloadProgress}>
                <p class={styles["update-meta"]}>{state.updater.downloadProgress}</p>
              </Show>
              <div class={styles["update-actions"]}>
                <Button type="button" variant="secondary" class={styles["update-secondary"]} onClick={actions.dismissUpdateModal}>
                  Later
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  class={styles["update-primary"]}
                  disabled={state.updater.checkStatus === "downloading"}
                  onClick={() => actions.stageAvailableUpdate()}
                >
                  {state.updater.checkStatus === "downloading" ? "Staging..." : "Update"}
                </Button>
              </div>
            </>
          }
        >
          {(staged) => (
            <>
              <p class={styles["update-copy"]}>PadPilot {staged().targetVersion} is staged and ready to apply.</p>
              <p class={styles["update-notes"]}>{staged().message}</p>
              <p class={styles["update-meta"]}>Updater log: {staged().logPath}</p>
              <Show
                when={state.updater.hostMode === "standalone"}
                fallback={<p class={styles["update-meta"]}>Close your DAW or host process to finish the update.</p>}
              >
                <div class={styles["update-actions"]}>
                  <Button type="button" variant="secondary" class={styles["update-secondary"]} onClick={actions.dismissUpdateModal}>
                    Later
                  </Button>
                  <Button type="button" variant="primary" class={styles["update-primary"]} onClick={() => actions.restartAndApplyUpdate()}>
                    Restart and apply
                  </Button>
                </div>
              </Show>
            </>
          )}
        </Show>
      </div>
    </Modal>
  );
}
